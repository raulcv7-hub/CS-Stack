content/00-digital-hardware-foundations/08-bare-metal-systems/lessons/02-mmio-peripheral-register-control/02-hardware-timer-counter-subsystems/04-watchdog-timer-reset-architecture.md
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

---

## The Dead Man's Switch and the Dual-Key Time Window: A Mental Model for Watchdogs

To build an intuitive, crystal-clear mental model of independent hardware watchdogs, magic key registers, windowed refresh intervals, and early warning interrupts before inspecting Memory-Mapped I/O (MMIO) registers and assembly equations, let us consider an everyday analogy: **The Locomotive Train Driver**.

Imagine an engineer (**The CPU Main Software Loop**) driving a high-speed passenger train (**The Embedded System**).

```text
THE LOCOMOTIVE TRAIN DRIVER METAPHOR

 Locomotive Engineer (CPU Main Loop)            Locomotive Emergency Panel
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Drives Train & Checks     │                 │ Independent Clock & Brakes│
 │ Signals every 60 Seconds  │                 │ Triggers Hard System Reset│
 └─────────────┬─────────────┘                 └─────────────▲─────────────┘
               │                                             │
               ▼ (Normal Driving Operation)                  │
 ┌───────────────────────────────────────────────────────────┴─────────────┐
 │ DEAD MAN'S FOOT PEDAL (Hardware Watchdog Timer)                         │
 │ Engineer MUST press pedal every 60 seconds to prove they are conscious! │
 └─────────────────────────────────────────────────────────────────────────┘
```

The train company needs to guarantee that if the engineer faints, suffers a medical emergency, or falls asleep (**CPU Execution Lockup**), the train will automatically apply its emergency brakes (**System Reset `NRST`**) to prevent a crash.

Let us compare two safety mechanisms installed on the train:

---

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

---

### Mechanism 2: The Windowed Time Guard (Windowed Watchdog / WWDG)

Now, consider a new hazard: What if a confused, delirious engineer (**A Corrupted Runaway Software Loop**) begins stomping on the foot pedal frantically 20 times per second?

If the pedal can be pressed at *any time*, the delirious engineer keeps resetting the clock, preventing the emergency brakes from ever firing even though the train is out of control!

To fix this, the train company upgrades to a **Windowed Dead Man's Switch (Windowed Watchdog / WWDG)**:

The control panel marks a strict **Valid Time Window** on the clock:

```text
WINDOWED WATCHDOG VALID REFRESH TIME WINDOW

 60s (Start)                   45s (Window Threshold W)        0s (Underflow)
 ┌─────────────────────────────┬───────────────────────────────┬────────────┐
 │  FORBIDDEN EARLY WINDOW     │  VALID REFRESH WINDOW         │ DEAD ZONE  │
 │  (Pressing pedal HERE       │  (Pressing pedal HERE         │ (Reaching 0│
 │   triggers INSTANT RESET!)  │   resets clock safely!)       │   RESETS!) │
 └─────────────────────────────┴───────────────────────────────┴────────────┘
```

The new rules state:
1. **Pressing the Pedal TOO LATE ($t = 0\text{ seconds}$)**: If the engineer forgets to press the pedal and the clock reaches 0, **THE EMERGENCY BRAKES FIRE (System Reset)**!
2. **Pressing the Pedal TOO EARLY ($t > 45\text{ seconds}$)**: If the engineer presses the pedal during the first 15 seconds after a reset (while the clock is still between 60s and 45s), **THE EMERGENCY BRAKES FIRE INSTANTLY (System Reset)**!
   * Why? Because pressing the pedal too early proves that the engineer is acting erratically or that a runaway loop is stomping the pedal!
3. **Valid Refresh Window ($45\text{s} \ge t > 0\text{s}$)**: The pedal can be pressed **ONLY when the clock is inside the valid window**!

#### The Siren Whistle (Early Warning Interrupt / EWI)
Just before the clock hits 0 (at second 2), the control panel blows a loud warning whistle (**Early Warning Interrupt / EWI**): *"1 second remaining! Press the pedal NOW or the brakes will fire!"*

This gives the engineer a final chance to write an emergency diagnostic log to a notepad before the system resets!

This train safety system is the exact physical analogue of **Hardware Watchdog Timers and Windowed Refresh Mechanics**:
* The train engineer is the **CPU Main Software Loop**.
* The foot pedal is the **Watchdog Key Register (`IWDG_KR`)**.
* Pressing the pedal is **Refreshing/Feeding the Watchdog (`0xAAAA`)**.
* Emergency brakes applying is a **Hardware System Reset (`NRST`)**.
* The independent clock is the **Low-Speed Internal RC Oscillator (`LSI`)**.
* The forbidden early zone ($t > 45\text{s}$) is the **Upper Window Threshold (`WWDG_CFR.W[6:0]`)**.
* The siren whistle is the **Early Warning Interrupt (`EWI`)**.

---

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

---

### 1. The Independent Watchdog (IWDG) Architecture

The **Independent Watchdog (IWDG)** is a self-contained 12-bit down-counting hardware timer driven by its own dedicated **Low-Speed Internal RC Oscillator ($LSI \approx 32\text{ kHz}$)**.

Because the $LSI$ clock operates independently of the main system clock ($HCLK$) and Phase-Locked Loops (PLLs), **the IWDG continues counting down even if the CPU's main clock tree fails, freezes, or enters deep sleep**!

```text
IWDG INTERNAL HARDWARE BLOCK DIAGRAM

 Low-Speed Internal RC Oscillator (LSI ~32 kHz)
       │
       ▼
 ┌───────────────────────────────────────────────────────────┐
 │ 8-BIT PRESCALER REGISTER (IWDG_PR: Divide by 4 to 256)    │
 └─────────────┬─────────────────────────────────────────────┘
               │ Output Clock f_iwdg
               ▼
 ┌───────────────────────────────────────────────────────────┐
 │ 12-BIT DOWN-COUNTER (IWDG_RLR Reloads Value 0..4,095)     │
 │ Decrements on every f_iwdg clock pulse                    │
 └─────────────┬─────────────────────────────────────────────┘
               │
               ▼ Counter reaches 0x000 (Underflow!)
 ┌───────────────────────────────────────────────────────────┐
 │ SYSTEM RESET GENERATOR                                    │
 │ Pulls NRST line Low -> Forces Full Hardware Reboot!       │
 └───────────────────────────────────────────────────────────┘
```

---

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

---

#### Mathematical Formula for IWDG Timeout ($T_{\text{IWDG}}$)

The 12-bit down-counter counts down from the value $RLR$ ($0 \dots 4,095$) to $0$.

The prescaler register (`IWDG_PR`) divides the $LSI$ clock by a factor $D_{\text{prescaler}} \in \{4, 8, 16, 32, 64, 128, 256\}$.

The maximum physical timeout period $T_{\text{IWDG}}$ before a hardware system reset fires is:

$$\mathbf{T_{\text{IWDG}} = \frac{(RLR + 1) \times D_{\text{prescaler}}}{f_{\text{LSI}}}}$$

Where:
* $T_{\text{IWDG}}$ is the physical watchdog timeout period in seconds.
* $RLR$ is the 12-bit value written into `IWDG_RLR` ($0 \le RLR \le 4,095$).
* $D_{\text{prescaler}}$ is the prescaler division factor ($D_{\text{prescaler}} = 4 \times 2^{\text{PR\_Value}}$).
* $f_{\text{LSI}}$ is the physical frequency of the Low-Speed Internal RC oscillator in Hertz ($f_{\text{LSI}} \approx 32,000\text{ Hz}$).

```text
IWDG TIMEOUT PERIOD MATRIX AT f_LSI = 32 kHz

 Prescaler Code (PR) │ Prescaler Divider │ Min Timeout (RLR = 0) │ Max Timeout (RLR = 4095)
─────────────────────┼───────────────────┼───────────────────────┼───────────────────────────
   3'b000 (0)        │      Divide by 4  │   0.125 Milliseconds  │   512.0 Milliseconds
   3'b001 (1)        │      Divide by 8  │   0.250 Milliseconds  │ 1,024.0 Milliseconds (1.02s)
   3'b010 (2)        │      Divide by 16 │   0.500 Milliseconds  │ 2,048.0 Milliseconds (2.04s)
   3'b110 (6)        │      Divide by 256│   8.000 Milliseconds  │32,768.0 Milliseconds (32.7s)
```

---

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

---

#### The Two Reset Trigger Conditions of WWDG

The WWDG monitor continuously compares the active counter value $T[6:0]$ against the user-programmed **Window Register (`WWDG_CFR.W[6:0]`)**:

```text
WWDG DUAL RESET TRIGGER CONDITIONS

 Condition 1: TOO LATE REFRESH (Counter Underflow)
 Counter T[6:0] counts down from 0x40 -> 0x3F (63_10).
 Bit 6 flips from 1 -> 0 ──► INSTANT SYSTEM RESET!

 Condition 2: TOO EARLY REFRESH (Outside Valid Window)
 Software writes to WWDG_CR while T[6:0] > W[6:0] (Counter is above Window threshold!).
 WWDG Hardware Comparator detects early write ──► INSTANT SYSTEM RESET!
```

$$\mathbf{\text{Valid Refresh Condition: } \quad 0x3F < T[6:0] \le W[6:0]}$$

```text
WWDG VALID VS FORBIDDEN REFRESH WINDOWS

 Counter T[6:0]
  0x7F (127) ┼─── FORBIDDEN EARLY WINDOW (Refresh HERE triggers INSTANT RESET!)
             │
  W[6:0]     ┼─── VALID REFRESH WINDOW  (Refresh HERE reloads counter safely!)
             │
  0x40 (64)  ┼─── EARLY WARNING INTERRUPT (EWI Vector fires!)
  0x3F (63)  ┴─── UNDERFLOW RESET       (Refresh TOO LATE -> INSTANT RESET!)
```

#### 1. Reset Condition 1 — Underflow ($T[6:0] < 0x40$):
The 7-bit counter counts down $127 \to 126 \dots \to 64$ (`0x40`).
When the counter decrements from $64 \to 63$ (`0x3F`), **Bit 6 (`T[6]`) flips from $1 \to 0$**. 

The hardware detects that $T[6] = 0$ and triggers an **instant System Reset (`NRST`)**!

#### 2. Reset Condition 2 — Early Refresh ($T[6:0] > W[6:0]$):
If software writes a new value to `WWDG_CR` while the counter $T[6:0]$ is **greater than the window value $W[6:0]$**, the hardware comparator detects an early write and **triggers an instant System Reset (`NRST`)**!

---

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

---

### The Early Warning Interrupt (EWI)

To give software a final opportunity to save diagnostic state before an unavoidable system reset:

When counter $T[6:0]$ decrements to **`0x40` ($64_{10}$)** (exactly 1 count before underflow reset at `0x3F`):

If bit 9 (`EWI` — Early Warning Interrupt) in `WWDG_CFR` is set to $1$:
1. The WWDG hardware asserts **Core Interrupt Vector `WWDG_IRQHandler`**.
2. The CPU jumps to `WWDG_IRQHandler` with **1 counter tick ($T_{\text{tick}}$) of time remaining** before reset.
3. The assembly handler writes emergency diagnostic data (such as fault codes or stack pointers) into non-volatile backup registers or SRAM, and then allows the system to reset cleanly!

```text
EARLY WARNING INTERRUPT (EWI) TIMELINE

 Counter T[6:0] = 0x41 (65) ──► Normal Down-Counting
 Counter T[6:0] = 0x40 (64) ──► EWI BIT FIRES! Triggers WWDG_IRQHandler!
                                 │
                                 ▼ (Software saves diagnostic panic logs to SRAM)
 Counter T[6:0] = 0x3F (63) ──► SYSTEM RESET ACTIVATED! (CPU Rebooted Cleanly!)
```

---

## Real-World Silicon Engineering: Debugger Freezes, LSI Drift, and Reset Cause Inspection

In commercial embedded systems engineering, implementing watchdog timers requires handling hardware edge cases during debugging and boot-up.

---

### 1. The GDB/J-Link Debugger Breakpoint Freeze Hazard

A major hazard during software development occurs when an engineer pauses execution using a hardware debugger (such as GDB, J-Link, or ST-Link) at a breakpoint.

When the CPU pipeline halts at a breakpoint:
* The CPU execution core stops running code. Software stops refreshing the watchdog!
* **The Hardware Hazard**: If the independent watchdog (`IWDG`) continues counting down in the background, **it will reach 0 and reset the microcontroller while you are stepping through code in the debugger**!
* The debugging session crashes, and the target chip reboots!

#### The Hardware Fix: Freezing Watchdogs in Debug Mode (`DBGMCU`)

To allow developers to step through assembly code without watchdog resets, microcontrollers incorporate a **Debug MCU Freeze Register (`DBGMCU_APB1_FZ`)**:

```assembly
/* FREEZING WATCHDOGS DURING DEBUGGER BREAKPOINTS IN ASSEMBLY */
    ldr     r0, =0xE0042008     /* Address of DBGMCU_APB1_FZ */
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 12)  /* Set DBG_IWDG_STOP (Freeze IWDG when CPU is halted) */
    orr     r1, r1, #(1 << 11)  /* Set DBG_WWDG_STOP (Freeze WWDG when CPU is halted) */
    str     r1, [r0]
    /* Watchdogs now pause automatically whenever GDB hits a breakpoint! */
```

---

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

---

## Solved Industrial Engineering Exercise: Quantitative WWDG Window Calculations, Early Warning Timing, and Assembly Synthesis

To consolidate your complete mastery of watchdog hardware architecture, key registers (`IWDG_KR`), WWDG window threshold equations, early warning interrupts, and boot-up reset cause inspection, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

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

---

### Step-by-Step Derivation

#### Step 1: Calculate WWDG Counter Tick Period ($T_{\text{wwdg\_tick}}$)

The internal WWDG counter tick frequency $f_{\text{wwdg\_cnt}}$ is:

$$f_{\text{wwdg\_cnt}} = \frac{f_{\text{PCLK1}}}{4096 \times 2^{\text{WDGTB}}}$$

Given $f_{\text{PCLK1}} = 42,000,000\text{ Hz}$ and $2^{\text{WDGTB}} = 2^3 = 8$:

$$f_{\text{wwdg\_cnt}} = \frac{42,000,000}{4096 \times 8} = \frac{42,000,000}{32,768} \approx \mathbf{1,281.738 \text{ Hz}}$$

Calculate single counter tick period $T_{\text{wwdg\_tick}}$:

$$T_{\text{wwdg\_tick}} = \frac{1}{f_{\text{wwdg\_cnt}}} = \frac{32,768}{42,000,000\text{ Hz}} \approx 0.00078019 \text{ Seconds} = \mathbf{780.19 \text{ Microseconds}}$$

Each count decrement of $T[6:0]$ takes **$780.19\text{ microseconds}$** ($0.78019\text{ ms}$).

---

#### Step 2: Calculate Forbidden Early Window Time ($T_{\text{early\_min}}$)

Software attempts to refresh the counter from $T[6:0] = 127$ down to $W[6:0] = 80$.

Number of counts in the early forbidden window:

$$\Delta \text{Counts}_{\text{early}} = T[6:0] - W[6:0] = 127 - 80 = \mathbf{47 \text{ Counts}}$$

Apply the Early Window Formula:

$$T_{\text{early\_min}} = \Delta \text{Counts}_{\text{early}} \times T_{\text{wwdg\_tick}}$$

$$T_{\text{early\_min}} = 47 \times 0.78019 \text{ ms} = \mathbf{36.669 \text{ Milliseconds}}$$

##### Early Window Result:
If software attempts to refresh the WWDG before **$36.669\text{ milliseconds}$** have elapsed, **THE WWDG TRIGGERS AN INSTANT SYSTEM RESET**!

---

#### Step 3: Calculate Late Window Timeout Limit ($T_{\text{late\_max}}$)

The counter counts down from $T[6:0] = 127$ to the underflow threshold $0x3F = 63$.

Number of counts in the total cycle before reset:

$$\Delta \text{Counts}_{\text{late}} = T[6:0] - 63 = 127 - 63 = \mathbf{64 \text{ Counts}}$$

Apply the Late Window Formula:

$$T_{\text{late\_max}} = \Delta \text{Counts}_{\text{late}} \times T_{\text{wwdg\_tick}}$$

$$T_{\text{late\_max}} = 64 \times 0.78019 \text{ ms} = \mathbf{49.932 \text{ Milliseconds}}$$

##### Late Window Result:
If software fails to refresh the WWDG before **$49.932\text{ milliseconds}$** have elapsed, **THE COUNTER UNDERFLOWS AND TRIGGERS A SYSTEM RESET**!

---

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

---

#### Step 5: Complete Production Assembly WWDG Initialization and EWI Handler

Here is the complete, production-ready ARM Assembly code for initializing `WWDG` and handling the Early Warning Interrupt:

```assembly
/* PRODUCTION BARE-METAL WWDG INITIALIZATION & EWI ISR IN ASSEMBLY */
.syntax unified
.cpu cortex-m4
.thumb

/* Register MMIO Base Addresses */
.equ RCC_APB1ENR,     0x40023840        /* APB1 Peripheral Clock Enable */
.equ WWDG_BASE,       0x40002C00
.equ WWDG_CR,         0x40002C00        /* Control Register */
.equ WWDG_CFR,        0x40002C04        /* Configuration Register */
.equ WWDG_SR,         0x40002C08        /* Status Register (EWIF Bit) */

.equ NVIC_ISER0,      0xE000E100        /* NVIC Interrupt Set-Enable Reg 0 */

.global WWDG_Init
.type WWDG_Init, %function

.section .text
.thumb_func
WWDG_Init:
    push    {r4, lr}

    /* Step 1: Enable WWDG Peripheral Clock in RCC (APB1ENR Bit 11) */
    ldr     r0, =RCC_APB1ENR
    ldr     r1, [r0]
    orr     r1, r1, #(1 << 11)          /* Set Bit 11 (WWDGEN = 1) */
    str     r1, [r0]
    dsb                                 /* Clock stabilization barrier */

    /* Step 2: Configure WWDG_CFR: Window W[6:0] = 0x50, WDGTB = /8, EWI = 1 */
    /* CFR = (W[6:0] = 0x50) | (WDGTB = 3'b11 << 7) | (EWI = 1 << 9) */
    ldr     r0, =WWDG_CFR
    ldr     r1, =((0x50 & 0x7F) | (3 << 7) | (1 << 9))
    str     r1, [r0]

    /* Step 3: Enable WWDG IRQ 0 in NVIC (NVIC_ISER0 Bit 0) */
    ldr     r0, =NVIC_ISER0
    movs    r1, #(1 << 0)               /* Enable WWDG_IRQn (IRQ 0) */
    str     r1, [r0]

    /* Step 4: Activate WWDG Engine & Load Initial Counter T[6:0] = 0x7F */
    /* CR = (T[6:0] = 0x7F) | (WDGA = 1 << 7) */
    ldr     r0, =WWDG_CR
    movs    r1, #(0x7F | (1 << 7))     /* 0x7F | 0x80 = 0xFF */
    str     r1, [r0]

    dsb
    pop     {r4, pc}
.size WWDG_Init, .-WWDG_Init


/* PRODUCTION EARLY WARNING INTERRUPT (EWI) SERVICE ROUTINE */
.global WWDG_IRQHandler
.type WWDG_IRQHandler, %function
.thumb_func
WWDG_IRQHandler:
    /* Step 1: CLEAR EARLY WARNING INTERRUPT FLAG (WWDG_SR.EWIF = 0) */
    ldr     r0, =WWDG_SR
    movs    r1, #0                      /* Write 0 to clear EWIF flag */
    str     r1, [r0]
    dsb

    /* Step 2: Emergency Panic Action - Save Diagnostic State to SRAM */
    ldr     r2, =0x20000000             /* SRAM Panic Log Location */
    ldr     r3, =0xDEADBEEF             /* Emergency Panic Code */
    str     r3, [r2]

    /* System will reset in 0.78 milliseconds when T[6:0] reaches 0x3F! */
    bx      lr                          /* Return from ISR */
.size WWDG_IRQHandler, .-WWDG_IRQHandler
```

---

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

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Hardware Watchdog Timer (WDT / IWDG)**: An autonomous down-counting hardware timer powered by an independent, low-power internal RC clock source ($LSI \approx 32\text{ kHz}$) that triggers an automatic hardware system reset (`NRST`) if its counter reaches zero before being periodically refreshed by software writing magic keys (`0xAAAA` to `IWDG_KR`).
* **Windowed Watchdog Refresh (WWDG)**: An advanced safety watchdog mechanism where software refreshes are valid **ONLY** when the down-counter value falls inside a specific programmable window ($0x3F < T[6:0] \le W[6:0]$); refreshing too early ($T[6:0] > W[6:0]$) or letting the counter underflow ($T[6:0] < 0x40$) triggers an immediate hardware system reset.
