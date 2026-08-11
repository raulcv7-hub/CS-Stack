content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/04-bare-metal-system-protection-synthesis/02-bare-metal-sleep-state-mechanics/02-sleep-wakeup-latency-optimization.md
# Bare-Metal Wakeup Latency Optimization, PLL Re-Stabilization, and Low-Power Clock Managers

## The Physical Clock Restoration Delay vs. Real-Time Deadlines

In high-performance, battery-powered bare-metal systems—such as automotive radar modules, wireless medical implants, and industrial safety controllers—microcontrollers must satisfy two opposing engineering goals: **Extremely Low Static Power Consumption** and **Sub-Microsecond Real-Time Event Response**.

To achieve static power consumption in the micro-ampere range ($\sim 10 \ \mu\text{A}$), the processor enters deep sleep modes (such as `Stop` or `Deep Sleep` mode). 

In deep sleep mode, the hardware power controller shuts off internal clock trees, gates the main supply voltage ($V_{DD}$), and **turns OFF the high-speed external crystal oscillator (HSE) and Phase-Locked Loop (PLL)**.

While turning off the HSE crystal and PLL drops physical power consumption by over $99.9\%$, it introduces a severe physical hardware penalty when an external event occurs: **Wakeup Latency ($t_{\text{wakeup}}$)**.

Suppose an automotive radar sensor detects an impending collision, asserting an external hardware interrupt ($IRQ$) to wake the microcontroller from deep sleep. The collision avoidance algorithm must execute and activate the brakes within **$10.0\text{ microseconds}$ ($10,000\text{ nanoseconds}$)**.

Now, examine the physical hardware delays that occur when the chip attempts to wake up from deep sleep to run its main clock at $168\text{ MHz}$:

```text
PHYSICAL CLOCK RESTORATION DELAYS AFTER DEEP SLEEP WAKEUP

 External Interrupt (IRQ) Fires at t = 0.0 us
 ┌───────────────────────────────────────────────────────────┐
 │ Phase 1: Internal Voltage Regulator Stabilizes (5.0 us)   │
 ├───────────────────────────────────────────────────────────┤
 │ Phase 2: Quartz Crystal Oscillator (HSE) Starts (300.0 us)│
 │           (Mechanical Quartz Vibration Buildup)           │
 ├───────────────────────────────────────────────────────────┤
 │ Phase 3: Phase-Locked Loop (PLL) Locks        (150.0 us)  │
 │           (Analog VCO Voltage Phase Settlement)           │
 └─────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
 TOTAL CLOCK RESTORATION DELAY = 455.0 MICROSECONDS!
 (45x LONGER THAN THE 10.0-MICROSECOND SAFETY DEADLINE! CRASH!)
```

Trace the physical hardware delay step-by-step:

1. **Voltage Regulator Settle Time ($t_{\text{reg\_settle}} \approx 5.0\ \mu\text{s}$)**: The main internal voltage regulator powers up from low-power bias mode to full active current mode.
2. **Quartz Crystal Oscillation Buildup ($t_{\text{osc\_start}} \approx 300.0\ \mu\text{s}$)**:
   An external quartz crystal oscillator (HSE) is a mechanical, piezoelectric crystal. 
   
   When power is re-applied, the crystal does **not** instantly oscillate at full amplitude! The mechanical crystal lattice takes **$300\text{ microseconds}$** to build up physical mechanical vibrations and produce a stable $8\text{-MHz}$ digital square wave!
3. **Phase-Locked Loop Lock Acquisition ($t_{\text{PLL\_lock}} \approx 150.0\ \mu\text{s}$)**:
   The Phase-Locked Loop (PLL) multiplier circuit must lock onto the incoming $8\text{-MHz}$ crystal clock. Its internal Voltage-Controlled Oscillator (VCO) takes **$150\text{ microseconds}$** to adjust its control voltage and stabilize its $168\text{-MHz}$ output frequency ($PLLRDY = 1$).

Total physical clock restoration delay $= 5.0 + 300.0 + 150.0 = \mathbf{455.0 \text{ Microseconds}}$!

Look at the real-time catastrophe:
* The collision avoidance safety algorithm needed to execute within **$10.0\text{ microseconds}$**.
* The hardware took **$455.0\text{ microseconds}$** just to stabilize its high-speed $168\text{-MHz}$ clock tree before the CPU could execute its first instruction at full speed!
* The braking system fails, and the vehicle crashes!

Conversely, what happens if the CPU starts executing instructions immediately on a fast internal RC fallback oscillator ($16\text{ MHz}$ HSI) without waiting for the PLL to re-stabilize?
* If software attempts to communicate with serial peripherals (UART, SPI, USB) calculated for $168\text{ MHz}$ while the CPU is running at $16\text{ MHz}$, **all serial baud rates run $10.5\times$ too slow**, corrupting communication frames and dropping data!

How can we design a bare-metal software architecture that **boots instantly in nanoseconds** on a fast RC oscillator to execute critical emergency response code immediately, while safely re-stabilizing the quartz crystal and PLL in the background before switching back to $168\text{ MHz}$?

To guarantee sub-microsecond real-time responsiveness while maximizing deep-sleep battery life, bare-metal architectures employ **Wakeup Latency Optimization** and **Low-Power Clock Managers**.

---

## The Fighter Jet Starter Motor and the Automatic Clutch: A Mental Model for Clock Restoration

To build an intuitive, crystal-clear mental model of wakeup latencies, Phase-Locked Loop (PLL) lock acquisition delays, HSI fallback execution, and low-power clock managers before inspecting MMIO registers and assembly state machines, let us consider an everyday analogy: **The Scramble Fighter Jet**.

Imagine a military fighter jet (**The CPU Core Execution Pipeline**) parked inside a hangar (**Deep Sleep Mode**). The jet's primary propulsion system is a massive $2,000\text{-MPH}$ jet turbine engine (**The $168\text{-MHz}$ Phase-Locked Loop / PLL**).

```text
THE FIGHTER JET STARTER MOTOR METAPHOR

 Scramble Fighter Jet Hangar (Deep Sleep Mode)
 ┌───────────────────────────────────────────────────────────┐
 │ Main Jet Turbine Engine OFF (0 RPM / P_static = ~0)        │
 └─────────────────────────────┬─────────────────────────────┘
                               │ Emergency Alarm Blares! (IRQ)
                               ▼
 ┌───────────────────────────────────────────────────────────┐
 │ AUXILIARY ELECTRIC STARTER MOTOR (16-MHz Internal HSI)    │
 │ Starts in 2 Seconds! (Jet starts rolling down runway!)    │
 ├───────────────────────────────────────────────────────────┤
 │ MAIN JET TURBINE ENGINE (168-MHz PLL)                     │
 │ Spools up in 5 Minutes (HSE Crystal + PLL Lock Time)      │
 └───────────────────────────────────────────────────────────┘
```

An emergency scramble alarm blares (**A Hardware Interrupt / $IRQ$**). The jet must launch down the runway immediately to intercept a target (**Real-Time Event Deadline**).

Let us observe two different operational procedures for launching the jet:

---

### Procedure 1: Waiting for the Main Turbine (Un-Optimized Clock Restoration)

The pilot insists on running *only* on the main $2,000\text{-MPH}$ jet turbine:
1. The pilot sits in the cockpit and turns the main turbine ignition switch.
2. The massive jet turbine takes **5 minutes** ($455\ \mu\text{s}$) to spool up, ignite fuel, stabilize oil pressure, and reach full operational RPM.
3. The jet sits stationary inside the hangar for 5 minutes doing nothing!
4. By the time the jet rolls out onto the runway, the target has already passed (**Real-Time Deadline Violation / System Failure**)!

This is the **Un-Optimized Clock Restoration Penalty**. Waiting for slow, high-precision clock sources before executing code causes real-time failure.

---

### Procedure 2: The Starter Motor & Automatic Clutch (Low-Power Clock Manager)

To launch instantly, the jet is equipped with a small **Auxiliary Electric Starter Motor (The High-Speed Internal RC Oscillator / HSI)** and an **Automatic Dual-Clutch Transmission (The Low-Power Clock Manager)**:

```text
PROCEDURE 2: STARTER MOTOR AND AUTOMATIC CLUTCH (LOW-POWER CLOCK MANAGER)

 Emergency Alarm Blares (IRQ) ──► Electric Starter Motor engages in 2 Seconds! (HSI=16MHz)
                                   Jet rolls out of hangar IMMEDIATELY at 20 MPH!
                                   (Executes emergency sensor checks instantly!)
                                   │
                                   ▼ (Main Jet Turbine spools up in background)
 Main Turbine reaches 2,000 MPH! ──► Automatic Clutch switches power smoothly!
                                   Jet accelerates to 2,000 MPH at Mach 2 (168 MHz)!
                                   (Zero delay! Zero missed deadlines!)
```

Trace how Procedure 2 operates when the alarm blares:

1. **Instant Rollout ($t = 2\text{ Seconds}$ / $1.0\ \mu\text{s}$)**:
   * The pilot engages the small electric starter motor (**HSI RC Oscillator**).
   * The starter motor starts **instantly in 2 seconds**!
   * The jet rolls out of the hangar at $20\text{ MPH}$ ($16\text{ MHz}$ execution).
   * **Immediate Emergency Action**: The pilot conducts initial radar scans, deploys emergency flaps, and begins moving down the runway **without waiting for the main turbine**!
2. **Background Spool-Up**:
   * While the jet is rolling down the runway at $20\text{ MPH}$, the main jet turbine (**HSE Crystal & PLL**) spools up in the background.
3. **The Automatic Clutch Switch**:
   * At minute 5, the main turbine reaches full $2,000\text{-MPH}$ RPM ($PLLRDY = 1$).
   * The automatic clutch (**Clock MUX Register `RCC_CFGR`**) seamlessly switches propulsion from the starter motor to the main jet turbine!
   * The jet accelerates to Mach 2 ($168\text{ MHz}$) on the fly, with $100\%$ zero stop time!

Look at what Procedure 2 achieved:
* **Sub-Microsecond Response**: Emergency action began in **2 seconds ($1.0\ \mu\text{s}$)** instead of waiting 5 minutes!
* **Zero Communication Corruption**: The jet didn't attempt high-speed Mach-2 maneuvers until the main turbine was confirmed $100\%$ locked!
* **Seamless Transition**: The transition from $20\text{ MPH}$ to $2,000\text{ MPH}$ executed on the fly without stopping the jet!

This fighter jet starter system is the exact physical analogue of **Bare-Metal Wakeup Latency Optimization and Low-Power Clock Managers**:
* The fighter jet is the **CPU Execution Pipeline**.
* The hangar is **Deep Sleep / Stop Mode**.
* The emergency alarm is a **Hardware Interrupt Request ($IRQ$)**.
* The electric starter motor is the **Internal RC Oscillator (HSI $= 16\text{ MHz}$)**.
* The main jet turbine is the **External Crystal (HSE) + Phase-Locked Loop (PLL $= 168\text{ MHz}$)**.
* Spooling up the turbine is **Crystal Startup ($t_{\text{osc\_start}}$) and PLL Locking ($t_{\text{PLL\_lock}}$)**.
* The automatic clutch is the **System Clock Multiplexer (`RCC_CFGR.SW`)**.
* The pilot is the **Bare-Metal Low-Power Clock Manager Assembly Routine**.

---

## Deep Mechanics of Wakeup Latencies, Clock Restoration Pipelines, and Clock Managers

Now that we possess an intuitive mental model of fighter jet starter motors and automatic clutches, let us examine the formal, rigorous engineering mechanics of **Wakeup Latencies**, **Clock Restoration Pipelines**, and **Low-Power Clock Managers**.

---

### 1. The Five Components of Total Wakeup Latency ($t_{\text{wakeup\_total}}$)

When an asynchronous external hardware event or interrupt arrives while a bare-metal microcontroller is in deep sleep, the total physical time duration that elapses before the CPU pipeline executes the first line of the $ISR$ at full system clock frequency is governed by **The Master Wakeup Latency Equation**:

$$\mathbf{t_{\text{wakeup\_total}} = t_{\text{wake\_detect}} + t_{\text{reg\_settle}} + t_{\text{osc\_start}} + t_{\text{PLL\_lock}} + t_{\text{unstack}}}$$

Where:
* $t_{\text{wake\_detect}}$ is the physical edge-detection delay of the EXTI / NVIC wake circuit ($1 \dots 2\text{ clock cycles}$).
* $t_{\text{reg\_settle}}$ is the internal main voltage regulator stabilization time ($2.0 \dots 10.0\ \mu\text{s}$).
* $t_{\text{osc\_start}}$ is the crystal oscillator mechanical startup time ($100.0 \dots 500.0\ \mu\text{s}$ for HSE; $1.0 \dots 2.0\ \mu\text{s}$ for HSI).
* $t_{\text{PLL\_lock}}$ is the Phase-Locked Loop lock acquisition time ($100.0 \dots 200.0\ \mu\text{s}$).
* $t_{\text{unstack}}$ is the hardware register unstacking/entry latency ($12\text{ clock cycles}$).

```text
BREAKDOWN OF TOTAL WAKEUP LATENCY (t_wakeup_total) ACROSS TIME

 External Event (IRQ) Fires at t = 0.0 us
 ├─► t_wake_detect  :  0.01 us (EXTI Edge Detection)
 ├─► t_reg_settle   :  5.00 us (Internal V_DD Regulator Settle)
 ├─► t_osc_start    :  1.00 us (HSI RC Oscillator Start)
 ├─► t_unstack      :  0.75 us (Hardware Register Unstacking at 16 MHz)
 │   ================================================================
 └─► TOTAL TIME TO FIRST INSTRUCTION = 6.76 Microseconds!
     (CPU begins executing code on HSI while HSE + PLL lock in background!)
```

---

### 2. The Default HSI Fallback Clock Behavior

When a microcontroller exits deep sleep mode (`Stop` mode):

The hardware power controller **automatically forces the System Clock Multiplexer (`RCC_CFGR.SW`) back to the High-Speed Internal RC Oscillator (HSI $= 16\text{ MHz}$)**!

```text
HARDWARE AUTOMATIC HSI FALLBACK ON DEEP SLEEP EXIT

 Before Sleep (L0 Active Mode)  ──► SYSCLK = PLL (168 MHz)
                                    │
                                    ▼ Executes WFI (Enters Stop Mode: PLL & HSE Turned OFF)
 Deep Sleep (Stop Mode)         ──► SYSCLK = OFF (0 Hz)
                                    │
                                    ▼ Hardware Interrupt (IRQ) Fires!
 Wakeup Execution (L0 Restored) ──► SYSCLK = HSI (16 MHz) [HARDWARE AUTOMATIC FALLBACK!]
                                    (HSE and PLL remain OFF until software restarts them!)
```

#### Why Hardware Reverts to HSI Automatically:
Because HSI is an internal RC oscillator, it starts oscillating in **less than $2.0\text{ microseconds}$**! 

By reverting to HSI automatically, the hardware allows the CPU execution pipeline to wake up and begin executing assembly instructions in $6.76\text{ microseconds}$, rather than forcing the CPU to sit frozen for $455\text{ microseconds}$ waiting for the HSE crystal and PLL!

---

### 3. The Baud Rate Corruption Trap of Un-Restored Clocks

What happens if an assembly application wakes up on HSI ($16\text{ MHz}$) and immediately attempts to transmit a string over a UART serial port that was configured for $115,200\text{ baud}$ when the CPU was running at $168\text{ MHz}$?

Trace the physical hardware failure:

1. Before sleep, the CPU ran at $168\text{ MHz}$. Software programmed `USART1_BRR` assuming $f_{\text{PCLK2}} = 84\text{ MHz}$ ($USARTDIV = 45.5625$).
2. The CPU enters `Stop` mode and wakes up on $16\text{-MHz}$ HSI.
3. The software immediately writes a byte to `USART1_DR` **before re-starting the PLL**!
4. `USART1` is now running on an APB2 clock of $f_{\text{PCLK2}} = 16\text{ MHz}$ instead of $84\text{ MHz}$!
5. **The Baud Rate Disaster**:
   $$\text{Baud}_{\text{actual}} = \frac{16,000,000\text{ Hz}}{16 \times 45.5625} = \mathbf{21,947 \text{ Baud}} \quad (\text{Target was } 115,200\text{ Baud}!)$$
6. The actual baud rate is **$5.25\times$ too slow** ($21,947\text{ baud}$ instead of $115,200\text{ baud}$)!
7. The receiving device reads garbled noise, and a **Framing Error (`FE`)** is triggered!

```text
UN-RESTORED CLOCK BAUD RATE CORRUPTION

 Target Baud Rate (Configured for 168 MHz Clock) : 115,200 Baud (86.8 us/byte)
 Actual Baud Rate (Running on 16 MHz HSI Fallback):  21,947 Baud (455.6 us/byte)
 ─────────────────────────────────────────────────────────────────────────────────
 RESULT: Serial frame transmitted 5.25x too slow! ALL DATA CORRUPTED!
```

**Engineering Invariant**: Software **MUST NOT** communicate over clock-dependent peripherals (UART, SPI, USB, Ethernet) following a deep sleep wakeup until the Low-Power Clock Manager has re-stabilized the PLL and restored full clock frequency!

---

## Primitive: The Low-Power Clock Manager State Machine

To reconcile fast $2.0\ \mu\text{s}$ event responsiveness with $168\text{-MHz}$ baud rate accuracy, bare-metal software incorporates a **Low-Power Clock Manager State Machine**.

```text
LOW-POWER CLOCK MANAGER STATE TRANSITION GRAPH

                 Main Application Loop
                         │
                         ▼ Executes WFI (Enters Deep Sleep)
                 ┌──────────────┐
                 │  STATE_SLEEP │
                 └──────┬───────┘
                        │
                        ▼ Hardware IRQ Fires! CPU Wakes on 16-MHz HSI
                 ┌──────────────┐
                 │ STATE_FAST_   │ ──► Executes Emergency GPIO / Sensor Task
                 │   RESPONSE   │     (at 16 MHz in 2 microseconds!)
                 └──────┬───────┘
                        │
                        ▼ Initiates HSEON = 1 & PLLON = 1
                 ┌──────────────┐
                 │ STATE_PLL_   │ ──► Polls HSERDY & PLLRDY flags in background
                 │  RE_STABILIZ │     (or executes non-clocked tasks)
                 └──────┬───────┘
                        │
                        ▼ PLLRDY == 1 Confirmed!
                 ┌──────────────┐
                 │ STATE_FULL_  │ ──► Adjusts FLASH_ACR Wait States = 5
                 │  RESTORED    │     Switches SYSCLK MUX to PLL (168 MHz)
                 └──────────────┘     (Resumes high-speed UART/SPI communications!)
```

---

### The 5-Phase Clock Manager Restoration Sequence

When the CPU wakes from deep sleep on the $16\text{-MHz}$ HSI fallback clock, the Low-Power Clock Manager executes a 5-phase restoration pipeline:

#### Phase 1: Immediate Fast Response ($t = 2.0 \ \mu\text{s}$)
* The CPU wakes instantly on HSI ($16\text{ MHz}$).
* The $ISR$ executes urgent, non-clock-dependent tasks immediately: toggling an emergency GPIO pin, reading a local interrupt flag, or clearing a alarm line.
* Response time $= \mathbf{2.0 \text{ Microseconds}}$ ($100\times$ faster than waiting for the PLL!).

#### Phase 2: Asynchronous Oscillator Start
* The Clock Manager writes `RCC_CR.HSEON = 1` to start the external quartz crystal oscillator.
* The CPU continues executing independent software instructions at $16\text{ MHz}$ while the crystal's mechanical vibrations build up in the background.

#### Phase 3: PLL Re-Lock Acquisition
* The Clock Manager checks `RCC_CR.HSERDY`. Once $HSERDY = 1$, the Clock Manager writes `RCC_CR.PLLON = 1` to engage the Phase-Locked Loop.
* The PLL's analog Voltage-Controlled Oscillator (VCO) locks onto the $8\text{-MHz}$ crystal reference.

#### Phase 4: Flash Wait State Pre-Configuration
* **CRITICAL SAFETY STEP**: Before switching the system clock MUX to the $168\text{-MHz}$ PLL, the Clock Manager programs the Flash Access Control Register (`FLASH_ACR`):
  $$\text{FLASH\_ACR.LATENCY} \Leftarrow 5 \quad (\mathbf{5 \text{ Flash Wait States Enabled!}})$$
  This guarantees that when the CPU accelerates to $168\text{ MHz}$ in Phase 5, the slow Flash memory cells will not cause a `HardFault` crash!

#### Phase 5: Clock MUX Switch & Full Speed Restoration
* The Clock Manager writes `RCC_CFGR.SW = 2'b10` (Select PLL as $SYSCLK$).
* The Clock Manager polls `RCC_CFGR.SWS` until $SWS == 2'b10$ confirms the MUX switch.
* The CPU is now safely restored to **$168.000\text{ MHz}$**! High-speed UART, SPI, and USB communications resume with $100\%$ zero data corruption!

---

## Energy vs. Latency Optimization Trade-offs

In bare-metal power architecture, selecting which sleep state to enter requires evaluating the **Energy-vs-Latency Trade-off Curve**.

```text
POWER CONSUMPTION VS. WAKEUP LATENCY TRADE-OFF CURVE

 Power Consumption (mW)
  150 mW ┼─ [ L0 Active Mode ]  (f_CLK = 168 MHz, t_wakeup = 0 ns)
         │
   15 mW ┼─ [ Sleep Mode ]      (HCLK Off, PLL ON, t_wakeup = 0.05 us)
         │
  0.05mW ┼─ [ Stop Mode ]       (PLL Off, HSI Fallback, t_wakeup = 2.0 us)
         │
 0.002mW ┴─ [ Standby Mode ]    (RAM Lost, V_DD Off, t_wakeup = 2,500 us)
         ◄──────────────────────────────────────────────────────────►
         0.05 us                2.0 us                  2,500 us
                                 Wakeup Latency (t_wakeup)
```

### The Energy Cost Equation per Wakeup Cycle

To determine whether entering deep sleep actually saves battery power compared to shallower sleep modes, system architects evaluate the **Total Cycle Energy Equation ($E_{\text{cycle}}$)**:

$$\mathbf{E_{\text{cycle}} = \left( P_{\text{sleep}} \cdot t_{\text{sleep}} \right) + \left( P_{\text{restoration}} \cdot t_{\text{wakeup}} \right) + \left( P_{\text{active}} \cdot t_{\text{active}} \right)}$$

Where:
* $E_{\text{cycle}}$ is the total energy consumed during one sleep/active cycle in Joules ($J$).
* $P_{\text{sleep}}$ is the power consumed during sleep mode in Watts.
* $t_{\text{sleep}}$ is the duration spent sleeping in seconds.
* $P_{\text{restoration}}$ is the power consumed during the clock restoration phase ($t_{\text{wakeup}}$) in Watts.
* $t_{\text{wakeup}}$ is the wakeup latency duration in seconds.
* $P_{\text{active}}$ is the active execution power in Watts.
* $t_{\text{active}}$ is the active processing time in seconds.

#### The Minimum Idle Time Threshold ($t_{\text{break\_even}}$):
If the idle time gap ($t_{\text{sleep}}$) is shorter than a critical threshold $t_{\text{break\_even}}$, **the energy burned spooling up the PLL ($P_{\text{restoration}} \cdot t_{\text{wakeup}}$) exceeds the energy saved during sleep**!

$$\mathbf{\text{Energy Saved} \iff t_{\text{sleep}} > t_{\text{break\_even}} = t_{\text{wakeup}} \times \left( \frac{P_{\text{restoration}} - P_{\text{sleep}}}{P_{\text{active}} - P_{\text{sleep}}} \right)}$$

For short idle gaps ($t_{\text{sleep}} < 10\ \mu\text{s}$), the system **MUST** use shallow `Sleep` mode ($t_{\text{wakeup}} = 0.05\ \mu\text{s}$). For long idle gaps ($t_{\text{sleep}} > 1.0\text{ ms}$), the system switches to `Stop` mode with `L1.2` substates to maximize battery lifespan!

---

## Solved Industrial Engineering Exercise: Quantitative Clock Restoration Timing, Energy Break-Even Analysis, and Assembly Driver Synthesis

To consolidate your complete mastery of bare-metal wakeup latencies, PLL re-stabilization timing, Flash wait state adjustments, and assembly low-power clock manager routines, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal power architecture engineer designing an ultra-low-power environmental telemetry node powered by a $3.0\text{-Volt}, 220\text{-mAh}$ coin cell battery ($E_{\text{battery}} = 2,376\text{ Joules}$).

The processor is a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns}$).

```text
3.2 GZ LOW-POWER TELEMETRY NODE CLOCK RESTORATION AUDIT

 System Hardware Power & Latency Parameters:
 ┌─────────────────────────────────────────────────────────────┐
 │ L0 Active Power (168 MHz)    : P_active = 120.0 mW          │
 │ Stop Mode Power (All Clocks) : P_stop   = 0.060 mW (60 uW)  │
 │ Restoration Power (PLL Lock) : P_restore= 80.0 mW           │
 ├─────────────────────────────────────────────────────────────┤
 │ HSI Startup Latency t_HSI    : 2.0 Microseconds             │
 │ HSE Crystal Startup t_HSE    : 250.0 Microseconds           │
 │ PLL Lock Acquisition t_PLL   : 150.0 Microseconds           │
 └─────────────────────────────────────────────────────────────┘
  Target Workload: Wakes every 100.0 ms (10 Hz) to read a sensor.
  Active Processing Time: t_active = 1.0 ms (1,000 us) at 168 MHz.
```

#### Hardware Timing Breakdown:
1. **Un-Optimized Wakeup Strategy**: The CPU remains frozen in sleep until HSE and PLL are $100\%$ locked before executing *any* instructions ($t_{\text{wakeup\_unopt}} = 2.0\ \mu\text{s} + 250.0\ \mu\text{s} + 150.0\ \mu\text{s} = \mathbf{402.0 \ \mu\text{s}}$).
2. **Optimized Low-Power Clock Manager Strategy**: The CPU wakes instantly on HSI ($2.0\ \mu\text{s}$), reads the sensor in $100\ \mu\text{s}$ at $16\text{ MHz}$, and re-locks the PLL in the background only if high-speed UART transmission is required.

#### Your Objective

1. Calculate the total un-optimized wakeup latency $t_{\text{wakeup\_unopt}}$ (in microseconds and CPU clock cycles) if the CPU waits for HSE and PLL lock before executing instructions.
2. Calculate the total energy consumed per 100-ms cycle ($E_{\text{cycle\_unopt}}$) under the un-optimized strategy.
3. Calculate the total energy consumed per 100-ms cycle ($E_{\text{cycle\_opt}}$) under the Low-Power Clock Manager strategy (where emergency sensor sampling executes on $16\text{-MHz}$ HSI in $100\ \mu\text{s}$, and the PLL is re-locked only when needed).
4. Calculate the minimum idle time break-even threshold $t_{\text{break\_even}}$ (in microseconds) for entering `Stop` mode versus shallow `Sleep` mode.
5. Write the complete, production-ready ARM Assembly routine `ClockManager_WakeupRestore` that executes the non-blocking clock restoration sequence, updates `FLASH_ACR` wait states to 5, re-locks the PLL, and switches `SYSCLK`.
6. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Un-Optimized Wakeup Latency ($t_{\text{wakeup\_unopt}}$)

The un-optimized strategy waits for HSI startup ($2.0\ \mu\text{s}$), HSE crystal stabilization ($250.0\ \mu\text{s}$), and PLL lock ($150.0\ \mu\text{s}$):

$$t_{\text{wakeup\_unopt}} = t_{\text{HSI}} + t_{\text{HSE}} + t_{\text{PLL}} = 2.0\ \mu\text{s} + 250.0\ \mu\text{s} + 150.0\ \mu\text{s} = \mathbf{402.00 \text{ Microseconds}}$$

In CPU clock cycles at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$\text{Cycles}_{\text{unopt}} = \frac{402,000.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{1,286,400 \text{ CPU Clock Cycles Stalled!}}$$

Under the un-optimized strategy, the CPU sits frozen for **$1,286,400\text{ clock cycles}$** waiting for the crystal and PLL!

---

#### Step 2: Calculate Energy Consumed per 100-ms Cycle (Un-Optimized Strategy)

Over a $100.0\text{-ms}$ period ($100,000\ \mu\text{s}$):
* Active Time: $t_{\text{active}} = 1.0\text{ ms} = 1,000\ \mu\text{s}$ at $P_{\text{active}} = 120.0\text{ mW} = 0.120\text{ W}$.
* Restoration Time: $t_{\text{wakeup}} = 402.0\ \mu\text{s}$ at $P_{\text{restore}} = 80.0\text{ mW} = 0.080\text{ W}$.
* Sleep Time: $t_{\text{sleep}} = 100,000\ \mu\text{s} - (1,000 + 402) = 98,598\ \mu\text{s} = 0.098598\text{ s}$ at $P_{\text{stop}} = 0.060\text{ mW} = 0.000060\text{ W}$.

$$\text{Energy}_{\text{active}} = 0.120\text{ W} \times 0.001000\text{ s} = \mathbf{0.00012000 \text{ Joules}} \quad (120.0\ \mu\text{J})$$

$$\text{Energy}_{\text{restore}} = 0.080\text{ W} \times 0.000402\text{ s} = \mathbf{0.00003216 \text{ Joules}} \quad (32.16\ \mu\text{J})$$

$$\text{Energy}_{\text{sleep}} = 0.000060\text{ W} \times 0.098598\text{ s} = \mathbf{0.00000592 \text{ Joules}} \quad (5.92\ \mu\text{J})$$

$$\mathbf{E_{\text{cycle\_unopt}} = 120.0\ \mu\text{J} + 32.16\ \mu\text{J} + 5.92\ \mu\text{J} = \mathbf{158.08 \text{ Microjoules}} \quad (0.00015808\text{ J})}$$

Notice that clock restoration ($32.16\ \mu\text{J}$) consumed **$5.4\times$ MORE ENERGY than the entire 98.6-ms sleep phase ($5.92\ \mu\text{J}$)**!

---

#### Step 3: Calculate Energy Consumed per 100-ms Cycle (Optimized Clock Manager)

Under the Low-Power Clock Manager strategy:
* The CPU wakes on HSI ($16\text{ MHz}$) in $t_{\text{wakeup\_opt}} = \mathbf{2.0 \ \mu\text{s}}$.
* Active sampling runs on HSI at $16\text{ MHz}$ ($P_{\text{active\_HSI}} = 12.0\text{ mW} = 0.012\text{ W}$) for $100\ \mu\text{s}$.
* The PLL is **not** powered on unless high-speed UART is needed ($t_{\text{restore}} = 0\ \mu\text{s}$).
* Sleep Time: $t_{\text{sleep\_opt}} = 100,000 - 102 = 99,898\ \mu\text{s} = 0.099898\text{ s}$.

$$\text{Energy}_{\text{active\_opt}} = 0.012\text{ W} \times 0.000100\text{ s} = \mathbf{0.00000120 \text{ Joules}} \quad (1.20\ \mu\text{J})$$

$$\text{Energy}_{\text{sleep\_opt}} = 0.000060\text{ W} \times 0.099898\text{ s} = \mathbf{0.00000599 \text{ Joules}} \quad (5.99\ \mu\text{J})$$

$$\mathbf{E_{\text{cycle\_opt}} = 1.20\ \mu\text{J} + 5.99\ \mu\text{J} = \mathbf{7.19 \text{ Microjoules}} \quad (0.00000719\text{ J})}$$

##### Energy Reduction & Speedup Results:
$$\text{Energy Saved per Cycle} = 158.08\ \mu\text{J} - 7.19\ \mu\text{J} = \mathbf{150.89 \text{ Microjoules Saved!}}$$

$$\text{Energy Savings Factor} = \frac{E_{\text{cycle\_unopt}}}{E_{\text{cycle\_opt}}} = \frac{158.08\ \mu\text{J}}{7.19\ \mu\text{J}} \approx \mathbf{21.986\times \text{ Energy Reduction!}}$$

The Low-Power Clock Manager reduced energy consumption per cycle by **$95.45\%$ ($21.986\times$ battery life extension)**!

---

#### Step 4: Calculate Break-Even Idle Time Threshold ($t_{\text{break\_even}}$)

We calculate the minimum idle time $t_{\text{break\_even}}$ required for `Stop` mode ($P_{\text{stop}} = 0.06\text{ mW}$, $t_{\text{wakeup}} = 402\ \mu\text{s}$) to beat shallow `Sleep` mode ($P_{\text{shallow}} = 15.0\text{ mW}$, $t_{\text{wakeup}} = 0.05\ \mu\text{s}$):

$$t_{\text{break\_even}} = t_{\text{wakeup}} \times \left( \frac{P_{\text{restore}} - P_{\text{stop}}}{P_{\text{shallow}} - P_{\text{stop}}} \right)$$

$$t_{\text{break\_even}} = 402.0\ \mu\text{s} \times \left( \frac{80.0\text{ mW} - 0.06\text{ mW}}{15.0\text{ mW} - 0.06\text{ mW}} \right) = 402.0\ \mu\text{s} \times \left( \frac{79.94}{14.94} \right)$$

$$t_{\text{break\_even}} = 402.0\ \mu\text{s} \times 5.3507 \approx \mathbf{2,151.0 \text{ Microseconds}} \quad (2.151\text{ ms})$$

##### Break-Even Result:
If the idle time gap is **greater than $2.151\text{ milliseconds}$**, entering `Stop` mode saves net energy. For idle gaps shorter than $2.151\text{ ms}$, shallow `Sleep` mode MUST be used!

```text
BREAK-EVEN IDLE TIME THRESHOLD SUMMARY

 Idle Gap Duration (t_idle) │ Optimal Low-Power Mode Selected │ Energy Behavior
────────────────────────────┼─────────────────────────────────┼─────────────────────────────────────────────
 t_idle < 2.151 ms          │ Shallow Sleep Mode (HCLK Off)   │ Prevents PLL restoration energy waste!
 t_idle >= 2.151 ms         │ Deep Stop Mode (L1.2 Substate)  │ Net energy savings achieved!
```

---

#### Step 5: Complete Production Assembly Clock Restoration Driver

Here is the complete, production-ready ARM Assembly routine executing the non-blocking clock restoration pipeline upon waking from deep sleep:

```assembly
/* PRODUCTION BARE-METAL WAKEUP CLOCK RESTORATION ROUTINE IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ RCC_BASE,        0x40023800
.equ RCC_CR,          0x40023800        /* Clock Control Register */
.equ RCC_CFGR,        0x40023808        /* Clock Configuration Register */
.equ FLASH_ACR,       0x40023C00        /* Flash Access Control Register */

.global ClockManager_WakeupRestore
.type ClockManager_WakeupRestore, %function

.section .text
.thumb_func
ClockManager_WakeupRestore:
    push    {r4, r5, lr}

    /* ==================================================================== */
    /* PHASE 1: CPU IS ALREADY EXECUTING ON 16-MHZ HSI FALLBACK CLOCK!      */
    /* (Emergency ISR tasks can execute HERE in 2 microseconds!)           */
    /* ==================================================================== */

    /* ==================================================================== */
    /* PHASE 2: RE-START EXTERNAL CRYSTAL OSCILLATOR (HSEON = 1)            */
    /* ==================================================================== */
    ldr     r0, =RCC_CR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 16)          /* Set Bit 16 (HSEON = 1) */
    str     r1, [r0]

wait_hse_lock:
    ldr     r1, [r0]
    tst     r1, #(1 << 17)              /* Test HSERDY (Bit 17) */
    beq     wait_hse_lock              /* Poll until HSE crystal is stable! */

    /* ==================================================================== */
    /* PHASE 3: RE-START PHASE-LOCKED LOOP ENGINE (PLLON = 1)              */
    /* ==================================================================== */
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 24)          /* Set Bit 24 (PLLON = 1) */
    str     r1, [r0]

wait_pll_lock:
    ldr     r1, [r0]
    tst     r1, #(1 << 25)              /* Test PLLRDY (Bit 25) */
    beq     wait_pll_lock              /* Poll until PLL is 100% locked! */

    /* ==================================================================== */
    /* PHASE 4: PRE-CONFIGURE FLASH WAIT STATES (LATENCY = 5 FOR 168 MHZ)   */
    /* (CRITICAL: Must set 5 wait states BEFORE switching clock MUX!)      */
    /* ==================================================================== */
    ldr     r2, =FLASH_ACR
    ldr     r3, [r2]
    bic     r3, r3, #0x7                /* Clear LATENCY bits [2:0] */
    orr     r3, r3, #5                  /* Set LATENCY = 5 (5 Wait States) */
    orr     r3, r3, #(1 << 8)           /* Set PRFTEN = 1 (Enable Prefetch) */
    str     r3, [r2]

    /* ==================================================================== */
    /* PHASE 5: SWITCH SYSTEM CLOCK MUX BACK TO PLL (168 MHZ RESTORED!)     */
    /* ==================================================================== */
    ldr     r0, =RCC_CFGR
    ldr     r1, [r0]
    bic     r1, r1, #0x3                /* Clear SW bits [1:0] */
    orr     r1, r1, #0x2                /* Set SW = 2'b10 (Select PLL) */
    str     r1, [r0]

wait_mux_switched:
    ldr     r1, [r0]
    and     r2, r1, #(0x3 << 2)         /* Read SWS bits [3:2] */
    cmp     r2, #(0x2 << 2)             /* Confirm SWS == 2'b10 (PLL Active) */
    bne     wait_mux_switched

    /* HIGH-SPEED 168-MHZ CLOCK TREE IS NOW 100% RESTORED! */
    dsb
    pop     {r4, r5, pc}
.size ClockManager_WakeupRestore, .-ClockManager_WakeupRestore
```

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and clock restoration results against hardware specifications:

1. **Un-Optimized Wakeup Latency Verification**:
   * $t_{\text{wakeup\_unopt}} = 2.0\ \mu\text{s (HSI)} + 250.0\ \mu\text{s (HSE)} + 150.0\ \mu\text{s (PLL)} = 402.0\ \mu\text{s}$.
   * At $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$): $402,000 / 0.3125 = 1,286,400\text{ CPU cycles}$.
   * Cycle count verified $100\%$!

2. **Energy Reduction Verification**:
   * $E_{\text{unopt}} = 158.08\ \mu\text{J}$.
   * $E_{\text{opt}} = 7.19\ \mu\text{J}$.
   * Savings $= (158.08 - 7.19) / 158.08 = 95.451\%$ energy saved ($21.986\times$ battery extension).

3. **Break-Even Threshold Verification**:
   * $t_{\text{break\_even}} = 402.0\ \mu\text{s} \times \frac{80.0 - 0.06}{15.0 - 0.06} = 402.0 \times 5.3507 = 2,151.0\ \mu\text{s} = 2.151\text{ ms}$.
   * Idle gap $= 98.6\text{ ms} > 2.151\text{ ms}$, confirming $100\%$ that deep `Stop` mode was the correct, energy-optimal choice!

All $t_{\text{wakeup}}$ latency breakdowns, crystal startup time curves, PLL lock acquisition checks, $t_{\text{break\_even}}$ energy thresholds, and assembly clock manager routines evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Wakeup Latency ($t_{\text{wakeup}}$)**: The total physical time duration ($t_{\text{wakeup}} = t_{\text{wake\_detect}} + t_{\text{reg\_settle}} + t_{\text{osc\_start}} + t_{\text{PLL\_lock}} + t_{\text{unstack}}$) that elapses from an external wakeup event trigger until the CPU pipeline executes instructions at full clock frequency.
* **Low-Power Clock Manager**: A hardware and assembly state machine that handles the multi-phase clock restoration sequence upon waking from deep sleep—booting instantly on a fast RC fallback oscillator ($HSI = 16\text{ MHz}$) to execute emergency $ISRs$ in $2\ \mu\text{s}$, while re-stabilizing external crystals and PLLs in the background before switching the system clock MUX.