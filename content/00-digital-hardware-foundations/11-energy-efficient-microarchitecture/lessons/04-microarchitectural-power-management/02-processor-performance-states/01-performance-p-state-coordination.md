content/00-digital-hardware-foundations/11-energy-efficient-microarchitecture/lessons/04-microarchitectural-power-management/02-processor-performance-states/01-performance-p-state-coordination.md
# Hardware-Managed Performance States and Per-Chip eFuse Voltage Binning

When a central processing unit (CPU) core is actively executing software instructions, its instruction throughput demand varies dramatically from microsecond to microsecond. A web browser processing a complex JavaScript layout loop requires maximum execution speed ($3.2\text{ Gigahertz}$) for 5 milliseconds, then drops to a low-throughput state ($1.0\text{ Gigahertz}$) while waiting for user touchscreen input.

To balance active execution performance against dynamic power dissipation ($P_{\text{dyn}} = \alpha \cdot C_L \cdot V_{DD}^2 \cdot f$), microprocessors operate across a spectrum of active operational states known as **Processor Performance States (P-States)**:
* **$P_0$ State (Maximum Performance)**: $V_{DD} = 1.10\text{ Volts}$, $f = 3.2\text{ Gigahertz}$.
* **$P_1$ State (Medium Performance)**: $V_{DD} = 0.90\text{ Volts}$, $f = 2.0\text{ Gigahertz}$.
* **$P_2$ State (Low Power)**: $V_{DD} = 0.70\text{ Volts}$, $f = 1.0\text{ Gigahertz}$.

In early operating systems, P-state transitions were managed entirely by **Software OS Governors** (such as Linux `cpufreq`). The operating system kernel polled CPU utilization counters periodically (e.g., once every $100\text{ milliseconds}$) and issued software commands to adjust frequency.

However, software-managed P-state control suffers from a severe systems engineering flaw: **The Software Governor Polling Lag**.

A $100\text{-millisecond}$ OS polling interval is an eternity in digital microarchitecture—spanning over **$300,000,000\text{ CPU clock cycles}$**! 

```text
THE SOFTWARE OS GOVERNOR POLLING LAG DISASTER

 Web Page Render Burst (5 ms Duration)
 ┌──────────────────┐
 │ 100% CPU Demand! │
 └────────┬─────────┘
          │
          ▼
 OS Software Governor Polling Interval (100 ms Duration)
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ OS Asleep at 1.0 GHz for 100 ms! (300,000,000 Cycles Wasted!)               │
 └──────────────────────────────────────────────┬──────────────────────────────┘
                                                │
                                                ▼
              OS Governor FINALLY Wakes Up & Raises Speed to 3.2 GHz!
              (TOO LATE! Render burst finished 95 ms ago! Power wasted on idle!)
```

Trace the physical performance disaster caused by software governor lag:
1. A user taps the screen, triggering a $5\text{-millisecond}$ web rendering burst that demands $3.2\text{ GHz}$ performance.
2. Because the OS software governor polls only every $100\text{ ms}$, the OS sits asleep for the first $95\text{ ms}$, leaving the CPU locked at a slow $1.0\text{ GHz}$ frequency. The user experiences severe frame stuttering and UI lag!
3. At $t = 100\text{ ms}$, the OS governor finally wakes up, sees high past utilization, and raises the CPU frequency to $3.2\text{ GHz}$.
4. **THE TIMING MISALIGNMENT**: The $5\text{-ms}$ webpage render finished 95 milliseconds ago! The CPU is now locked at $3.2\text{ GHz}$ burning maximum power while sitting completely idle!

A second, equally severe physical friction occurs during semiconductor manufacturing: **The One-Size-Fits-All Voltage Penalty**.

Due to microscopic silicon process variations, Chip A and Chip B coming off the exact same factory wafer have different physical switching speeds:
* **Chip A (Fast Silicon)**: Can safely run $3.2\text{ GHz}$ at a low voltage of $0.92\text{ Volts}$.
* **Chip B (Slow Silicon)**: Requires $1.10\text{ Volts}$ to run safely at $3.2\text{ GHz}$.

If a manufacturer programs both chips with a single, conservative **Global One-Size-Fits-All Voltage Table** ($1.10\text{ V}$ for all chips), Chip A is forced to run at $1.10\text{ V}$ instead of $0.92\text{ V}$. 

Because dynamic power scales quadratically ($P \propto V_{DD}^2$), forcing Chip A to run at $1.10\text{ V}$ wastes **over $43\%$ of its dynamic power** ($(1.10 / 0.92)^2 = 1.43$)!

To eliminate software polling lag and one-size-fits-all voltage waste, modern microarchitectures employ **Hardware-Managed P-States (HWP / CPPC)** and **Per-Chip eFuse Voltage Binning**.

---

## The Human Driver vs. Automatic Cruise Control and the Custom-Tailored Suit

To build an unshakable, intuitive mental model of hardware-autonomous P-state control, eFuse voltage binning, and memory-stall frequency optimization before analyzing execution queue counters and $V_{DD}(f)$ lookup tables, let us consider two everyday analogies: an automatic car cruise control and a custom-tailored suit.

### Analogy 1: The Human Driver vs. Automatic Cruise Control (Software vs. Hardware P-States)

Imagine driving a car across a hilly mountain highway (**Fluctuating Workload Demand**).

```text
HUMAN DRIVER VS AUTOMATIC CRUISE CONTROL ANALOGY

 Software OS Governor (Driver Checking Watch Every 10 Minutes):
 Car hits steep hill ──► Driver is sleeping! Car slows 60 MPH -> 15 MPH (Stutter!)
 10 Minutes Later   ──► Driver checks watch, slams gas pedal to floor!
                        (Car is ALREADY at top of hill! Gas wasted on flat road!)

 Hardware-Managed P-States (Automatic Cruise Control Sensor):
 Car hits steep hill ──► Radar sensor detects speed drop in 1 Millisecond!
                        ──► Throttle opens instantly, holding 60 MPH smoothly!
 (Zero speed drop! Zero wasted gas!)
```

#### The Software Governor Strategy (Driver Checking Watch Every 10 Minutes)
The driver checks their watch once every 10 minutes to adjust the gas pedal.
* The car hits a steep uphill slope (**A $5\text{-ms}$ Compute Burst**).
* The driver is asleep at the wheel and does not adjust the gas pedal for 10 minutes! The car slows down from $60\text{ MPH}$ to $15\text{ MPH}$ and almost stalls on the hill (**UI Stutter and Lag**).
* Ten minutes later, when the car has already reached the top of the hill and is coasting downhill, the driver checks their watch, sees the low speed from earlier, and slams the gas pedal to the floor!
* The car rockets down the flat road at $120\text{ MPH}$, burning gasoline for nothing (**Wasted Dynamic Power**)!

#### The Hardware P-State Strategy (Automatic Cruise Control Sensor)
An automatic cruise control sensor (**Hardware HWP / CPPC Controller**) monitors the wheels **1,000 times per second** ($10\ \mu\text{s}$ sampling loop).
* The exact millisecond the car touches the hill, the sensor detects a 1-MPH speed drop and adjusts the throttle instantly!
* The car cruises up the hill at a smooth, constant $60\text{ MPH}$ without any lag.
* The moment the car reaches the top of the hill, the sensor reduces the throttle, saving fuel instantly!

---

### Analogy 2: One-Size-Fits-All vs. Custom-Tailored Suits (Per-Chip eFuse Binning)

Now, consider a clothing factory manufacturing suits for 100 people of different physical heights and shoulder widths (**Silicon Wafer Manufacturing Variations**).

```text
ONE-SIZE-FITS-ALL VS CUSTOM-TAILORED EFUSE BINNING

 One-Size-Fits-All Factory (Global Voltage Table):
 Factory makes ALL suits Size XXXL to fit the largest person in the group.
 Small and medium people wear heavy, baggy suits (Excessive V_DD Voltage!).
 (Wastes fabric and trips people up!)

 Custom-Tailored eFuse Factory (Per-Chip eFuse Binning):
 Laser scanner measures each person's exact body dimensions at birth.
 Stores dimensions on an ID card (On-Chip eFuse Array).
 Tailors a suit that fits Person A with ZERO excess fabric!
```

#### Strategy A: One-Size-Fits-All (Global Voltage Table)
The factory manufactures every suit in size XXXL to guarantee that even the largest person in the group can wear it.
* Person A (a small, fast person = **Fast Silicon Die**) is forced to wear a giant, heavy XXXL suit.
* Person A trips over the extra fabric, moves slowly, and burns double the energy carrying the heavy suit (**Excessive Supply Voltage $V_{DD}$**)!

#### Strategy B: Custom-Tailored ID Card (Per-Chip eFuse Binning)
During manufacturing, a laser scanner measures Person A's exact dimensions and burns them onto a permanent ID card (**On-Chip eFuse Memory Array**).
* When Person A puts on their suit, the suit adjusts its seams to fit Person A's exact dimensions ($V_{\text{eFuse}} = 0.92\text{ V}$).
* Person A runs at full speed wearing a lightweight, perfectly fitted suit, using $43\%$ less energy than Person B ($V_{\text{eFuse}} = 1.10\text{ V}$)!

---

## Hardware-Managed P-States (HWP / CPPC) Architecture

In modern computing, the responsibility for selecting active operating performance points (P-States) has shifted from slow operating system software governors down into autonomous **Hardware P-State Controllers** (known as Intel Speed Shift / HWP or ACPI Collaborative Processor Performance Control / CPPC).

```text
SOFTWARE GOVERNOR VS HARDWARE-AUTONOMOUS P-STATE CONTROL

 1. Legacy Software Governor Control (Slow OS Polling Loop):
 OS Kernel Timer (100 ms) ──► Reads CPU Util ──► Writes MSR ──► PMU Voltage/Freq Shift
 (Slow 100-ms delay! High software overhead!)

 2. Hardware-Managed P-States (HWP / CPPC Autonomous Loop):
 OS Kernel Sets Range ONCE ──► [ Hardware HWP Engine ] (10 us Sampling Loop)
                                 │ * Reads APERF / MPERF Counters
                                 │ * Evaluates Stall Ratios
                                 ▼
                               Directly Shifts PMIC & Clock Divider in 10 us!
 (10,000x Faster Response! Zero OS Context Switches!)
```

---

### The OS-Hardware Collaborative Contract

Under the CPPC / HWP architectural model, the operating system kernel does **not** manage individual clock frequency transitions. Instead, the OS kernel establishes high-level performance boundaries by writing three values into Model-Specific Registers (MSRs) once during boot-up:

1. **`Minimum_Performance` ($P_{\text{min}}$)**: The lowest P-state the core is permitted to enter (e.g., $1.0\text{ GHz}$).
2. **`Maximum_Performance` ($P_{\text{max}}$)**: The highest P-state the core is permitted to enter (e.g., $3.5\text{ GHz}$).
3. **`Energy_Performance_Preference` ($EPP$)**: An 8-bit energy-versus-performance bias parameter ($0 \dots 255$):
   * $EPP = 0 \implies$ **Performance Bias** (Aggressively boost frequency to $P_0$ on the slightest workload hint).
   * $EPP = 128 \implies$ **Balanced Bias** (Balance energy and throughput).
   * $EPP = 255 \implies$ **Energy Savings Bias** (Prefer low frequency $P_n$ to maximize battery life).

Once these boundaries are programmed, **the OS steps aside entirely**! An autonomous hardware state machine embedded on the CPU die takes over P-state control.

---

### The Microsecond Hardware Evaluation Loop

Every $1 \text{ to } 10\text{ microseconds}$ ($10,000\times$ faster than the OS software governor!), the hardware HWP engine executes a closed-loop evaluation algorithm using on-die performance counters:

```text
HWP ON-DIE HARDWARE EVALUATION LOOP

 On-Die Performance Counters:
   * APERF (Actual Performance Frequency Counter)
   * MPERF (Maximum Reference Frequency Counter)
   * Instructions Retired & Memory Stall Counters
                       │
                       ▼ Evaluated Every 10 Microseconds
 ┌─────────────────────────────────────────────────────────────┐
 │ HWP HARDWARE PERFORMANCE EVALUATION ENGINE                  │
 │  1. Calculate Effective IPC = Retired_Inst / Delta_t        │
 │  2. Calculate Memory Stall Ratio = Stall_Cycles / Delta_t   │
 │  3. Compare against EPP Preference & Target Boundaries      │
 └─────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼ If Memory Stalls High         ▼ If IPC High
      Drop Frequency to P1 !          Boost Frequency to P0 !
      (Saves 60% Power on Stalls)     (Delivers Instant UI Speed!)
```

The HWP engine reads two primary hardware counters:
1. **`APERF` (Actual Performance Counter)**: Increments at the core's *actual* current operating clock frequency $f_{\text{actual}}$.
2. **`MPERF` (Maximum Performance Counter)**: Increments at the core's *maximum reference* frequency $f_{\text{max}}$.

The ratio of `APERF` to `MPERF` over a time window $\Delta t$ reveals the core's true un-throttled performance ratio:

$$\text{Performance Ratio} = \frac{\Delta \text{APERF}}{\Delta \text{MPERF}} = \frac{f_{\text{actual}}}{f_{\text{max}}}$$

Simultaneously, the HWP engine checks the **Instruction Retirement Rate ($\text{IPC}$)** and the **Memory Stall Ratio**:

$$\text{Effective\_IPC} = \frac{\text{Instructions\_Retired}}{\Delta t}$$

$$\text{Memory\_Stall\_Ratio} = \frac{\text{Stall\_Cycles\_Waiting\_DRAM}}{\Delta t}$$

---

### The Memory Stall Frequency Optimization Primitive

Here lies one of the greatest microarchitectural triumphs of Hardware-Managed P-States: **Memory Stall Frequency Optimization**.

Consider a CPU core executing a database query that suffers frequent L3 cache misses. The CPU spends **$80\%$ of its clock cycles frozen in memory stalls**, waiting for data to arrive from off-chip DRAM.

* **Legacy Software Governor Mistake**:
  The OS software governor looks at CPU utilization: *"CPU utilization is 100%!"* 
  
  The OS governor raises the CPU frequency to $3.5\text{ GHz}$ ($V_{DD} = 1.10\text{ V}$).
  
  Does running the CPU at $3.5\text{ GHz}$ speed up off-chip DRAM memory? **NO!** Off-chip DRAM operates on its own fixed clock speed. The CPU core burns $100\text{ Watts}$ of power sitting frozen in memory stalls at $3.5\text{ GHz}$!

* **HWP Hardware Solution**:
  The hardware HWP engine inspects its internal memory stall counter:
  $$\text{Memory\_Stall\_Ratio} = 80\% \quad (\mathbf{\text{MEMORY BOTTLENECK DETECTED!}})$$
  
  HWP recognizes that the execution pipeline is bottlenecked by DRAM, NOT by ALU speed!
  
  HWP **automatically drops the CPU clock frequency from $3.5\text{ GHz} \to 1.8\text{ GHz}$** ($V_{DD}$ drops from $1.10\text{ V} \to 0.75\text{ V}$)!
  
  Dynamic power dissipation drops by **$60\%$**, while database query completion time increases by **less than $1\%$** because the bottleneck was the DRAM bus, not the CPU core!

---

## Per-Chip eFuse Voltage Binning Architecture

Now let us examine the second core primitive: **Per-Chip eFuse Voltage Binning**.

Due to microscopic manufacturing variations in photolithography, chemical etching, and ion implantation across silicon wafers, no two manufactured CPU dies possess identical physical characteristics:

```text
SILICON PROCESS VARIATION Across A WAFER

 Silicon Wafer (1,000 Processed Dies)
 ┌─────────────────────────────────────────────────────────────┐
 │  [ Fast Die A ]            [ Typical Die B ]               │
 │  * Channel Length L = 28nm │ * Channel Length L = 30nm     │
 │  * Low V_th = 0.20 V       │ * Nominal V_th = 0.25 V       │
 │  * Needs ONLY 0.92V @ 3.2G │ * Needs 1.10V @ 3.2G          │
 └─────────────────────────────────────────────────────────────┘
```

* **Fast Silicon (Die A)**: Transistors have slightly shorter channels ($L_{\text{eff}}$) and lower threshold voltages ($V_{\text{th}}$). They switch at extreme speeds, requiring only **$0.92\text{ Volts}$** to reach $3.2\text{ GHz}$.
* **Slow Silicon (Die B)**: Transistors have slightly longer channels and higher $V_{\text{th}}$. They require **$1.10\text{ Volts}$** to switch fast enough for $3.2\text{ GHz}$.

---

### How eFuse Arrays Store Custom $V_{DD}(f)$ Voltage Curves

An **eFuse (Electrically Programmable Fuse)** is an microscopic non-volatile memory cell fabricated directly on the silicon die:
* **Intact Fuse**: Represents a logical $1$ (conducts electricity).
* **Blown Fuse**: An Automated Test Equipment (ATE) machine applies a high-current pulse during factory testing, physically vaporizing the microscopic metal link, representing a logical $0$.

```text
ON-CHIP EFUSE VOLTAGE LOOKUP ARRAY

 On-Chip Non-Volatile eFuse Array (1,024 Bits)
 ┌─────────────────────────────────────────────────────────────┐
 │ P-State P0 (3.2 GHz) Voltage Code ──► 0.92 V (10010010_2)   │
 │ P-State P1 (2.0 GHz) Voltage Code ──► 0.76 V (01110110_2)   │
 │ P-State P2 (1.0 GHz) Voltage Code ──► 0.60 V (01100000_2)   │
 └─────────────┬───────────────────────────────────────────────┘
               │ Read at Power-On Reset
               ▼
 Hardware DVFS Controller Voltage Lookup Table (Custom $V_{DD}(f)$ Curve!)
```

#### The Factory Characterization Process:
1. **Automated Wafer Testing**: At the semiconductor foundry, every manufactured silicon die is placed on an Automated Test Equipment (ATE) probe head before packaging.
2. **Frequency-Voltage Sweeping**: The test machine steps through each operating frequency ($1.0\text{ GHz}, 2.0\text{ GHz}, 3.2\text{ GHz}$) and measures the exact minimum safe supply voltage ($V_{\text{min\_safe}}(f)$) that closes setup timing without errors.
3. **eFuse Burning**: The test machine applies high-current pulses to blow specific eFuses on the die, permanently recording the chip's unique **$V_{DD}(f)$ Voltage Lookup Table**:
   $$\text{eFuse}[P_0] = 0.92\text{ V}, \quad \text{eFuse}[P_1] = 0.76\text{ V}, \quad \text{eFuse}[P_2] = 0.60\text{ V}$$
4. **Boot-Up Hardware Reading**:
   When the chip powers on in the user's computer, the hardware DVFS controller reads the eFuse array during the reset sequence.
   
   When P-State $P_0$ ($3.2\text{ GHz}$) is selected, the controller sets $V_{DD} = 0.92\text{ V}$ instead of the conservative global $1.10\text{ V}$, **instantly saving $30\%\text{ to } 45\%$ of dynamic power for the lifetime of the chip!**

---

## Comparative Power Architecture: Software Governor vs. HWP + eFuse

The following comprehensive matrix compares traditional software-managed P-states against modern hardware-managed P-states with eFuse binning:

```text
P-STATE CONTROL AND VOLTAGE BINNING COMPARISON MATRIX

 Architectural Metric     │ Legacy Software Governor (cpufreq)│ Hardware HWP + eFuse Binning
──────────────────────────┼───────────────────────────────────┼─────────────────────────────────────────────
 Evaluation Frequency     │ 100 Milliseconds (Slow OS Poll)   │ 10 Microseconds (Fast Hardware Loop!)
 P-State Selection Logic  │ Software OS Kernel Driver         │ Autonomous On-Die Hardware Engine
 Voltage Table Source     │ One-Size-Fits-All Global Table    │ Custom Per-Chip eFuse Factory Curve
 Memory Stall Response    │ Ignores stalls (Keeps max freq)   │ Detects stalls & drops freq (Saves 60% W!)
 Workload Responsiveness  │ High UI Stutter and Lag           │ Instantaneous (0 Frame Stutter)
 Dynamic Power Efficiency │ Baseline (Wastes voltage)         │ 30% to 50% Higher Energy Efficiency!
```

---

## Solved Industrial Engineering Exercise: Quantitative Analysis of Software Governor Lag vs. HWP Autonomous P-States, eFuse Binning Savings, and Memory Stall Optimization

To consolidate your complete, mathematical understanding of Processor P-States, HWP/CPPC hardware state machines, eFuse $V_{DD}(f)$ curve binning, and memory-stall frequency optimization, let us work through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect evaluating the active power management performance of a $3.2\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor operates under three candidate P-States:
* **$P_0$ (Max Performance)**: $f_0 = 3.2\text{ GHz}$, Nominal Global $V_0 = 1.10\text{ V}$.
* **$P_1$ (Medium Performance)**: $f_1 = 2.0\text{ GHz}$, Nominal Global $V_1 = 0.90\text{ V}$.
* **$P_2$ (Low Power)**: $f_2 = 1.0\text{ GHz}$, Nominal Global $V_2 = 0.70\text{ V}$.

```text
3.2 GHZ SERVER PROCESSOR P-STATE CONTROL MODEL

 Processor Core Parameters:
   C_core = 450.0 pF (450.0 * 10^-12 F) | Alpha = 0.18

 eFuse Binning Characterization (Chip A - Fast Silicon):
   Chip A eFuse Table:
     * P0 (3.2 GHz) : V_eFuse_0 = 0.92 V (Global = 1.10V)
     * P1 (2.0 GHz) : V_eFuse_1 = 0.76 V (Global = 0.90V)
     * P2 (1.0 GHz) : V_eFuse_2 = 0.60 V (Global = 0.70V)

 Workload Profile (1.0-Second Workload = 1,000 ms):
   * Phase 1 (0 to 10 ms - 10 ms duration)  : Burst Compute (Requires P0)
   * Phase 2 (10 to 100 ms - 90 ms duration): Memory Stall (80% Stalls, Requires P1)
   * Phase 3 (100 to 1000 ms - 900 ms)     : Idle Background (Requires P2)

 Controller Response Times:
   * Software OS Governor (cpufreq) : Polling Interval = 100.0 ms
   * Hardware HWP Controller (CPPC): Evaluation Loop = 0.010 ms (10.0 us)
```

#### Hardware & Power Model Parameters:
* Active Core Capacitance: $C_{\text{core}} = 450.0\text{ pF} = 450.0 \times 10^{-12}\text{ F}$, activity factor $\alpha = 0.18$.
* Dynamic Power Equation: $P_{\text{dyn}} = \alpha \cdot C_{\text{core}} \cdot V_{DD}^2 \cdot f = (0.081 \times 10^{-9}\text{ F}) \cdot V_{DD}^2 \cdot f$.
* **eFuse Factory Characterization for Chip A (Fast Silicon)**:
  * $P_0$ ($3.2\text{ GHz}$): $V_{\text{eFuse0}} = 0.92\text{ V}$ (vs Global $1.10\text{ V}$).
  * $P_1$ ($2.0\text{ GHz}$): $V_{\text{eFuse1}} = 0.76\text{ V}$ (vs Global $0.90\text{ V}$).
  * $P_2$ ($1.0\text{ GHz}$): $V_{\text{eFuse2}} = 0.60\text{ V}$ (vs Global $0.70\text{ V}$).

#### Systems to Compare:
* **System 0 (Software OS Governor — Global Voltage Table)**:
  * Polling interval $= 100.0\text{ ms}$.
  * Uses Global Voltage Table ($1.10\text{ V}, 0.90\text{ V}, 0.70\text{ V}$).
  * During Phase 1 ($0 \dots 10\text{ ms}$), OS is asleep in $P_2$ ($1.0\text{ GHz}$)! Workload takes $3.2\times$ longer ($32.0\text{ ms}$).
  * During Phase 2 ($10 \dots 100\text{ ms}$), OS detects high utilization and locks CPU at $P_0$ ($3.2\text{ GHz}, 1.10\text{ V}$) for the entire $100\text{-ms}$ window!
* **System 1 (Hardware HWP Controller — Per-Chip eFuse Binning)**:
  * Evaluation loop $= 10.0\ \mu\text{s}$ ($0.010\text{ ms}$).
  * Uses Chip A's eFuse Voltage Table ($0.92\text{ V}, 0.76\text{ V}, 0.60\text{ V}$).
  * Responds to Phase 1 in $10\ \mu\text{s}$, running $P_0$ ($3.2\text{ GHz}, 0.92\text{ V}$) for $10\text{ ms}$.
  * Responds to Phase 2 memory stalls in $10\ \mu\text{s}$, dropping to $P_1$ ($2.0\text{ GHz}, 0.76\text{ V}$) for $90\text{ ms}$.
  * Responds to Phase 3 in $10\ \mu\text{s}$, dropping to $P_2$ ($1.0\text{ GHz}, 0.60\text{ V}$) for $900\text{ ms}$.

---

### Your Objective

1. Calculate dynamic power $P_{\text{dyn}}$ for P-States $P_0, P_1, P_2$ under the **Global Voltage Table** vs **Chip A eFuse Table**.
2. Calculate the percentage dynamic power savings achieved purely by **Per-Chip eFuse Binning** at state $P_0$.
3. Trace the execution time and energy consumed during the 1,000-ms workload for **System 0 (Software Governor)**.
4. Trace the execution time and energy consumed during the 1,000-ms workload for **System 1 (Hardware HWP + eFuse)**.
5. Calculate total energy saved (in Joules) and the overall **Energy Efficiency Speedup Factor** of System 1 over System 0.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Dynamic Power for P-States Across Voltage Tables

Using $P_{\text{dyn}} = (0.081 \times 10^{-9}\text{ F}) \cdot V_{DD}^2 \cdot f$:

##### 1. Global Voltage Table ($1.10\text{ V}, 0.90\text{ V}, 0.70\text{ V}$):
* **$P_0$ ($3.2\text{ GHz}, 1.10\text{ V}$)**:
  $$P_{\text{global0}} = (0.081 \times 10^{-9}) \times (1.10)^2 \times (3.2 \times 10^9) = (0.081 \times 10^{-9}) \times 1.21 \times 3.2 \times 10^9 = \mathbf{313.632 \text{ mW}}$$
* **$P_1$ ($2.0\text{ GHz}, 0.90\text{ V}$)**:
  $$P_{\text{global1}} = (0.081 \times 10^{-9}) \times (0.90)^2 \times (2.0 \times 10^9) = (0.081 \times 10^{-9}) \times 0.81 \times 2.0 \times 10^9 = \mathbf{131.220 \text{ mW}}$$
* **$P_2$ ($1.0\text{ GHz}, 0.70\text{ V}$)**:
  $$P_{\text{global2}} = (0.081 \times 10^{-9}) \times (0.70)^2 \times (1.0 \times 10^9) = (0.081 \times 10^{-9}) \times 0.49 \times 1.0 \times 10^9 = \mathbf{39.690 \text{ mW}}$$

---

##### 2. Chip A eFuse Voltage Table ($0.92\text{ V}, 0.76\text{ V}, 0.60\text{ V}$):
* **$P_0$ ($3.2\text{ GHz}, 0.92\text{ V}$)**:
  $$P_{\text{eFuse0}} = (0.081 \times 10^{-9}) \times (0.92)^2 \times (3.2 \times 10^9) = (0.081 \times 10^{-9}) \times 0.8464 \times 3.2 \times 10^9 = \mathbf{219.387 \text{ mW}}$$
* **$P_1$ ($2.0\text{ GHz}, 0.76\text{ V}$)**:
  $$P_{\text{eFuse1}} = (0.081 \times 10^{-9}) \times (0.76)^2 \times (2.0 \times 10^9) = (0.081 \times 10^{-9}) \times 0.5776 \times 2.0 \times 10^9 = \mathbf{93.571 \text{ mW}}$$
* **$P_2$ ($1.0\text{ GHz}, 0.60\text{ V}$)**:
  $$P_{\text{eFuse2}} = (0.081 \times 10^{-9}) \times (0.60)^2 \times (1.0 \times 10^9) = (0.081 \times 10^{-9}) \times 0.36 \times 1.0 \times 10^9 = \mathbf{29.160 \text{ mW}}$$

```text
POWER DISSIPATION MATRIX ACROSS P-STATES & VOLTAGE TABLES

 P-State / Frequency │ Global Table Power (mW) │ eFuse Table Power (mW) │ eFuse Power Savings %
─────────────────────┼─────────────────────────┼────────────────────────┼───────────────────────
 P0 (3.2 GHz)        │ 313.63 mW (1.10V)       │ 219.39 mW (0.92V)      │ 30.05% SAVED!
 P1 (2.0 GHz)        │ 131.22 mW (0.90V)       │  93.57 mW (0.76V)      │ 28.69% SAVED!
 P2 (1.0 GHz)        │  39.69 mW (0.70V)       │  29.16 mW (0.60V)      │ 26.53% SAVED!
```

##### eFuse Binning Power Savings at $P_0$:

$$\text{Savings}_{\text{eFuse0}} = \left( 1 - \frac{219.387\text{ mW}}{313.632\text{ mW}} \right) \times 100\% = \mathbf{30.05\% \text{ Power Reduction!}}$$

Per-chip eFuse binning reduced $P_0$ power consumption by **$30.05\%$ ($94.25\text{ mW}$ saved)**!

---

#### Step 2: Trace System 0 Workload Execution (Software OS Governor)

Software governor polling interval $= 100.0\text{ ms}$. Initial state $= P_2$ ($1.0\text{ GHz}, 39.69\text{ mW}$).

1. **Phase 1 Burst ($0 \dots 10\text{ ms}$)**:
   * Requires $3.2 \times 10^7$ clock cycles ($10\text{ ms}$ at $3.2\text{ GHz}$).
   * OS is asleep in $P_2$ ($1.0\text{ GHz}$).
   * Time to complete Phase 1 at $1.0\text{ GHz}$:
     $$t_{\text{phase1\_sys0}} = \frac{3.2 \times 10^7 \text{ cycles}}{1.0 \times 10^9 \text{ Hz}} = \mathbf{0.0320 \text{ seconds}} = \mathbf{32.0 \text{ ms}}$$
   * Energy consumed during Phase 1 ($32.0\text{ ms}$ at $39.69\text{ mW}$):
     $$E_{\text{phase1\_sys0}} = 0.03969\text{ W} \times 0.0320\text{ s} = \mathbf{0.001270 \text{ Joules}}$$

2. **Phase 2 Memory Stalls ($32 \dots 100\text{ ms}$ — $68\text{ ms}$ duration)**:
   * OS governor detects $100\%$ utilization at $t = 100\text{ ms}$ and raises speed to $P_0$ ($3.2\text{ GHz}, 313.63\text{ mW}$).
   * Time in Phase 2 at $P_2$ ($1.0\text{ GHz}$): $68.0\text{ ms}$.
   * Energy consumed: $E = 0.03969\text{ W} \times 0.0680\text{ s} = \mathbf{0.002699 \text{ Joules}}$.

3. **Phase 2 Continuation ($100 \dots 122\text{ ms}$ — $22\text{ ms}$ duration at $P_0$)**:
   * OS governor switched to $P_0$ ($3.2\text{ GHz}, 313.63\text{ mW}$) for remaining $22\text{ ms}$ of Phase 2!
   * Energy consumed: $E = 0.313632\text{ W} \times 0.0220\text{ s} = \mathbf{0.006900 \text{ Joules}}$.

4. **Phase 3 Idle ($122 \dots 1,000\text{ ms}$ — $878\text{ ms}$ duration)**:
   * OS governor remains locked in $P_0$ ($313.63\text{ mW}$) for next $78\text{ ms}$ until next $100\text{-ms}$ poll ($t = 200\text{ ms}$), then drops to $P_2$ ($39.69\text{ mW}$) for remaining $800\text{ ms}$:
   * Energy ($78\text{ ms}$ at $P_0$): $0.313632\text{ W} \times 0.0780\text{ s} = \mathbf{0.024463 \text{ Joules}}$.
   * Energy ($800\text{ ms}$ at $P_2$): $0.039690\text{ W} \times 0.8000\text{ s} = \mathbf{0.031752 \text{ Joules}}$.

##### Total System 0 Execution Metrics:
* Total Workload Execution Time $= 32.0 + 90.0 + 878.0 = \mathbf{1,000.0 \text{ ms}} = \mathbf{1.000 \text{ s}}$ (with $22\text{ ms}$ user lag in Phase 1!).
* Total Energy Consumed ($E_{\text{System0}}$):
  $$E_{\text{System0}} = 0.001270 + 0.002699 + 0.006900 + 0.024463 + 0.031752 = \mathbf{0.067084 \text{ Joules}}$$

---

#### Step 3: Trace System 1 Workload Execution (Hardware HWP + eFuse)

HWP evaluation loop $= 10.0\ \mu\text{s}$ ($0.010\text{ ms}$). Uses eFuse table ($219.39\text{ mW}, 93.57\text{ mW}, 29.16\text{ mW}$).

1. **Phase 1 Burst ($0 \dots 10\text{ ms}$)**:
   * HWP detects burst at $t = 0.010\text{ ms}$ and shifts to $P_0$ ($3.2\text{ GHz}, 219.39\text{ mW}$) in $10\ \mu\text{s}$!
   * Phase 1 completes in $10.0\text{ ms}$ ($0\text{ user lag!}$).
   * Energy consumed: $E_{\text{phase1\_sys1}} = 0.219387\text{ W} \times 0.0100\text{ s} = \mathbf{0.002194 \text{ Joules}}$.

2. **Phase 2 Memory Stalls ($10 \dots 100\text{ ms}$ — $90\text{ ms}$ duration)**:
   * HWP detects $80\%$ memory stall ratio at $t = 10.010\text{ ms}$ and drops to $P_1$ ($2.0\text{ GHz}, 93.57\text{ mW}$)!
   * Energy consumed: $E_{\text{phase2\_sys1}} = 0.093571\text{ W} \times 0.0900\text{ s} = \mathbf{0.008421 \text{ Joules}}$.

3. **Phase 3 Idle ($100 \dots 1,000\text{ ms}$ — $900\text{ ms}$ duration)**:
   * HWP detects idle state at $t = 100.010\text{ ms}$ and drops to $P_2$ ($1.0\text{ GHz}, 29.16\text{ mW}$)!
   * Energy consumed: $E_{\text{phase3\_sys1}} = 0.029160\text{ W} \times 0.9000\text{ s} = \mathbf{0.026244 \text{ Joules}}$.

##### Total System 1 Execution Metrics:
* Total Workload Execution Time $= 10.0 + 90.0 + 900.0 = \mathbf{1,000.0 \text{ ms}} = \mathbf{1.000 \text{ s}}$ ($0\text{ user lag!}$).
* Total Energy Consumed ($E_{\text{System1}}$):
  $$E_{\text{System1}} = 0.002194 + 0.008421 + 0.026244 = \mathbf{0.036859 \text{ Joules}}$$

---

#### Step 4: Calculate Energy Savings and Performance Speedup

Let us compare System 0 (Software Governor) vs. System 1 (Hardware HWP + eFuse):

##### 1. Total Energy Saved:

$$\Delta E_{\text{saved}} = E_{\text{System0}} - E_{\text{System1}} = 0.067084\text{ J} - 0.036859\text{ J} = \mathbf{0.030225 \text{ Joules Saved!}}$$

##### 2. Percentage Energy Savings:

$$\text{Energy Savings \%} = \left( 1 - \frac{E_{\text{System1}}}{E_{\text{System0}}} \right) \times 100\% = \left( 1 - \frac{0.036859\text{ J}}{0.067084\text{ J}} \right) \times 100\%$$

$$\text{Energy Savings \%} = (1 - 0.54944) \times 100\% = \mathbf{45.06\% \text{ Total Energy Saved!}}$$

##### 3. Phase 1 Responsiveness Speedup:
* System 0 Phase 1 execution time $= 32.0\text{ ms}$ (due to $100\text{-ms}$ governor lag).
* System 1 Phase 1 execution time $= 10.0\text{ ms}$ (instant $10\ \mu\text{s}$ HWP shift).

$$\text{Responsiveness Speedup} = \frac{32.0\text{ ms}}{10.0\text{ ms}} = \mathbf{3.20\times \text{ Faster User Response!}}$$

```text
SYSTEM PERFORMANCE AND ENERGY SAVINGS SUMMARY

 Architectural Metric    │ System 0 (Software Governor) │ System 1 (Hardware HWP + eFuse) │ HWP + eFuse Gain
─────────────────────────┼──────────────────────────────┼─────────────────────────────────┼──────────────────
 Phase 1 Burst Duration  │ 32.0 ms (User Stutter Lag!)  │ 10.0 ms (Instant 3.2 GHz Shift) │ 3.20x Faster!
 Phase 2 Memory Power    │ 313.63 mW (Locked in P0)     │ 93.57 mW (Dropped to P1)        │ 70.2% Power Cut
 Total Workload Energy   │ 0.06708 Joules               │ 0.03686 Joules                  │ 45.06% SAVED!
```

##### Engineering Conclusion:
By combining hardware-autonomous P-state selection (HWP) with per-chip eFuse binning, System 1 **eliminated 22 ms of user-visible UI stutter**, reduced memory-stall power by $70.2\%$, and **cut total workload energy consumption by $45.06\%$ ($30.23\text{ mJ}$ saved per second)**!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and state machine derivations:

1. **eFuse Power Reduction Check at $P_0$**:
   * Global $V_0 = 1.10\text{ V} \implies V^2 = 1.21$.
   * eFuse $V_0 = 0.92\text{ V} \implies V^2 = 0.8464$.
   * Ratio $= 0.8464 / 1.21 = 0.6995$.
   * Power ratio $= 219.387 / 313.632 = 0.6995$.
   * Power savings $= (1 - 0.6995) \times 100\% = 30.05\%$. Math verified $100\%$!

2. **Phase 1 Cycle Count Consistency**:
   * Required cycles $= 10\text{ ms} \times 3.2\text{ GHz} = 3.2 \times 10^7\text{ cycles}$.
   * At $1.0\text{ GHz}$, time $= 3.2 \times 10^7 / 1.0 \times 10^9 = 32.0\text{ ms}$. Conversion verified $100\%$!

3. **Energy Component Integration Check**:
   * $E_{\text{System1}} = 0.002194 + 0.008421 + 0.026244 = 0.036859\text{ J}$.
   * Sum matches energy component totals with 100% precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your microarchitectural design toolbox:

* **Processor P-States (HWP / CPPC)**: Hardware-managed active operational performance states ($P_0 \dots P_n$) where an on-die autonomous state controller evaluates instruction throughput and memory stall ratios every microsecond ($1 \dots 10\ \mu\text{s}$) to adjust clock frequency and supply voltage dynamically without software governor polling lag.
* **Per-Chip eFuse Binning**: The factory characterization and non-volatile memory programming technique where unique $V_{DD}(f)$ voltage-frequency curves are burned into on-chip eFuse arrays during manufacturing, enabling each individual silicon die to operate at its minimum safe voltage without static one-size-fits-all guardbands.