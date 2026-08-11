---
title: "Bare-Metal Sleep State Mechanics, Event-Driven Wakeup, and Analog Leakage Prevention"
---

# Bare-Metal Sleep State Mechanics, Event-Driven Wakeup, and Analog Leakage Prevention

## The Idle Clock Power Drain and Floating Pin Leakage Crisis

In modern battery-powered bare-metal embedded systems—such as wireless medical monitors, smart utility meters, environmental sensors, or automotive key fobs—a microcontroller must operate reliably for years on a single small battery. 

In the vast majority of real-world applications, the CPU's workload is **intermittent and event-driven**. A sensor microcontroller might spend $2\text{ milliseconds}$ processing an incoming data packet or reading an ADC voltage, and then sit completely idle for the next $998\text{ milliseconds}$ waiting for the next periodic timer tick or button press.

During these long idle intervals, if the bare-metal software application waits for upcoming hardware events using a software polling loop (`while (!event_flag);`):

The CPU execution pipeline continues oscillating its internal clock tree ($HCLK$) at full operating frequency (e.g., $168\text{ MHz}$ or $3.2\text{ GHz}$), executing millions of empty conditional branch instructions every second.

To understand why executing empty instruction loops drains battery power so rapidly, we must examine the physical power dissipation equation of complementary metal-oxide-semiconductor (CMOS) digital logic in silicon:

$$\mathbf{P_{\text{total}} = P_{\text{dynamic}} + P_{\text{static}}}$$

$$\mathbf{P_{\text{dynamic}} = C_{\text{load}} \cdot V_{DD}^2 \cdot f_{\text{CLK}}}$$

Where:
* $P_{\text{total}}$ is the total electrical power consumed by the microchip in Watts.
* $P_{\text{dynamic}}$ is the dynamic switching power consumed by charging and discharging internal transistor gate capacitances.
* $P_{\text{static}}$ is the static DC leakage current drawn by transistors even when no switching occurs.
* $C_{\text{load}}$ is the total internal capacitive load of the CPU clock tree and logic gates in Farads.
* $V_{DD}$ is the operating supply voltage (e.g., $3.3\text{ Volts}$).
* $f_{\text{CLK}}$ is the active clock frequency in Hertz (e.g., $168\text{ MHz}$).

```text
DYNAMIC POWER DRAIN IN SOFTWARE POLLING LOOPS

 CPU Core Execution Pipeline (Running "while(!flag);" Loop at 168 MHz)
 ┌───────────────────────────────────────────────────────────┐
 │ Clock Tree oscillating at 168,000,000 Hz!                 │
 │ Dynamic Power P_dynamic = C * V_DD^2 * f_CLK              │
 │ P_dynamic = 150 mW CONTINUOUS POWER CONSUMPTION!          │
 └─────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
 500-mAh Coin Cell Battery EXHAUSTED IN 10 HOURS!
 (100% of battery power burned executing empty polling loops!)
```

Look at the physical consequence of software polling:
Because $f_{\text{CLK}}$ remains active at $168\text{ MHz}$, $P_{\text{dynamic}}$ remains at its maximum value ($\sim 150\text{ mW}$ to $500\text{ mW}$). 

A standard $500\text{-mAh}$ coin cell battery powering the device is completely drained in **less than 10 hours**, rendering the product useless!


## The Engine Auto-Stop and the Sealed Glass Door: A Mental Model for Low Power

To build an intuitive, crystal-clear mental model of Wait For Interrupt (`WFI`), Wait For Event (`WFE`), event latching, and analog pin leakage prevention before inspecting assembly opcodes, register bitfields, and transistor current curves, let us consider an everyday analogy: **A High-Performance Hybrid Sports Car**.

Imagine sitting in a high-performance sports car (**The CPU Execution Pipeline**) stopped at a red traffic light (**An Idle System Gap**). The car's engine can rev at $8,000\text{ RPM}$ (**Active $168\text{-MHz}$ Clock $f_{\text{CLK}}$**).

```text
THE SPORTS CAR POWER MANAGEMENT METAPHOR

 High-Performance Sports Car Engine (CPU Core Pipeline)
 ┌───────────────────────────────────────────────────────────┐
 │ 8,000 RPM Engine Speed (Active HCLK Clock Tree)           │
 │ Burns 1 Gallon of Fuel every 10 Minutes idling at light!  │
 └─────────────┬─────────────────────────────────────────────┘
               │
               ▼ (100% Fuel Wastage at Red Light!)
 ┌───────────────────────────────────────────────────────────┐
 │ AUTOMATED ENGINE AUTO-STOP SYSTEM (WFI / WFE Mechanics)   │
 │ Shuts OFF engine instantly at red light -> 0 RPM!         │
 └───────────────────────────────────────────────────────────┘
```

Let us observe three different strategies for managing the car at red traffic lights:


### Strategy 2: The Ignition Auto-Stop System (Wait For Interrupt / `WFI`)

The sports car is equipped with an automated **Ignition Auto-Stop System (`WFI` Instruction)**:

1. **Entering Sleep (`WFI`)**: When you press the brake at a red light, you execute the `WFI` command. The engine **shuts off completely ($0\text{ RPM}$ / $f_{\text{CLK}} = 0\text{ Hz}$)**!
   * Fuel consumption drops to zero ($P_{\text{dynamic}} = 0\text{ Watts}$).
   * You sit quietly in the driver's seat. All dashboard settings, radio stations, and seat positions remain $100\%$ preserved (**CPU Registers and SRAM Retained**).
2. **The Interrupt Wakeup**: When the traffic light turns green, the emergency siren behind you blares (**A Hardware Interrupt / $IRQ$**).
3. **The Automatic Restart**:
   * The siren forces the starter motor to crank the engine automatically (**Clock Tree Restarts**).
   * You execute an emergency driving maneuver (**The Interrupt Service Routine / $ISR$**).
   * After handling the maneuver, you return to your normal driving route (**Instruction after `WFI`**)!

```text
IGNITION AUTO-STOP (WFI) EXECUTION FLOW

 Red Light Stop ──► Execute WFI ──► Engine Off (0 RPM / P_dynamic = 0W!)
                                    │
                                    ▼ (Siren Blares = Hardware IRQ)
 Engine restarts automatically ──► Execute Emergency Maneuver (ISR)
                               ──► Resume normal driving route!
```


### Strategy 4: Sealing the Flapping Door (Analog Leakage Prevention)

Now, what about static DC fuel leakage?

Suppose the car's passenger door is un-latched and flaps halfway open in the wind (**A Floating Input Pin at $V_{\text{in}} = 1.65\text{V}$**).

Cold air rushes through the gap, forcing the car's heater to burn battery power continuously (**DC Shoot-Through Current Leakage**)!

To prevent this leakage:
* You either lock the door tightly shut (**Internal Pull-Down Resistor `PUPDR = 10`**), lock it tightly open (**Internal Pull-Up Resistor `PUPDR = 01`**), or completely seal the doorway with an airtight glass panel (**Analog Mode `MODER = 11`**) so the digital sensors inside are disconnected and zero air escapes!

This hybrid sports car system is the exact physical analogue of **`WFI`, `WFE`, Event Latches, and Analog Leakage Prevention**:
* Revving at red lights is **Software Polling I/O**.
* The Ignition Auto-Stop System is **Wait For Interrupt (`WFI`)**.
* The Dashboard Proximity Sensor is **Wait For Event (`WFE`)**.
* Flashing headlights is the **Send Event Instruction (`SEV`)**.
* The green indicator light is the **1-Bit Hardware Event Register**.
* Sealing the flapping door with an airtight glass panel is **GPIO Analog Mode (`MODER = 11`)**.


### The Four Execution Phases of a `WFI` Sleep Cycle

When a bare-metal CPU encounters a `wfi` instruction, it executes a 4-phase power transition:

#### Phase 1: Pipeline Flush and Clock Gating Entry
1. The CPU pipeline finishes executing all instructions preceding `wfi`.
2. Software executes a **Data Synchronization Barrier (`dsb`)** before `wfi` to guarantee that all pending memory writes in the CPU Write Buffer have completely committed to physical RAM or MMIO registers.
3. The CPU core's internal clock gate turns OFF. The main processor clock $HCLK$ freezes ($0\text{ Hz}$).
4. Dynamic switching power drops by over **$98\%$** ($P_{\text{dynamic}} \approx 0\text{ Watts}$).

#### Phase 2: Preserved Low-Power Standby
1. The Program Counter ($PC$) stays frozen at the instruction following `wfi`.
2. All CPU general-purpose registers ($r0 \dots r15$), special registers ($xPSR, PRIMASK, SP$), and internal SRAM data memory remain fully powered and $100\%$ preserved.
3. Peripherals configured with independent clock trees (such as hardware Timers or RTCs) continue running in the background.

#### Phase 3: Hardware Interrupt Interception & Clock Gating Exit
1. An active peripheral asserts a hardware $IRQ$ line (e.g., $IRQ_0$ from a timer overflow).
2. The Nested Vectored Interrupt Controller (NVIC / PLIC) detects $IRQ_0$.
3. If $IRQ_0$ is enabled (`ISER0` bit set) and its priority is higher than the current execution priority:
   * The Clock Gate Controller **re-enables the $HCLK$ clock tree instantly** ($HCLK = 168\text{ MHz}$).
   * The CPU core wakes up from sleep state in **less than $10\text{ nanoseconds}$**!

#### Phase 4: Context Stacking, ISR Execution, and Program Resume
1. The CPU hardware executes **Automated Context Stacking**, pushing $r0..r3, r12, LR, PC, xPSR$ onto the stack memory.
2. The CPU jumps to the $IRQ_0$ handler (`TIM2_IRQHandler`) and executes the $ISR$.
3. When the $ISR$ executes `bx lr` (exception return), the CPU hardware **unstacks the 8 registers** and restores $PC$ to point to the instruction **immediately following `wfi`**.
4. The main software loop continues running normally!

```assembly
/* LOW-POWER EVENT-DRIVEN MAIN LOOP WITH WFI IN ASSEMBLY */
main_low_power_loop:
    /* Perform background processing on fresh sensor data... */
    bl      process_sensor_data
    
    /* Prepare for sleep: ensure all memory writes committed */
    dsb                         /* Data Synchronization Barrier */
    wfi                         /* SLEEP! CPU clock freezes until next IRQ! */
    
    /* CPU wakes here AFTER ISR completes! Loop back to process new data! */
    b       main_low_power_loop
```


### The 1-Bit Hardware Event Register Latch

Every CPU core contains an internal, 1-bit hardware latch called **The Event Register**:

* **Event Register $= 0$**: No event is pending.
* **Event Register $= 1$**: An event has been logged!

#### The `WFE` Execution Invariant:

When the CPU pipeline encounters a `wfe` instruction:

1. **Case A (Event Register $== 1$)**:
   If the Event Register is *already* $1$ when `wfe` executes:
   * The CPU **does NOT go to sleep**!
   * The CPU **clears the Event Register to $0$** ($E \Leftarrow 0$).
   * The CPU **continues executing the next instruction immediately** ($0\text{ sleep cycles}$)!

2. **Case B (Event Register $== 0$)**:
   If the Event Register is $0$ when `wfe` executes:
   * The CPU halts its clock tree ($HCLK = 0\text{ Hz}$) and enters **`WFE` Sleep State**.
   * The CPU remains asleep until a hardware event sets the Event Register to $1$.


### WFI vs. WFE Architectural Comparison

The following matrix compares the execution rules, wakeup targets, and overheads of `WFI` vs `WFE`:

```text
WFI VS WFE ARCHITECTURAL COMPARISON MATRIX

 Feature / Parameter      │ Wait For Interrupt (WFI)       │ Wait For Event (WFE)
──────────────────────────┼────────────────────────────────┼───────────────────────────────────────────
 Assembly Opcode          │ `wfi`                          │ `wfe`
 Primary Hardware Target  │ Standard Peripheral ISRs       │ Fast Event Loops / Spinlocks / Multi-Core
 Requires ISR Execution?  │ YES (Must jump to vector ISR)  │ NO! (Resumes next line with ZERO ISR!)
 Context Stacking Overhead│ 32 Bytes (12 Clock Cycles)     │ ZERO Bytes (0 Clock Cycles!)
 Wakeup Source           │ Enabled NVIC/PLIC Interrupts   │ EXTI_EMR Events / SEV Instruction
 Inter-Core Signaling     │ Interrupts (MSI-X / IPI)       │ `sev` (Send Event Instruction)
```

#### When to Use `WFE` Over `WFI`:
* **Ultra-Low-Latency Spinlocks**: When two threads share a mutual exclusion lock in memory, a waiting thread executes `wfe` inside its polling loop. When the holding thread releases the lock, it executes `sev`. The waiting thread wakes up in **$1\text{ clock cycle}$** without executing an $ISR$!
* **Zero-Copy Peripheral Event Streams**: When an external sensor triggers an $EXTI$ event, `WFE` wakes the CPU directly to process data in the main loop without paying the $24\text{-cycle}$ context stacking/unstacking penalty!


### The 3-Step Pin Conditioning Protocol for Sleep Entry

To eliminate $V_{DD}/2$ shoot-through leakage current before executing `WFI` or `WFE`, bare-metal software **MUST execute The Pin Conditioning Protocol**:

```text
THE 3-STEP PIN CONDITIONING PROTOCOL FOR SLEEP ENTRY

 For Every Physical GPIO Pin on the Microcontroller:
 ┌─────────────────────────────────────────────────────────────┐
 │ CONDITION 1: Is Pin Un-used / Not Connected on PCB?         │
 │  ──► Program MODER = 2'b11 (ANALOG MODE!)                   │
 │      (Completely powers down & disconnects input buffer!)   │
 ├─────────────────────────────────────────────────────────────┤
 │ CONDITION 2: Is Pin an Active Digital Input?                │
 │  ──► Program PUPDR = 2'b01 (Pull-Up) or 2'b10 (Pull-Down)   │
 │      (Forces pin voltage firmly to 3.3V or 0.0V when idle!) │
 ├─────────────────────────────────────────────────────────────┤
 │ CONDITION 3: Is Pin an Active Output Pin?                   │
 │  ──► Drive ODR = 0 (Low) or ODR = 1 (High) firmly!          │
 └─────────────────────────────────────────────────────────────┘
```

#### Why Analog Mode (`MODER = 11`) Is the Gold Standard for Un-used Pins:
When a GPIO pin's mode register is set to **Analog Mode (`MODER = 2'b11`)**:
* The digital input buffer Schmidt trigger is **physically powered down and un-hooked from the pad**.
* Internal pull-up and pull-down resistors are turned OFF.
* Even if external static electricity causes the physical pad voltage to hover at $1.65\text{V}$, **zero current flows into the input buffer** because the buffer is physically disconnected!
* Static DC leakage current drops to **$0.000\ \mu\text{A}$**!

```assembly
/* ASSEMBLY PIN CONDITIONING PROTOCOL BEFORE DEEP SLEEP ENTRY */
    /* Program all un-used GPIO Port A pins (PA0..PA15) to Analog Mode (MODER = 0xFFFFFFFF) */
    ldr     r0, =GPIOA_MODER
    ldr     r1, =0xFFFFFFFF     /* Set all pins to 2'b11 (Analog Mode) */
    str     r1, [r0]
    
    /* Set connected button pin PA0 to Input with Pull-Down (PUPDR = 2'b10) */
    ldr     r0, =GPIOA_PUPDR
    ldr     r1, [r0]
    bic     r1, r1, #3          /* Clear bits [1:0] */
    orr     r1, r1, #2          /* Set bits [1:0] = 2'b10 (Pull-Down) */
    str     r1, [r0]
    
    /* ALL PINS CONDITIONED! Zero shoot-through leakage possible! */
```


### 2. Clock Oscillator Re-Stabilization Latency ($t_{\text{wakeup}}$)

When the CPU exits a deep sleep state (such as `Stop` or `Standby` mode) where the external crystal oscillator (HSE) or Phase-Locked Loop (PLL) was powered down:

* The CPU wakes up running on the fast internal RC oscillator (HSI $= 16\text{ MHz}$).
* The external crystal oscillator (HSE) and PLL take **$100 \text{ to } 500\text{ microseconds}$ ($t_{\text{wakeup}}$) to stabilize their physical oscillation amplitude**.

#### Assembly Wakeup Rule:
Upon waking from deep sleep, software **MUST re-execute the PLL lock sequence** before attempting to communicate with high-speed serial peripherals (UART/SPI), ensuring clock precision is restored!


### Scenario and Parameters

You are a principal power architecture engineer designing a wireless medical sensor node powered by a $3.0\text{-Volt}, 220\text{-mAh}$ coin cell battery ($220\text{ milliampere-hours} = 792\text{ Coulombs}$ of electric charge).

The sensor node uses a $3.2\text{ GHz}$ ARM Cortex-M4 server management processor ($T_{\text{clk}} = 0.3125\text{ ns}$).

```text
3.2 GZ LOW-POWER MEDICAL SENSOR NODE (3.0V COIN CELL BATTERY)

 Operating Parameters:
 ┌─────────────────────────────────────────────────────────────┐
 │ Battery Capacity : 220 mAh (792 Coulombs @ 3.0V)            │
 │ Active L0 Power  : f_CLK = 168 MHz -> I_active = 40.0 mA    │
 │ WFI Sleep Current: Clock Gated     -> I_sleep  = 0.005 mA   │
 │ Floating Pin Leak: 6 Un-conditioned pins -> I_leak = 3.0 mA │
 └─────────────────────────────────────────────────────────────┘
  Workload Duty Cycle: Wakes for 2.0 ms every 1.0 second (1,000 ms period).
```

#### System Operating States:
* **Active State ($2.0\text{ ms}$ per second)**: CPU executes sensor filtering algorithms at $168\text{ MHz}$. Supply current $I_{\text{active}} = \mathbf{40.0 \text{ mA}}$ ($40,000\ \mu\text{A}$).
* **Idle State ($998.0\text{ ms}$ per second)**: CPU sits waiting for the next $1.0\text{-second}$ timer tick.
  * In `WFI` Sleep with All Pins Conditioned: Supply current $I_{\text{sleep}} = \mathbf{0.005 \text{ mA}}$ ($5.0\ \mu\text{A}$).
  * In `WFI` Sleep with 6 Floating Un-Conditioned Pins: Floating pins draw an extra $I_{\text{leak}} = 6 \times 500\ \mu\text{A} = \mathbf{3.000 \text{ mA}}$ ($3,000\ \mu\text{A}$).

#### Candidate System Configurations to Compare:
* **System 0 (Software Polling Loop — No Sleep)**: CPU executes a polling loop during the $998\text{-ms}$ idle window ($I = 40.0\text{ mA}$ continuously $100\%$ of the time).
* **System 1 (Un-Conditioned WFI Sleep)**: CPU executes `WFI` during $998\text{-ms}$ idle window, but leaves 6 GPIO pins floating ($I = 0.005\text{ mA} + 3.000\text{ mA} = 3.005\text{ mA}$).
* **System 2 (Conditioned WFI Sleep — Full Leakage Prevention)**: CPU conditions all pins to Analog Mode (`MODER = 11`) and executes `WFI` during $998\text{-ms}$ idle window ($I_{\text{sleep}} = 0.005\text{ mA}$).

#### Your Objective

1. Calculate the average supply current $I_{\text{avg}}$ (in mA and $\mu\text{A}$) and battery lifespan (in days and years) for **System 0 (Software Polling)**.
2. Calculate $I_{\text{avg}}$ and battery lifespan for **System 1 (Un-Conditioned WFI Sleep)**.
3. Calculate $I_{\text{avg}}$ and battery lifespan for **System 2 (Conditioned WFI Sleep)**.
4. Calculate the battery lifespan extension factor achieved by System 2 over System 0 and System 1.
5. Write the complete, production-ready ARM Assembly low-power event loop that safely conditions GPIO pins to Analog Mode, executes race-free `WFI` sleep with `PRIMASK = 1`, and processes events upon wakeup.
6. Verify mathematical, physical, and logical correctness.


#### Step 2: Calculate Average Current and Battery Lifespan for System 1 (Un-Conditioned WFI Sleep)

Under System 1:
* Active Phase ($2.0\text{ ms}$): $I_{\text{active}} = 40.0\text{ mA}$.
* Sleep Phase ($998.0\text{ ms}$): $I_{\text{sleep1}} = 0.005\text{ mA} + 3.000\text{ mA (Floating Pin Leakage)} = \mathbf{3.005 \text{ mA}}$.

Calculate Weighted Average Current $I_{\text{avg\_System1}}$ over 1,000 ms ($1.0\text{ s}$):

$$I_{\text{avg\_System1}} = \frac{(I_{\text{active}} \times t_{\text{active}}) + (I_{\text{sleep1}} \times t_{\text{sleep}})}{T_{\text{period}}}$$

$$I_{\text{avg\_System1}} = \frac{(40.0\text{ mA} \times 2.0\text{ ms}) + (3.005\text{ mA} \times 998.0\text{ ms})}{1,000.0\text{ ms}}$$

$$I_{\text{avg\_System1}} = \frac{80.0 + 2,998.99}{1,000.0} = \frac{3,078.99}{1,000.0} = \mathbf{3.07899 \text{ mA}} = 3,078.99 \ \mu\text{A}$$

Calculate Battery Lifespan $T_{\text{life\_System1}}$:

$$T_{\text{life\_System1}} = \frac{220 \text{ mAh}}{3.07899 \text{ mA}} \approx \mathbf{71.452 \text{ Hours}} = \mathbf{2.977 \text{ Days}}$$

##### Result System 1:
Because 6 un-conditioned pins floated at $1.65\text{V}$, static leakage current ($3.0\text{ mA}$) drained the battery in **less than 3 days**!


#### Step 4: Complete Production Assembly Low-Power Event Loop

Here is the complete, production-ready ARM Assembly code for race-free low-power event-driven execution:

```assembly
/* PRODUCTION BARE-METAL RACE-FREE LOW-POWER EVENT LOOP IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ GPIOA_BASE,      0x40020000
.equ GPIOA_MODER,     0x40020000        /* GPIOA Mode Register */
.equ GPIOA_PUPDR,     0x4002000C        /* GPIOA Pull-Up/Pull-Down Register */

.section .bss
.align 2
.global event_flag
event_flag:
    .space 4                            /* 32-bit Event Flag in SRAM */

.section .text
.global main_low_power_entry
.type main_low_power_entry, %function

.thumb_func
main_low_power_entry:
    push    {r4, lr}

    /* ==================================================================== */
    /* STEP 1: CONDITION ALL UN-USED GPIO PINS TO ANALOG MODE (MODER = 11)   */
    /* ==================================================================== */
    ldr     r0, =GPIOA_MODER
    ldr     r1, =0xFFFFFFFF             /* Set all 16 pins to 2'b11 (Analog Mode) */
    str     r1, [r0]                    /* Powers down input buffer PMOS/NMOS! */

    /* Configure active button pin PA0 as Input with Pull-Down (PUPDR0 = 2'b10) */
    ldr     r0, =GPIOA_PUPDR
    ldr     r1, [r0]
    bic     r1, r1, #0x3                /* Clear bits [1:0] */
    orr     r1, r1, #0x2                /* Set PUPDR0 = 2'b10 (Pull-Down to GND) */
    str     r1, [r0]
    dsb

main_event_loop:
    /* ==================================================================== */
    /* STEP 2: PREVENT WFI RACE CONDITION BY MASKING INTERRUPTS FIRST       */
    /* ==================================================================== */
    cpsid   i                           /* PRIMASK = 1 (Mask IRQ servicing) */

    /* Read event_flag from RAM */
    ldr     r0, =event_flag
    ldr     r1, [r0]
    cmp     r1, #0                      /* Has a peripheral event fired (flag != 0)? */
    bne     process_event_payload       /* If event ready, skip sleep! */

    /* ==================================================================== */
    /* STEP 3: EXECUTE WFI SLEEP SAFELY (PENDING IRQs WAKE WFI EVEN IF MASKED)*/
    /* ==================================================================== */
    dsb                                 /* Memory synchronization barrier */
    wfi                                 /* HALT CPU CLOCK! Enter low-power sleep! */

process_event_payload:
    /* ==================================================================== */
    /* STEP 4: RE-ENABLE INTERRUPTS & PROCESS EVENT PAYLOAD IN ASSEMBLY      */
    /* ==================================================================== */
    cpsie   i                           /* PRIMASK = 0 (Service pending ISR!) */

    /* Clear event_flag in RAM */
    ldr     r0, =event_flag
    movs    r1, #0
    str     r1, [r0]

    /* Execute application sensor processing function */
    bl      process_sensor_data

    /* Loop back to sleep again */
    b       main_event_loop

process_sensor_data:
    /* (Executes fast sensor calculations in assembly...) */
    bx      lr
.size main_low_power_entry, .-main_low_power_entry
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Wait For Interrupt (`WFI`)**: An assembly control instruction (`wfi`) that instantly halts the CPU core clock tree ($HCLK = 0\text{ Hz}$), dropping dynamic switching power ($P_{\text{dynamic}} \approx 0$) while keeping registers and SRAM preserved until an enabled $IRQ$ wakes the processor.
* **Wait For Event (`WFE`)**: An assembly control instruction (`wfe`) that halts the CPU core clock tree until a 1-bit hardware Event Register is set to $1$ (via `SEV` or `EXTI_EMR`), waking the processor instantly to resume instruction execution without executing an $ISR$ or stacking registers.
* **Analog Leakage Prevention**: The bare-metal hardware conditioning protocol where un-used GPIO pins are programmed to Analog Mode (`MODER = 11`) prior to sleep entry, physically disconnecting digital input buffers to eliminate $V_{DD}/2$ PMOS/NMOS short-circuit DC shoot-through leakage current.