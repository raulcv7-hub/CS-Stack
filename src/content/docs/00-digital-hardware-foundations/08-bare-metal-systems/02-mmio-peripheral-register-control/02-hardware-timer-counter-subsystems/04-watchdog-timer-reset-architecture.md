---
title: "Hardware Watchdog Timers, Windowed Refresh Windows, and System Deadlock Recovery"
---

# Hardware Watchdog Timers, Windowed Refresh Windows, and System Deadlock Recovery

## The Unattended Execution Lockup and Runaway Loop Crisis

When an embedded microcontroller is deployed in a remote or safety-critical physical environment—such as a satellite orbiting Earth, an automotive engine controller, a medical pacemaker, or an industrial sensor mounted on a high-voltage transmission tower—the device operates continuously without human intervention. The central processing unit (CPU) executes its bare-metal application software, reading sensor inputs, computing control algorithms, and driving actuators.

However, no software program is entirely immune to physical and logical anomalies:

1. **Software Deadlocks and Infinite Loops**: A software bug, an un-handled edge case, or a corrupted state machine can cause the CPU execution pipeline to enter an unintended infinite loop (`while(1)` deadlock) or stall permanently while waiting for an un-responsive hardware peripheral flag.
2. **Electromagnetic Noise and Memory Corruption**: High-energy electromagnetic interference (EMI) or power supply voltage sags can flip a bit in the CPU's Program Counter ($PC$) or stack memory. The CPU jumps to an invalid memory location, executing garbage instructions or trapping inside an un-configured exception handler.

If a bare-metal microcontroller freezes in an infinite loop without a human operator present to press a physical reset button:
* The system remains locked up indefinitely.
* An electric motor might remain stuck in an active driving state, overheating its power stage.
* A remote satellite or industrial sensor becomes completely bricked, failing to respond to network commands forever.

```text
THE UNATTENDED HARDWARE DEADLOCK CATASTROPHE

 CPU Execution Pipeline (Enters Infinite Loop / Un-handled Trap)
 ┌───────────────────────────────────────────────────────────┐
 │ infinite_loop:                                            │
 │   b   infinite_loop   (CPU trapped in 100% execution stall!)│
 └─────────────────────────────┬─────────────────────────────┘
                               │
                               ▼ NO HUMAN OPERATOR TO PRESS RESET!
 System remains frozen forever! (Actuators locked! Machine bricked!)
```

Why can we not simply use a basic hardware timer to reset the chip whenever a software loop takes too long?

Because a basic hardware timer that accepts a counter reset signal at *any* time introduces a second, subtle software failure mode: **The Runaway Refresh Loop Hazard**.

Suppose a software program suffers a memory corruption error. Instead of halting completely, the CPU enters a corrupted, rogue loop that continuously executes garbage instructions—and by pure chance, the rogue loop repeatedly executes the assembly instruction that refreshes (reloads) the basic watchdog timer every 10 milliseconds!

```text
THE ROGUE RUNAWAY REFRESH LOOP HAZARD

 Corrupted Software Loop (Rogue Execution)
 ┌───────────────────────────────────────────────────────────┐
 │ Executes corrupted code -> Executes Watchdog Refresh!     │
 │ Executes corrupted code -> Executes Watchdog Refresh!     │
 └─────────────────────────────┬─────────────────────────────┘
                               │
                               ▼ Basic Watchdog accepts refresh at ANY time!
 Watchdog Timer is repeatedly reloaded! NEVER REACHES ZERO!
 (Rogue software continues destroying equipment! Basic Watchdog FOOLED!)
```

Look at the physical failure of a basic watchdog timer:
* Because the rogue loop refreshes the basic watchdog timer 100 times per second, the timer's counter **never reaches zero**!
* The basic watchdog timer assumes the software is operating healthily, when in reality the application is running completely out of control!

To guarantee that frozen software automatically triggers a hardware system reset, AND to prevent corrupted runaway loops from tricking the timer by refreshing it prematurely, hardware architectures employ **Hardware Watchdog Timers (WDT / IWDG)** and **Windowed Watchdog Refresh Mechanics (WWDG)**.


### Mechanism 1: The Basic Dead Man's Switch (Independent Watchdog / IWDG)

The train company installs a spring-loaded foot pedal (**The Independent Watchdog Timer / IWDG**) on the cab floor.

Inside the control panel sits an independent mechanical countdown clock (**Low-Speed Internal Oscillator / LSI**) counting down from **60 seconds to 0**:
1. **The Normal Driver Refresh**: As long as the engineer is awake and healthy, they press the foot pedal once every 50 seconds (**Writing Magic Key `0xAAAA` to `IWDG_KR`**). Pressing the pedal instantly resets the clock back to 60 seconds.
2. **The Engineer Faints (CPU Lockup)**: If the engineer faints or falls asleep at 10:00 AM:
   * The engineer stops pressing the foot pedal.
   * The countdown clock continues ticking down in the background: $50 \to 40 \to 30 \to 10 \to 0$ seconds!
   * The instant the clock reaches **0 seconds**, a heavy pneumatic valve opens, applying the emergency brakes and stopping the train (**Hardware Reset `NRST` Activated**)!

```text
INDEPENDENT WATCHDOG (IWDG) TIMELINE

 Driver presses pedal at t = 50s ──► Clock resets to 60s!
 Driver faints at t = 0s         ──► Clock ticks: 50 -> 40 -> ... -> 0s
                                     │
                                     ▼
 Clock reaches 0s ───────────────► EMERGENCY BRAKES ACTIVATED! (System Reset!)
```

Look at what Mechanism 1 achieved:
* The countdown clock operates **independently** of the main train engine. Even if the main engine stalls or loses power, the emergency clock continues ticking down!
* If the engineer stops pressing the pedal, the system resets automatically.


## Deep Mechanics of Independent (IWDG) and Windowed (WWDG) Watchdogs

Now that we possess an intuitive mental model of dead man's switches and windowed time guards, let us examine the formal, rigorous engineering mechanics of **Independent Watchdog Timers (IWDG)** and **Windowed Watchdog Timers (WWDG)**.

Microcontrollers typically incorporate two distinct hardware watchdog peripherals:

```text
INDEPENDENT (IWDG) VS WINDOWED (WWDG) WATCHDOG COMPARISON

 Feature / Property       │ Independent Watchdog (IWDG)   │ Windowed Watchdog (WWDG)
──────────────────────────┼───────────────────────────────┼───────────────────────────────────────────
 Primary Clock Source     │ Dedicated Low-Speed RC (LSI)  │ Main Peripheral Bus Clock (PCLK1)
 Clock Independence       │ 100% Independent of CPU HCLK  │ Dependent on System Clock
 Valid Refresh Window     │ Any time before underflow (0) │ STRICT WINDOW ONLY (WIN < CNT <= ARR)
 Early Refresh Behavior   │ Accepts reload normally       │ TRIGGERS INSTANT SYSTEM RESET!
 Pre-Reset Warning IRQ?   │ NO                            │ YES (Early Warning Interrupt EWI)
 Primary Hardware Purpose │ Catch total CPU/clock freezes │ Catch runaway loops & timing anomalies
```


#### The Key Register (`IWDG_KR` — Offset `0x00`) and Magic Unlock Keys

To prevent accidental software writes or memory corruption from modifying watchdog settings, the `IWDG` registers are protected by a **Magic Key Security Barrier**.

Software interacts with `IWDG` by writing 16-bit **Magic Key Commands** into the **Key Register (`IWDG_KR`)**:

```text
IWDG MAGIC KEY COMMAND MATRIX

 Magic Key Value │ Hex Command │ Hardware Action Executed by IWDG
─────────────────┼─────────────┼───────────────────────────────────────────────────────────────
   0xAAAA        │   0xAAAA    │ REFRESH WATCHDOG: Copies IWDG_RLR into 12-bit down-counter!
   0x5555        │   0x5555    │ UNLOCK REGISTERS: Enables write access to IWDG_PR and IWDG_RLR!
   0xCCCC        │   0xCCCC    │ START WATCHDOG: Turns ON the IWDG counter! (Cannot be stopped!)
```

```assembly
/* REFRESHING THE INDEPENDENT WATCHDOG IN ASSEMBLY */
    ldr     r0, =IWDG_KR
    ldr     r1, =0xAAAA        /* Magic Key 0xAAAA = Refresh Reload Counter */
    str     r1, [r0]            /* IWDG counter reloaded to IWDG_RLR value! */
```

#### The Write-Protection Invariant:
Attempting to write directly to the Prescaler Register (`IWDG_PR`) or Reload Register (`IWDG_RLR`) **without writing `0x5555` to `IWDG_KR` first** produces zero effect! The write is blocked by hardware.


### 2. The Windowed Watchdog (WWDG) Architecture

The **Windowed Watchdog (WWDG)** is an advanced 7-bit down-counting timer clocked by the main system peripheral bus clock ($PCLK1$).

Unlike the independent watchdog, the WWDG enforces a **Strict Time Window** for software refreshes:

```text
WWDG 7-BIT COUNTER AND WINDOW THRESHOLD MAP

 7-Bit Control Register Counter T[6:0] (Counts down from 127 to 64):
 Bit 6       Bit 5       Bit 4       Bit 3       Bit 2       Bit 1       Bit 0
 ┌───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┐
 │ T[6]      │ T[5]      │ T[4]      │ T[3]      │ T[2]      │ T[1]      │ T[0]      │
 │ (Active)  │           │           │           │           │           │           │
 └───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┘
  ▲
  └── BIT 6 IS THE ACTIVATE / UNDERFLOW FLAG!
      While T[6] == 1 (Values 0x7F to 0x40 / 127 to 64) -> Counter Running!
      When T[6] flips 1 -> 0 (Value reaches 0x3F / 63)  -> INSTANT SYSTEM RESET!
```


#### Mathematical Equations for WWDG Window Time Bounds

Let $f_{\text{PCLK1}}$ be the APB1 peripheral bus clock frequency in Hertz (e.g., $42\text{ MHz}$).
Let $WDGTB$ be the 2-bit WWDG prescaler value ($WDGTB \in \{0, 1, 2, 3\} \implies \text{Divider } 2^{WDGTB} \in \{1, 2, 4, 8\}$).

The internal WWDG counter tick frequency $f_{\text{wwdg\_cnt}}$ is:

$$f_{\text{wwdg\_cnt}} = \frac{f_{\text{PCLK1}}}{4096 \times 2^{WDGTB}}$$

##### 1. Minimum Time Before Refresh Is Allowed ($T_{\text{early\_min}}$ — Early Window Limit):
Software MUST wait at least $T_{\text{early\_min}}$ seconds after initialization before refreshing:

$$\mathbf{T_{\text{early\_min}} = \frac{(T[6:0] - W[6:0]) \times 4096 \times 2^{WDGTB}}{f_{\text{PCLK1}}}}$$

##### 2. Maximum Time Before Underflow Reset ($T_{\text{late\_max}}$ — Late Window Limit):
Software MUST refresh before $T_{\text{late\_max}}$ seconds elapse:

$$\mathbf{T_{\text{late\_max}} = \frac{(T[6:0] - 0x3F) \times 4096 \times 2^{WDGTB}}{f_{\text{PCLK1}}}}$$

Where:
* $T[6:0]$ is the initial counter value loaded into `WWDG_CR` ($64 \le T[6:0] \le 127$).
* $W[6:0]$ is the window threshold value in `WWDG_CFR` ($64 \le W[6:0] \le 127$).
* $0x3F = 63_{10}$ is the underflow reset threshold.


## Real-World Silicon Engineering: Debugger Freezes, LSI Drift, and Reset Cause Inspection

In commercial embedded systems engineering, implementing watchdog timers requires handling hardware edge cases during debugging and boot-up.


### 2. Inspecting the Reset Cause Register (`RCC_CSR`) on Boot-Up

When a bare-metal microcontroller boots up following a reset, how does the assembly startup routine know **WHY the reset occurred**?

Did the user press the power button (**Power-On Reset**)? Did a brownout occur (**POR/PDR Reset**)? Or did a watchdog timer fire because of a software deadlock (**Watchdog Reset**)?

The hardware records the physical cause of the reset inside the **Reset Control and Status Register (`RCC_CSR`)**:

```text
RCC_CSR RESET CAUSE STATUS FLAGS (OFFSET 0x74)

 Bit Position │ Status Flag Mnemonic │ Physical Reset Event Cause
──────────────┼──────────────────────┼───────────────────────────────────────────────────────────
    Bit 31    │ LPWRRSTF             │ Low-Power Management Reset Flag
    Bit 30    │ WWDGRSTF             │ Windowed Watchdog (WWDG) Reset Flag!
    Bit 29    │ IWDGRSTF             │ Independent Watchdog (IWDG) Reset Flag!
    Bit 28    │ SFTRSTF              │ Software Reset Flag (Triggered by NVIC_SystemReset)
    Bit 27    │ PORRSTF              │ Power-On / Power-Down Reset Flag
    Bit 26    │ PINRSTF              │ External Physical Reset Pin (NRST) Pulled Low
```

```text
BOOT-UP RESET CAUSE INSPECTION LOGIC

 System Boots Up ──► Assembly Startup Reads RCC_CSR (Offset 0x74)
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
 Bit 29 (IWDGRSTF) == 1?      Bit 27 (PORRSTF) == 1?
             │                           │
             ▼                           ▼
 WATCHDOG DEADLOCK RECOVERY!  NORMAL COLD POWER-ON BOOT!
 Log Panic Code to SRAM;      Initialize .data & .bss normally;
 Clear flags via RMVF bit!    Clear flags via RMVF bit!
```

#### Production Boot Sequence Rule:
1. Startup assembly reads `RCC_CSR`.
2. If `IWDGRSTF = 1` or `WWDGRSTF = 1`, the startup routine increments a **Crash Counter in SRAM**, saves diagnostic logs, and alerts telemetry.
3. Software clears the status flags by writing $1$ to the **Remove Reset Flag Bit (`RMVF` — Bit 24 of `RCC_CSR`)**.


### Scenario and Parameters

You are a principal bare-metal safety architect configuring the Windowed Watchdog (`WWDG`) for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The WWDG peripheral is connected to the APB1 bus operating at clock frequency $f_{\text{PCLK1}} = \mathbf{42.000 \text{ MHz}}$ ($42,000,000\text{ Hz}$).

```text
3.2 GZ SERVER PROCESSOR WWDG HARDWARE CONFIGURATION

 APB1 Peripheral Bus Clock f_PCLK1 = 42.000 MHz
 ┌─────────────────────────────────────────────────────────────┐
 │ Windowed Watchdog Peripheral (MMIO Base: 0x4000_2C00)       │
 │ WWDG Prescaler: WDGTB = 2'b11 (Divide-by-8 Prescaler)       │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
 Target Timing Requirements:
 * Initial 7-bit Counter Value T[6:0] = 0x7F (127_10)
 * Desired Window Threshold    W[6:0] = 0x50 (80_10)
```

#### Subsystem Hardware Parameters:
* APB1 Bus Frequency: $f_{\text{PCLK1}} = 42.000\text{ MHz} = 42,000,000\text{ Hz}$.
* WWDG Prescaler Setting: `WDGTB = 2'b11` ($\text{Prescaler Divider } 2^{\text{WDGTB}} = 2^3 = \mathbf{8}$).
* Initial Counter Value written to `WWDG_CR`: $T[6:0] = \text{0x7F} = \mathbf{127_{10}}$.
* Window Threshold Value written to `WWDG_CFR`: $W[6:0] = \text{0x50} = \mathbf{80_{10}}$.
* Underflow Reset Threshold: $T[6:0] = \text{0x3F} = \mathbf{63_{10}}$.

#### Your Objective

1. Calculate the physical WWDG counter tick period $T_{\text{wwdg\_tick}}$ (in microseconds).
2. Calculate the minimum time $T_{\text{early\_min}}$ (in milliseconds) that software MUST wait before a refresh is permitted (Forbidden Early Window).
3. Calculate the maximum time $T_{\text{late\_max}}$ (in milliseconds) before a counter underflow reset occurs (Late Window Limit).
4. Calculate the time window duration $\Delta T_{\text{valid}}$ (in milliseconds) during which software refreshes are valid.
5. Write the complete, production-ready ARM Assembly routine `WWDG_Init` that configures `WWDG_CFR`, enables the Early Warning Interrupt (`EWI`), and starts `WWDG_CR`.
6. Write the assembly `WWDG_IRQHandler` that logs a panic code when an EWI interrupt fires.
7. Verify mathematical, physical, and logical correctness.


#### Step 2: Calculate Forbidden Early Window Time ($T_{\text{early\_min}}$)

Software attempts to refresh the counter from $T[6:0] = 127$ down to $W[6:0] = 80$.

Number of counts in the early forbidden window:

$$\Delta \text{Counts}_{\text{early}} = T[6:0] - W[6:0] = 127 - 80 = \mathbf{47 \text{ Counts}}$$

Apply the Early Window Formula:

$$T_{\text{early\_min}} = \Delta \text{Counts}_{\text{early}} \times T_{\text{wwdg\_tick}}$$

$$T_{\text{early\_min}} = 47 \times 0.78019 \text{ ms} = \mathbf{36.669 \text{ Milliseconds}}$$

##### Early Window Result:
If software attempts to refresh the WWDG before **$36.669\text{ milliseconds}$** have elapsed, **THE WWDG TRIGGERS AN INSTANT SYSTEM RESET**!


#### Step 4: Calculate Valid Refresh Window Duration ($\Delta T_{\text{valid}}$)

$$\Delta T_{\text{valid}} = T_{\text{late\_max}} - T_{\text{early\_min}} = 49.932\text{ ms} - 36.669\text{ ms} = \mathbf{13.263 \text{ Milliseconds}}$$

```text
WWDG TIMING WINDOW SUMMARY

 Time t = 0.000 ms  : Counter started at T[6:0] = 127 (0x7F)
 Time t < 36.669 ms : FORBIDDEN EARLY WINDOW (Refreshing HERE triggers INSTANT RESET!)
 36.669 ms <= t <= 49.932 ms : VALID REFRESH WINDOW (Duration = 13.263 ms)
 Time t = 49.152 ms : EARLY WARNING INTERRUPT (EWI) FIRES! (T[6:0] = 64 / 0x40)
 Time t > 49.932 ms : COUNTER UNDERFLOW RESET! (T[6:0] = 63 / 0x3F)
```


### Sanity Check and Verification

Let us verify our mathematical, physical, and register configuration results against hardware specifications:

1. **Counter Tick Period Check**:
   * $f_{\text{PCLK1}} = 42\text{ MHz}$. Prescaler $= 4096 \times 8 = 32,768$.
   * $f_{\text{wwdg\_cnt}} = 42,000,000 / 32,768 = 1,281.738\text{ Hz}$.
   * $T_{\text{wwdg\_tick}} = 1 / 1,281.738 = 780.19\ \mu\text{s}$. Math verified $100\%$!

2. **Window Time Bound Check**:
   * $T_{\text{early\_min}} = (127 - 80) \times 0.78019\text{ ms} = 47 \times 0.78019 = 36.669\text{ ms}$.
   * $T_{\text{late\_max}} = (127 - 63) \times 0.78019\text{ ms} = 64 \times 0.78019 = 49.932\text{ ms}$.
   * Valid Refresh Window $= 49.932 - 36.669 = 13.263\text{ ms}$.
   * Verified that early refreshes before $36.669\text{ ms}$ trigger an immediate reset!

3. **EWI Activation Offset Check**:
   * EWI fires at $T[6:0] = 0x40 = 64_{10}$.
   * Time of EWI fire $= (127 - 64) \times 0.78019\text{ ms} = 63 \times 0.78019 = \mathbf{49.152 \text{ ms}}$.
   * Time remaining before reset at $49.932\text{ ms} = 49.932 - 49.152 = \mathbf{0.780 \text{ ms}}$ ($1\text{ tick}$ exact!).

All 12-bit / 7-bit down-counter equations, $IWDG$ magic key register operations, $WWDG$ windowed threshold time bounds, early warning interrupt handlers, and assembly reset-cause inspection logic evaluate with 100% mathematical, physical, and logical precision.

