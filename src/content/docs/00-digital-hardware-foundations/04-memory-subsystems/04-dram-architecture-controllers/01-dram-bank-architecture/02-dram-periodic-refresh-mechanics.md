---
title: "DRAM Periodic Refresh Mechanics and Refresh Overhead Stalls"
---

# DRAM Periodic Refresh Mechanics and Refresh Overhead Stalls

## The Exponential Voltage Decay Friction and Memory Availability Lockup

In high-density main system memory, One-Transistor One-Capacitor (1T1C) Dynamic Random-Access Memory (DRAM) cells store binary information as microscopic electrical charges ($Q = C_s \cdot V_c$) on $25\text{-femtofarad}$ storage capacitors. By replacing six active transistors (the 6T SRAM cell used in CPU caches) with a single access transistor and a microscopic 3D capacitor, semiconductor foundries achieve extraordinary memory density, packing tens of billions of addressable memory cells onto a single small silicon die.

However, storing data as an electrical charge on a capacitor introduces a severe, fundamental physical limitation: **Storage Impermanence**.

In physical silicon, a 1T1C storage capacitor is not a perfect, hermetically sealed vessel. It is surrounded by doped semiconductor regions and thin oxide insulators. Electrical charge continuously leaks out of the capacitor through three primary microscopic conduction pathways:
1. Subthreshold leakage current through the OFF-state NMOS access transistor.
2. Reverse-bias PN-junction diode leakage into the silicon substrate wafer.
3. Quantum mechanical tunneling through the high-$k$ capacitor dielectric insulator.

Because of this continuous leakage, a 1T1C capacitor holding a Logical '1' ($V_c = 1.20\text{ V}$) experiences an exponential decay in voltage over time:

$$V_c(t) = V_{DD} \cdot e^{-\frac{t}{\tau_{\text{leak}}}}$$

Where:
* $V_c(t)$ is the remaining voltage on the storage capacitor at time $t$ in volts ($\text{V}$).
* $V_{DD}$ is the initial full supply voltage in volts ($\text{V}$).
* $\tau_{\text{leak}}$ is the equivalent $RC$ discharge time constant of the combined leakage pathways ($\tau_{\text{leak}} = R_{\text{leak}} \cdot C_s$) in seconds ($\text{s}$).

```text
EXPONENTIAL VOLTAGE DECAY AND RETENTION LIMIT

 Voltage Vc
  1.20V ┼─────────────────────── Initial Full Charge (Logic 1)
        │                    \
        │                     \  Exponential Leakage Decay Vc(t)
  0.80V ┼                      \ ◄── MINIMUM SENSABLE THRESHOLD!
        │                       \
  0.60V ┼────────────────────────\───────────────────────── (VDD / 2 Midpoint)
        ◄────────────────────────►
         Retention Time t_REFW (64 ms)
```

If a DRAM cell holding a Logical '1' is left untouched for a few dozen milliseconds, its stored voltage $V_c(t)$ drops below the minimum threshold voltage ($V_{\text{min\_sensable}} \approx 0.80\text{ V}$) required for the column's Sense Amplifier to detect the charge-sharing voltage delta ($\Delta V$). 

If the CPU subsequently attempts to read the cell, the sense amplifier fails, making a mistake and reading a corrupted $0$ instead of $1$!

To prevent data corruption, the memory system must execute **Periodic Refresh Cycles**. Every single row of 1T1C cells across the entire multi-gigabyte DRAM array must be systematically opened, read, amplified, and restored back to $100\%$ full supply voltage ($V_{DD}$) within a fixed, strict time window called the **Retention Time ($t_{\text{REFW}}$)**—typically every **$64\text{ milliseconds}$**.

Here lies the critical performance friction that degrades system throughput: **The Refresh Penalty Stall ($t_{\text{RFC}}$)**.

A refresh operation is essentially a dummy Read-and-Restore cycle executed inside the DRAM chip. 

While a DRAM bank or chip is executing an **Auto-Refresh Command (`REF`)**, its internal sense amplifiers, word lines, and row buffers are physically occupied restoring capacitor charges.

During this time—known as the **Refresh Cycle Time ($t_{\text{RFC}}$)**—**the DRAM bank is completely locked**!

```text
THE REFRESH LOCKUP STALL

 CPU Memory Read Request ──► Dispatches Request to DRAM Bank 0
                                 │
                                 ▼
 DRAM Bank 0 is Currently Executing AUTO-REFRESH (t_RFC = 350 ns)!
                                 │
                                 ▼
 CPU PIPELINE FROZEN FOR 350 NANOSECONDS (1,120 CPU CLOCK CYCLES)!
 (Memory controller queue locked; CPU stalls waiting for data!)
```

The CPU cannot read or write data to that DRAM bank for the entire duration of $t_{\text{RFC}}$, which takes **$350\text{ to } 850\text{ nanoseconds}$** ($1,100 \text{ to } 2,700\text{ CPU clock cycles}$).

As DRAM chip capacities scale from 4 Gigabits to 16 Gigabits, 32 Gigabits, and 64 Gigabits per chip, the number of physical rows grows exponentially. 

Refreshing 131,072 rows every 64 milliseconds consumes up to **$15\%\text{ to } 25\%$ of total DRAM system bandwidth and power**, creating severe CPU execution stalls!

To design high-speed, reliable memory subsystems, hardware engineers must master the physical mechanics of charge leakage, distributed refresh scheduling ($t_{\text{REFI}}$), refresh lockup penalties ($t_{\text{RFC}}$), thermal acceleration of leakage, and fine-granularity refresh mitigations.


### Problem 1: Concrete Seepage and Evaporation (Charge Leakage)

The swimming pools are built on porous soil. Water slowly seeps through microscopic cracks in the concrete walls and evaporates under the hot sun.

* If a pool is filled to the top with water at 8:00 AM (Logical '1'), by 12:00 PM it has lost $20\%$ of its water.
* By 4:00 PM, it has lost $50\%$ of its water.
* If left alone for 64 hours (**Retention Window $t_{\text{REFW}}$**), all the water leaks out completely! A full pool (Logical '1') becomes an empty pool (Logical '0') on its own!

If a guest arrives at a pool after 64 hours, they find a dry concrete pit and cannot swim. Data is lost!

To prevent this, the resort manager hires a maintenance worker (**The DRAM Memory Controller**) who walks around the resort continuously, connects a high-pressure hose to every pool, and **refills every pool back to $100\%$ full every 64 hours** (**Periodic Refresh Cycle**).


### The Scaling Crisis: What Happens When the Resort Expands?

When the resort was small and had only 10 pools:
* The maintenance worker finished refilling all pools quickly.
* Refill maintenance consumed only $0.1\%$ of the resort's day. Guests almost never encountered a closed gate.

Now, suppose the resort expands to **1,000,000 swimming pools** on the same property (**DRAM Capacity Scaling from 1Gb to 64Gb**):

```text
RESORT EXPANSION REFILL CRISIS

 1,000,000 Pools to Refill every 64 Hours!
                            │
                            ▼
 Maintenance worker is refilling pools NON-STOP!
 At any given minute, 20% of all pools in the resort are LOCKED CLOSED!
 Guests spend 20% of their vacation sitting on benches waiting for gates to open!
```

Look at the catastrophe:
* Because there are 1,000,000 pools leaking simultaneously, the maintenance worker must run hoses non-stop 24 hours a day just to keep up with the leakage!
* At any given minute during the day, **$20\%$ of all pools in the resort are locked closed for refilling**!
* Guests spend $20\%$ of their vacation time sitting on benches waiting for locked maintenance gates to open.
* Over $20\%$ of the resort's water, electricity, and labor is burned **just refilling leaking pools**, rather than serving guests!

This resort swimming pool scenario is the exact physical analogue of **DRAM Periodic Refresh Mechanics**:
* The swimming pool is the **1T1C Storage Capacitor ($C_s \approx 25\text{ fF}$)**.
* Water leakage through concrete is **Transistor Subthreshold & Junction Leakage ($I_{\text{leak}}$)**.
* The 64-hour deadline is the **DRAM Retention Window ($t_{\text{REFW}} = 64\text{ ms}$)**.
* The maintenance worker is the **Memory Controller Refresh Scheduler**.
* Locking the pool gate for 10 minutes is the **Refresh Cycle Time ($t_{\text{RFC}} \approx 350\text{ ns}$)**.
* Guests sitting on benches waiting for gates to open are **CPU Execution Pipeline Stalls**.
* Burning $20\%$ of water on refilling is **DRAM Refresh Power and Bandwidth Overhead ($\text{Overhead}_{\text{REF}}$)**.


### Thermal Acceleration of Leakage: The Temperature Dependency Rule

A critical physical property of semiconductor physics is that **junction leakage current increases exponentially with temperature**!

As the silicon die temperature $T$ rises, thermal generation of electron-hole pairs inside the silicon PN-junctions accelerates rapidly according to the Arrhenius equation:

$$I_{\text{junc}}(T) \propto T^3 \cdot e^{-\frac{E_g}{k_B \cdot T}}$$

Where:
* $I_{\text{junc}}(T)$ is the temperature-dependent junction leakage current in amperes ($\text{A}$).
* $T$ is the absolute temperature of the silicon die in Kelvin ($\text{K}$).
* $E_g$ is the energy bandgap of silicon ($\approx 1.12\text{ eV}$).
* $k_B$ is the Boltzmann constant ($8.617 \times 10^{-5}\text{ eV/K}$).

```text
RETENTION WINDOW THERMAL DEGRADATION

 Temperature Range  │ JEDEC Retention Window (t_REFW) │ Average Refresh Interval (t_REFI)
────────────────────┼─────────────────────────────────┼───────────────────────────────────
 Standard (<= 85°C) │ 64 Milliseconds (64,000,000 ns) │ 7.8 Microseconds (7,800 ns)
 High Temp (> 85°C) │ 32 Milliseconds (32,000,000 ns) │ 3.9 Microseconds (3,900 ns)
 (Doubling temperature Cuts retention time in half!)
```

#### The JEDEC Thermal Refresh Rule:
* **Standard Operating Temperature ($\le 85^\circ\text{C}$)**: The memory controller must refresh all rows across the DRAM chip at least once every **$64\text{ milliseconds}$ ($t_{\text{REFW}} = 64\text{ ms}$)**.
* **Elevated Operating Temperature ($85^\circ\text{C} < T \le 105^\circ\text{C}$)**: Elevated heat accelerates charge leakage, cutting the retention time in half! The memory controller **MUST double the refresh rate**, refreshing all rows every **$32\text{ milliseconds}$ ($t_{\text{REFW}} = 32\text{ ms}$)**!


## Primitive 2: Refresh Penalty Stall ($t_{\text{RFC}}$) and Capacity Degradation

Now let us examine the second core primitive: **The Refresh Penalty Stall ($t_{\text{RFC}}$)** and how it degrades system memory availability as DRAM capacity scales.

### Defining the Refresh Cycle Time ($t_{\text{RFC}}$)

When the memory controller dispatches an `AUTO-REFRESH` (`REF`) command to a DRAM chip, the chip enters an internal refresh cycle.

> **The Refresh Cycle Time ($t_{\text{RFC}}$)** is the exact physical time duration (measured in nanoseconds) that a DRAM bank or chip remains locked and inaccessible to external read/write commands while executing an internal auto-refresh operation.

```text
TIMELINE OF AN AUTO-REFRESH COMMAND (t_RFC LOCKUP)

 Memory Bus Command : AUTO-REFRESH Command (REF) Dispatched at t = 0 ns
                      │
                      ▼
 DRAM Bank State    : [ BANK LOCKED & EXECUTING INTERNAL REFRESH ]
                      (All Read and Write Commands REJECTED by DRAM!)
                      ◄────────────────── t_RFC ─────────────────►
                      │                                          │
                      ▼                                          ▼
 Memory Bus Command : t = 0 ns                                  t = t_RFC (Bank Re-opened!)
```

During the entire duration of $t_{\text{RFC}}$:
* The DRAM chip's internal word lines are activated, sense amplifiers fire, and row capacitors are recharged back to $V_{DD}$.
* **The DRAM chip cannot service CPU read or write requests!** Any read or write command sent to the bank during $t_{\text{RFC}}$ is rejected or stalled in the memory controller queue.


### Mathematical Model of Refresh Bandwidth Loss

We can quantify the exact percentage of total memory system availability lost due to background refresh cycles using the **Refresh Overhead Percentage ($\text{Overhead}_{\text{REF}}$)** formula:

$$\text{Overhead}_{\text{REF}} = \frac{t_{\text{RFC}}}{t_{\text{REFI}}} \times 100\%$$

Where:
* $\text{Overhead}_{\text{REF}}$ is the percentage of total DRAM time and bandwidth consumed by background refresh cycles.
* $t_{\text{RFC}}$ is the Refresh Cycle Time in nanoseconds ($\text{ns}$).
* $t_{\text{REFI}}$ is the Average Refresh Interval in nanoseconds ($\text{ns}$).

Let us calculate $\text{Overhead}_{\text{REF}}$ across three different real-world operating scenarios:

#### Scenario A: 8Gb DDR4 Memory at Standard Temperature ($\le 85^\circ\text{C}$)
* $t_{\text{RFC}} = 350\text{ ns}$
* $t_{\text{REFI}} = 7.8\text{ }\mu\text{s} = 7,800\text{ ns}$

$$\text{Overhead}_{\text{REF,A}} = \frac{350\text{ ns}}{7,800\text{ ns}} \times 100\% = \mathbf{4.49\% \text{ Lost Availability}}$$

In an 8Gb memory system at normal temperature, $4.49\%$ of memory bandwidth is lost to refresh. This is manageable.

#### Scenario B: 16Gb DDR5 Memory at High Temperature ($105^\circ\text{C}$)
* At $105^\circ\text{C}$, thermal leakage doubles the refresh rate $\implies t_{\text{REFI}} = 3.9\text{ }\mu\text{s} = 3,900\text{ ns}$.
* $t_{\text{RFC}} = 550\text{ ns}$

$$\text{Overhead}_{\text{REF,B}} = \frac{550\text{ ns}}{3,900\text{ ns}} \times 100\% = \mathbf{14.10\% \text{ Lost Availability!}}$$

At $105^\circ\text{C}$, **$14.10\%$ of all main memory bandwidth is lost** to background refresh!

#### Scenario C: 64Gb DDR5 Memory at High Temperature ($105^\circ\text{C}$)
* $t_{\text{REFI}} = 3,900\text{ ns}$
* $t_{\text{RFC}} = 850\text{ ns}$

$$\text{Overhead}_{\text{REF,C}} = \frac{850\text{ ns}}{3,900\text{ ns}} \times 100\% = \mathbf{21.79\% \text{ Lost Availability!}}$$

```text
REFRESH OVERHEAD PERCENTAGE VS DRAM DENSITY AND TEMPERATURE

 Overhead %
  25% ┼                                                * 64Gb @ 105°C (21.79%)
      │                                               /
  20% ┼                                              /
      │                                             * 16Gb @ 105°C (14.10%)
  15% ┼                                            /
      │                                           /
  10% ┼                                          * 64Gb @ 85°C (10.90%)
      │                                         /
   5% ┼                   * 8Gb @ 85°C (4.49%) /
      └───────────────────┴────────────────────┴────────────────────────► Density / Heat
```

Look at Scenario C!
**Over $21.79\%$ of total system memory bandwidth and power is burned doing nothing except refilling leaking capacitors!** 

One out of every five clock cycles on the memory bus is wasted on background refresh. This exponential degradation is known as **The Refresh Wall**.


## Industrial Mitigations: Fine-Granularity Refresh, Per-Bank Refresh, and Temperature Scaling

To prevent $t_{\text{RFC}}$ latency spikes and reduce refresh bandwidth loss in high-density memory systems, semiconductor standards bodies (JEDEC) and memory architects deploy three primary hardware mitigations:

```text
INDUSTRIAL REFRESH MITIGATION ARCHITECTURES

                         REFRESH MITIGATION STRATEGIES
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
 FINE-GRANULARITY REFRESH       PER-BANK REFRESH             TEMPERATURE-COMPENSATED
 (FGR Mode: 2x / 4x)            (PBREF Mode)                 SELF-REFRESH (TCSR)
 Splits t_RFC into smaller,     Refreshes Bank 0 while       Adjusts t_REFI dynamically
 shorter refresh pulses.        Banks 1..15 stay OPEN!       based on silicon temperature.
```


### Mitigation 2: Per-Bank Refresh (PBREF)

In standard All-Bank Auto-Refresh, an `REF` command locks **ALL banks** inside the DRAM chip simultaneously.

In **Per-Bank Refresh (PBREF)**:
1. The memory controller issues a specialized `PBREF` command targeting a specific bank index (e.g., Bank 0).
2. **Bank 0 enters refresh lockup** ($t_{\text{RFC\_pb}} \approx 120\text{ ns}$).
3. **Banks 1 through 15 remain $100\%$ OPEN and OPERATIONAL!**
4. If the CPU issues a read or write request targeting Bank 2 while Bank 0 is refreshing, **Bank 2 services the request immediately with ZERO stall cycles!**

Per-Bank Refresh hides refresh lockups behind bank-level parallelism, ensuring that the memory subsystem as a whole never freezes completely.


## Solved Industrial Engineering Exercise: Quantitative DRAM Refresh Bandwidth Loss, $t_{\text{RFC}}$ Stall Calculation, and Thermal Scaling Analysis

To consolidate your complete mastery of DRAM periodic refresh mechanics, $t_{\text{REFI}} / t_{\text{RFC}}$ timing equations, thermal leakage acceleration, and fine-granularity refresh mitigations, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Analyze Standard Temperature Operation ($\le 85^\circ\text{C}$)

At $\le 85^\circ\text{C}$, $t_{\text{REFI}} = 7,800\text{ ns}$ and $t_{\text{RFC}} = 350\text{ ns}$.

##### 1. Calculate Refresh Overhead Percentage ($\text{Overhead}_{\text{REF,85}}$):

$$\text{Overhead}_{\text{REF,85}} = \frac{t_{\text{RFC}}}{t_{\text{REFI}}} \times 100\% = \frac{350\text{ ns}}{7,800\text{ ns}} \times 100\% \approx \mathbf{4.487\%}$$

##### 2. Calculate Usable Effective Memory Bandwidth ($\text{BW}_{\text{effective,85}}$):

$$\text{BW}_{\text{effective,85}} = \text{BW}_{\text{peak}} \times (1 - \text{Overhead}_{\text{REF,85}})$$

$$\text{BW}_{\text{effective,85}} = 25.6\text{ GB/s} \times (1 - 0.04487) = 25.6 \times 0.95513 = \mathbf{24.451 \text{ GB/sec}}$$

At $85^\circ\text{C}$, background refresh consumes $1.149\text{ GB/s}$ of bandwidth, leaving **$24.451\text{ GB/sec}$** available for user applications.


#### Step 3: Calculate Worst-Case CPU Read Stall Latency at $105^\circ\text{C}$ (Standard 1x Mode)

A CPU load instruction misses L1/L2 caches and arrives at the DRAM bank at the exact nanosecond an `AUTO-REFRESH` command begins executing ($t_{\text{RFC}} = 350\text{ ns}$).

##### 1. Total Worst-Case Memory Latency ($T_{\text{worst\_1x}}$):
The CPU must wait for the $350\text{-ns}$ refresh cycle to complete, PLUS the standard $40.0\text{-ns}$ DRAM read access time:

$$T_{\text{worst\_1x}} = t_{\text{RFC}} + T_{\text{DRAM\_read}} = 350.0\text{ ns} + 40.0\text{ ns} = \mathbf{390.0 \text{ nanoseconds}}$$

##### 2. Express Stall Latency in CPU Clock Cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$\text{Stall Cycles}_{\text{worst\_1x}} = \frac{T_{\text{worst\_1x}}}{T_{\text{clk}}} = \frac{390.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{1,248 \text{ CPU Clock Cycles}}$$

In 1x Mode at $105^\circ\text{C}$, the worst-case memory read stall spikes to **$1,248\text{ CPU clock cycles}$** ($390.0\text{ ns}$)!


### Sanity Check and Verification

Let us verify our mathematical and physical results against DRAM specifications:

1. **Refresh Count Verification**:
   * Standard $t_{\text{REFW}} = 64\text{ ms} = 64,000,000\text{ ns}$.
   * Number of $1\text{x}$ refresh commands = $\frac{64,000,000\text{ ns}}{7,800\text{ ns}} \approx 8,205\text{ commands}$.
   * At $105^\circ\text{C}$, $t_{\text{REFW}} = 32\text{ ms} = 32,000,000\text{ ns}$.
   * Number of $1\text{x}$ commands = $\frac{32,000,000\text{ ns}}{3,900\text{ ns}} \approx 8,205\text{ commands}$.
   * Number of $4\text{x}$ commands = $\frac{32,000,000\text{ ns}}{975\text{ ns}} \approx 32,820\text{ commands} = 4 \times 8,205$. Matches $4\times$ mode scaling!
2. **Bandwidth Loss Consistency**:
   * Usable bandwidth at $85^\circ\text{C}$ = $25.6 \times (1 - 0.04487) = 24.451\text{ GB/sec}$.
   * Lost bandwidth = $1.149\text{ GB/sec}$. Sum = $25.600\text{ GB/sec}$.
3. **Stall Cycle Conversion**:
   * $390.0\text{ ns} \times 3.2\text{ GHz} = 390.0 \times 3.2 = 1,248\text{ clock cycles}$.
   * $150.0\text{ ns} \times 3.2\text{ GHz} = 150.0 \times 3.2 = 480\text{ clock cycles}$.
   * Conversion between nanoseconds to $3.2\text{-GHz}$ clock cycles is $100\%$ accurate.

All $t_{\text{REFI}} / t_{\text{RFC}}$ timing equations, thermal leakage scaling factors, bandwidth overhead percentages, and FGR 4x latency reduction metrics evaluate with 100% mathematical, physical, and logical precision.

