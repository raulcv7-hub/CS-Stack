content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/03-physical-microarchitectural-attacks/01-dram-rowhammer-mechanics/04-per-row-activation-counting-prac.md
# Per-Row Activation Counting (PRAC) Architecture and In-DRAM Activation Tracking Mechanics

In high-density Dynamic Random-Access Memory (DRAM) architectures, such as DDR5 and High Bandwidth Memory (HBM3), physical storage cells are manufactured at sub-10-nanometer process nodes. Placing memory storage capacitors mere nanometers apart increases memory density, but it dramatically reduces the threshold of electrical charge required to corrupt a stored binary state. When a software process repeatedly activates and precharges a memory row (an Aggressor Row), high-voltage electrical pulses ($V_{\text{PP}} \approx 2.5\text{ V}$) applied to its copper wordline induce parasitic capacitive cross-coupling and sub-threshold leakage currents in adjacent, un-accessed memory rows (Victim Rows). In early DDR4 memory systems, hardware vendors attempted to mitigate this physical Rowhammer vulnerability using heuristic Target Row Refresh (TRR) mechanisms, which periodically sampled incoming row activation addresses or tracked activations in small, fixed-size 8-slot tables. However, as DRAM cell sizes shrank below 10 nanometers in DDR5, the physical Rowhammer activation threshold required to cause a bit-flip dropped from 100,000 activations down to less than 5,000 activations within a 64-millisecond refresh window. At an activation threshold of 5,000, all heuristic TRR sampling mechanisms fail completely: complex multi-row hammering patterns (such as Blacksmith or Half-Double attacks) easily overflow small TRR tables, causing the sampling logic to miss the primary aggressors. To guarantee $100\%$ deterministic protection against Rowhammer in DDR5 memory without globally quadrupling background refresh rates, JEDEC standards and memory architects abandoned heuristic sampling and introduced **Per-Row Activation Counting (PRAC)** and **In-DRAM Activation Tracking**. Instead of estimating or sampling row activity, PRAC integrates dedicated hardware activation counters directly onto the silicon die of each DRAM chip, tracking the exact activation count of every physical row in every memory bank. When any row's counter reaches a safety threshold, the DRAM chip asserts a hardware alert or instructs the host memory controller to issue a targeted **Refresh Management (RFM)** command, refreshing the adjacent victim rows before any capacitor can leak enough charge to flip a bit.

```text
PER-ROW ACTIVATION COUNTING (PRAC) IN-DRAM ARCHITECTURE

 Incoming Host ACT Commands
 ──► [ Row Address A ] ──────────────────────────────────────────────┐
                                                                     │
 In-DRAM Silicon Logic (DDR5 Die)                                    │
 ┌─────────────────────────────────────────────────────────────┐     │
 │ IN-DRAM PER-ROW COUNTER ARRAY (65,536 Counters per Bank)    │◄────┘
 │ Row 0x0000 : Count = 12                                     │
 │ Row 0x0042 : Count = 4,999 ──► Increment! Count = 5,000!     │
 └─────────────┬───────────────────────────────────────────────┘
               │
               ▼ Counter Reaches Alert Threshold (5,000)!
 Assert In-DRAM Alert Signal / Trigger Refresh Management (RFM)!
 Host Memory Controller issues Emergency Targeted Refresh to Row 0x0042 +/- 1!
 (100% Deterministic Protection! Zero Table Overflow Vulnerabilities!)
```

---

## The Turnstile Gate with Individual Digital Counters

To build an intuitive, crystal-clear mental model of how Per-Row Activation Counting (PRAC) delivers deterministic protection against Rowhammer attacks where heuristic sampling failed, let us consider an everyday analogy: a busy amusement park entrance.

Imagine a large amusement park (a DRAM Memory Bank) containing 10,000 individual entrance turnstiles (10,000 DRAM Memory Rows). Each turnstile leads to a narrow wooden footbridge (**A Victim Memory Row**).

The footbridges are built out of thin, flexible wood. If a single turnstile is opened and slammed shut 5,000 times in an hour, the physical vibrations travel through the ground and shake the wooden footbridge directly next to it. If the footbridge vibrates too much, a delicate glass sculpture balancing on the footbridge falls off and shatters (**A Physical Bit-Flip**)!

To prevent footbridges from collapsing, the park manager must send a maintenance crew to reinforce the bridge (**Issue an Emergency Targeted Refresh**) whenever an adjacent turnstile is slammed too many times.

Let us compare two different security strategies for monitoring the 10,000 turnstiles:

### Strategy 1: The Overwhelmed Guard with a Small Notepad (Heuristic TRR)
The park manager hires 1 security guard to watch all 10,000 turnstiles. The guard holds a small notepad with room to write down **only 4 turnstile numbers** ($N_{\text{slots}} = 4$).
* The guard cannot watch all 10,000 turnstiles at once. Every 10 seconds, the guard glances at a random turnstile (**Probabilistic Sampling**).
* If a crowd of pranksters slams 16 different turnstiles in a complex, alternating rhythm (Many-Sided Hammering), the guard's small notepad fills up immediately. The guard erases old numbers to make room for new ones.
* **The Failure**: Turnstile #42 is slammed 5,000 times, but its count on the guard's notepad keeps getting erased! The guard never notices Turnstile #42, no maintenance crew is sent, and the adjacent footbridge collapses!

```text
STRATEGY 1: OVERWHELMED GUARD (HEURISTIC TRR)

 16 Turnstiles Slammed in Complex Rhythm ──► Guard's 4-Slot Notepad Fills Up!
                                          ──► Guard Erases Old Numbers!
                                          ──► Turnstile #42 Count Lost!
                                              (Footbridge #43 Collapses!)
```

---

### Strategy 2: Per-Door Mechanical Odometers (In-DRAM PRAC)

Realizing that a single guard with a small notepad is easily tricked by complex crowd patterns, the park manager removes the guard and installs a **mechanical digital counter (a PRAC In-DRAM Counter)** onto **EVERY SINGLE TURNSTILE**:

```text
STRATEGY 2: PER-DOOR MECHANICAL ODOMETERS (IN-DRAM PRAC)

 Turnstile #42 Opened ──► Digital Counter #42 Clicks Up: 4,999 -> 5,000!
                         │
                         ▼
 Counter Reaches 5,000 ──► Red Alarm Light Flashes above Turnstile #42!
                         │
                         ▼
 Maintenance Crew sees light ──► Reinforces Footbridge #41 and #43 in 10 Seconds!
                                 Resets Counter #42 back to 0!
 (100% Deterministic! Zero missed turnstiles! Footbridge NEVER collapses!)
```

Trace how Strategy 2 operates:
1. Every single turnstile in the park has its own permanent, hardwired digital counter mounted directly to its frame.
2. Every single time Turnstile #42 is opened, Turnstile #42's own digital counter clicks up by one: $1 \to 2 \to 3 \dots 4,999 \to 5,000$.
3. **The Alarm Event**: When Turnstile #42's counter reaches 5,000, a bright red alarm light mounted above Turnstile #42 flashes (**`ALERT_n` Pin / RFM Signal**).
4. The maintenance crew sees the flashing light, pauses incoming traffic for 10 seconds, and reinforces footbridges #41 and #43 (**Targeted Refresh to $WL_{A-1}$ and $WL_{A+1}$**).
5. Counter #42 resets back to 0.

Look at what Strategy 2 achieved:
* **Zero Guesswork**: The system does not sample or estimate; it counts $100\%$ of all door openings.
* **Zero Table Overflows**: There is no central notepad to fill up or erase! Every door has its own counter.
* **$100\%$ Absolute Guarantee**: It is physically impossible for any turnstile to be opened 5,000 times without triggering the alarm light and reinforcing the adjacent footbridges!

This per-door odometer system is the exact physical analogue of **Per-Row Activation Counting (PRAC)**:
* The 10,000 turnstiles are **Physical DRAM Memory Rows ($WL_0 \dots WL_{9999}$)**.
* Slamming a turnstile is an **`ACTIVATE` Command on a Wordline**.
* The delicate glass sculpture shattering is a **DDR5 Rowhammer Bit-Flip ($1 \to 0$)**.
* The guard with the small notepad is **Heuristic Target Row Refresh (TRR)**.
* The individual digital counters mounted on every door are **In-DRAM PRAC Hardware Counters**.
* The red alarm light flashing is the **DDR5 Refresh Management (`RFM`) Signal**.
* Reinforcing adjacent footbridges is an **Emergency Targeted Refresh Cycle**.

---

## The Collapse of Heuristic TRR at Sub-10nm DRAM Densities

To understand why memory architects were forced to invent Per-Row Activation Counting, we must examine the physical scaling limits of DRAM silicon manufacturing.

### The Physics of Sub-10nm Cell Scaling

As DRAM manufacturers transitioned from 30nm down to 1x-nm, 1y-nm, 1z-nm, and $1\alpha\text{-nm}$ (sub-10nm) silicon process nodes, the physical dimensions of 1T1C memory cells shrank dramatically:

```text
DRAM SILICON DENSITY SCALING VS. ROWHAMMER THRESHOLD

 Process Node  │ Cell Capacitance (C_cell) │ Physical Row Spacing │ Bit-Flip Threshold (N_flip)
───────────────┼───────────────────────────┼──────────────────────┼─────────────────────────────
 30nm (DDR3)   │   ~30.0 fF                │   ~35 nm             │ ~150,000 Activations
 20nm (DDR4)   │   ~20.0 fF                │   ~22 nm             │ ~50,000 Activations
 10nm (DDR5)   │   ~10.0 fF                │   ~12 nm             │ ~4,000 Activations!
 <8nm (Future) │   ~6.0 fF                 │   ~8 nm              │ < 1,000 Activations!
```

Look at the physical numbers in the table above:
1. **Capacitance Shrinkage**: A $10\text{-nm}$ DDR5 storage capacitor ($C_{\text{cell}} \approx 10\text{ fF}$) holds less than one-third the electrical charge of a $30\text{-nm}$ DDR3 capacitor.
2. **Proximity Coupling**: Because wordlines are placed mere nanometers apart, the parasitic cross-coupling capacitance ($C_{\text{cross}}$) between adjacent wordlines increases significantly.
3. **Threshold Collapse**: The number of activations required to cause a Rowhammer bit-flip dropped from $150,000$ down to **less than $4,000$ activations** within a single $64\text{-millisecond}$ refresh window ($t_{\text{REFI}} = 64\text{ ms}$)!

---

### Why Heuristic Sampling Fails at $4,000$ Activations

Why can heuristic sampling TRR (the guard with the small notepad) not defend a DRAM chip when the bit-flip threshold is $4,000$ activations?

Let us evaluate the mathematics of sampling probability:

Suppose a DRAM bank experiences $1,400,000$ total row activations within a $64\text{-ms}$ window. An attacker executes a Many-Sided hammering attack across $M = 32$ aggressor rows.

Each aggressor row is activated $N_{\text{agg}} = \frac{1,400,000}{32} \approx 43,750\text{ times}$.

If the TRR unit uses a sampling rate of 1 out of 64 activations ($P_{\text{sample}} = \frac{1}{64}$), and its tracking table holds $N_{\text{slots}} = 8$ entries:

```text
MANY-SIDED HAMMERING VS TRR SAMPLING CAPACITY

 32 Aggressor Rows Hammered concurrently
 ┌─────────────────────────────────────────────────────────────┐
 │ TRR SAMPLING TABLE (Holds 8 Entries)                        │
 │ Slot 0..7: [ A0 ][ A1 ][ A2 ][ A3 ][ A4 ][ A5 ][ A6 ][ A7 ] │ ◄── 100% FULL!
 └─────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
 Next Sample: Aggressor A8 Arrives ──► Table Overflows!
 LRU Replacement Evicts A0! Counter for A0 is RESET TO ZERO!
 (An aggressor activated 43,750 times is continuously erased from the table!)
```

1. **Table Thrashing**: The 32 aggressor rows constantly compete for the 8 table slots.
2. **Counter Invalidation**: Every time an entry is evicted from the TRR table to make room for a new sampled row, **its accumulated activation counter is reset to zero ($C \Leftarrow 0$)**!
3. **The Mathematical Failure**: An aggressor row $A_0$ is activated $43,750\text{ times}$ (exceeding the $4,000\text{-activation}$ bit-flip threshold by $10\times$!), but its count in the TRR table never reaches $4,000$ because its entry is evicted and reset 50 times during the $64\text{-ms}$ window!

Heuristic TRR fails completely. To defend sub-10nm DRAM, the memory architecture **must track $100\%$ of all rows deterministically without sampling or table evictions**.

---

## Per-Row Activation Counting (PRAC) Architecture

To provide $100\%$ deterministic protection against Rowhammer, JEDEC and memory architects developed **Per-Row Activation Counting (PRAC)**.

PRAC moves the activation tracking logic away from heuristic host sampling tables and embeds **dedicated hardware activation counters directly onto the silicon die of each DDR5 DRAM chip**.

```text
DDR5 SDRAM DIE WITH INTEGRATED PRAC LOGIC

 DDR5 DRAM Physical Silicon Die
 ┌─────────────────────────────────────────────────────────────┐
 │ DRAM Memory Bank Array (e.g., 65,536 Rows per Bank)         │
 │  * Wordline Drivers & 1T1C Storage Cells                    │
 ├─────────────────────────────────────────────────────────────┤
 │ IN-DRAM PRAC LOGIC SUBSYSTEM                                │
 │  * Row Address Decoder & Counter Array (1 Counter / Row)    │
 │  * Alert Signal Logic Generator                             │
 └─────────────────────────────┬───────────────────────────────┘
                               │
                               ▼ Physical ALERT_n Pin / Bus Message
 Host CPU / DDR5 Memory Controller
 (Receives Alert Signal -> Issues Refresh Management (RFM) Command!)
```

---

### The In-DRAM Counter Array Architecture

Inside each DDR5 DRAM chip, every memory bank contains a dedicated **In-DRAM Counter Array**:

For a DRAM bank containing $N_{\text{rows}} = 65,536\text{ rows}$ ($2^{16}$ rows):
* The PRAC subsystem contains $65,536$ individual counter registers embedded within the bank's control logic.
* Each counter is a $B_{\text{counter}}\text{-bit}$ hardware register (typically $B_{\text{counter}} = 6 \text{ to } 8\text{ bits}$, capable of counting up to $256 \text{ or } 512$ activations before issuing an alert or rolling over).

```text
IN-DRAM PRAC COUNTER ARRAY STRUCTURE

 Bank Row Index [15:0]      Counter Value (6 Bits)    Alert State Bit
 ┌─────────────────────────┬─────────────────────────┬───────────────┐
 │ Row 0x0000              │ 000100_2  (4)           │ 0             │
 │ Row 0x0001              │ 000000_2  (0)           │ 0             │
 │ ...                     │ ...                     │ ...           │
 │ Row 0x0042 (Aggressor)  │ 111111_2  (63 - MAX!)   │ 1 (ALERT!)    │
 └─────────────────────────┴─────────────────────────┴───────────────┘
  (One dedicated 6-bit counter register per physical DRAM row!)
```

#### How In-DRAM Counter Storage Achieves Silicon Efficiency:
How do memory manufacturers fit 65,536 counters onto a tiny DRAM silicon die without consuming excessive surface area?

1. **Compact SRAM/eDRAM Technology**: The counters are constructed using high-density 6T SRAM or embedded DRAM (eDRAM) cells fabricated on the peripheral logic region of the DRAM die.
2. **Minimal Silicon Area Overhead**: For a $65,536\text{-row}$ bank, a 6-bit counter per row requires:
   $$\text{Counter Array Size} = 65,536 \text{ rows} \times 6 \text{ bits/row} = 393,216 \text{ bits} = \mathbf{49.152 \text{ Kilobytes per Bank}}$$
   $49.152\text{ KB}$ of SRAM per bank represents **less than $0.5\%$ of the total silicon die surface area**, providing complete $100\%$ row coverage at negligible manufacturing cost!

---

### The In-DRAM Activation Tracking Protocol

Every time an `ACTIVATE` command (`ACT $WL_A$`) is issued by the host memory controller:

1. **Step 1: Row Address Decoding**:
   The DDR5 DRAM chip receives the 16-bit row address $A = \text{0x0042}$ on its address pins.
2. **Step 2: Counter Increment**:
   The internal PRAC logic decodes address $A$ and increments Row $A$'s dedicated counter:
   $$C_{\text{row}}[A] \Leftarrow C_{\text{row}}[A] + 1$$
3. **Step 3: Threshold Evaluation**:
   The PRAC logic compares $C_{\text{row}}[A]$ against the hardware **Alert Threshold ($N_{\text{PRAC\_alert}}$)** (e.g., $N_{\text{PRAC\_alert}} = 500$ activations):
   * **If $C_{\text{row}}[A] < N_{\text{PRAC\_alert}}$**: Normal operation. The memory access completes.
   * **If $C_{\text{row}}[A] == N_{\text{PRAC\_alert}}$**: **THE PRAC ALERT FIRES!**

```text
PRAC IN-DRAM ACTIVATION TRACKING STATE MACHINE

 Host issues ACT Command to Row A
               │
               ▼
 In-DRAM PRAC Logic: C_row[A] <= C_row[A] + 1
               │
     Is C_row[A] >= N_PRAC_alert?
               │
     ┌─────────┴─────────┐
     │ NO                │ YES (Threshold Reached!)
     ▼                   ▼
 Normal Execution    1. Assert In-DRAM Alert Signal (ALERT_n Low / Bus Flag).
                     2. Host Memory Controller receives Alert.
                     3. Host issues Refresh Management (RFM) Command!
                     4. In-DRAM Logic refreshes Row A - 1 and Row A + 1!
                     5. Reset C_row[A] <= 0!
```

---

## JEDEC DDR5 Refresh Management (RFM) Protocol

When an in-DRAM PRAC counter reaches its alert threshold, how does the DRAM chip communicate with the host memory controller to trigger an emergency targeted refresh?

The JEDEC DDR5 specification defines a standardized command protocol: **Refresh Management (RFM)**.

```text
JEDEC DDR5 REFRESH MANAGEMENT (RFM) COMMAND FLOW

 Host Memory Controller                       DDR5 DRAM Chip (On-Die PRAC)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Sends ACT Commands to     ├─ ACT 0x0042 ──►│ In-DRAM PRAC Counter #0x42│
 │ Row 0x0042                │                │ reaches Threshold (500)!  │
 └───────────────────────────┘                └─────────────┬─────────────┘
               ▲                                            │
               │ 2. Asserts ALERT_n Pin Low                 │ 1. Triggers Alert
               └────────────────────────────────────────────┘
               │
               ▼
 3. Host Issues RFM Command
 ┌───────────────────────────┐
 │ Sends RFM Command to Bank ├─ RFM Command ─► Executes Targeted Refresh
 └───────────────────────────┘                to Row 0x0041 & Row 0x0043!
                                              Resets Counter #0x42 <= 0!
```

---

### The Four Steps of the JEDEC RFM Handshake:

#### Step 1: Alert Generation on DRAM Die
When Row $A$'s counter reaches $N_{\text{PRAC\_alert}} = 500$, the DRAM chip's internal logic asserts a physical signal to notify the host memory controller.

Depending on the DDR5 interface implementation:
* **Option A (Physical `ALERT_n` Pin)**: The DRAM chip drives its physical `ALERT_n` signal pin Low ($0.0\text{ V}$).
* **Option B (In-Band Status Register Flag)**: The DRAM chip sets a status bit in its internal Mode Register (`MR`), which the host memory controller reads during periodic status polling.

#### Step 2: Host Memory Controller Schedule Adjustment
The host CPU's memory controller detects the alert signal from the DRAM chip.
* The memory controller temporarily pauses new user `READ` and `WRITE` transactions to that memory bank.
* The memory controller schedules a high-priority **Refresh Management Command (`RFM`)**.

#### Step 3: Execution of the `RFM` Command
The memory controller transmits the 14-bit `RFM` command word across the DDR5 command/address bus to the specified DRAM bank.

#### Step 4: Targeted Neighbor Refresh and Counter Reset
1. Upon receiving the `RFM` command, the DRAM chip's internal address generator retrieves the aggressor row address $A = \text{0x0042}$.
2. The DRAM chip's internal wordline drivers issue an **Emergency Targeted Refresh** to adjacent physical rows:

$$\text{Targeted Refresh Issued to: } \quad WL_{A-1} \quad \text{and} \quad WL_{A+1}$$

3. The capacitors in Victim Rows $A-1$ and $A+1$ are recharged back to $100\%$ full supply voltage ($V_{\text{DD}} = 1.1\text{ V}$).
4. Row $A$'s counter is reset to zero ($C_{\text{row}}[A] \Leftarrow 0$).
5. The `ALERT_n` pin returns to High ($1$), and normal memory bus operation resumes!

---

### Adaptive Refresh Management (ARFM)

To adapt to changing operating temperatures and silicon aging, JEDEC DDR5 incorporates **Adaptive Refresh Management (ARFM)**:

When silicon junction temperature ($T_J$) increases above $85^\circ\text{C}$, capacitor charge leakage accelerates ($I_{\text{ret}}$ increases exponentially).

Under ARFM:
* The DRAM chip's thermal sensor automatically scales down the PRAC Alert Threshold ($N_{\text{PRAC\_alert}}$):

$$N_{\text{PRAC\_alert}}(T_J) = \begin{cases} 500 \text{ Activations} & \text{if } T_J \le 85^\circ\text{C} \\ 250 \text{ Activations} & \text{if } T_J > 85^\circ\text{C} \end{cases}$$

At higher temperatures, PRAC triggers `RFM` emergency refreshes twice as often, guaranteeing $100\%$ Rowhammer immunity across all environmental operating conditions!

---

## Performance and Bandwidth Analysis: PRAC versus Global Refresh Rate Scaling

To appreciate why PRAC + RFM is the gold standard for high-density memory protection, we must compare the memory bus overhead of **PRAC-Based Targeted Refreshing** against **Global Background Refresh Rate Scaling**.

### The Overhead of Global Refresh Rate Scaling

Suppose a memory architect attempts to defend a sub-10nm DRAM module (where the bit-flip threshold is $N_{\text{flip}} = 4,000$ activations) *without* PRAC, using only global background refresh rate scaling.

To prevent an attacker from executing $4,000$ activations before a refresh arrives, the global refresh window ($t_{\text{REFI}}$) must be reduced from $64\text{ ms}$ down to **$4.0\text{ milliseconds}$ ($16\times$ refresh frequency increase)**!

Let us calculate the memory bus bandwidth consumed by global refresh cycles:

Let $t_{\text{RFC}}$ be the time required to execute one global Auto-Refresh command across all banks ($t_{\text{RFC}} \approx 350\text{ ns}$ in DDR5).

The percentage of memory bus bandwidth consumed by global refreshes ($\text{Overhead}_{\text{global}}$) is:

$$\text{Overhead}_{\text{global}} = \frac{t_{\text{RFC}}}{t_{\text{REFI\_scaled}}} \times 100\%$$

For standard $64\text{-ms}$ refresh ($t_{\text{REFI\_interval}} = 7.8\ \mu\text{s}$ per rank):

$$\text{Overhead}_{\text{standard}} = \frac{350\text{ ns}}{7,800\text{ ns}} \times 100\% \approx \mathbf{4.48\% \text{ Bus Overhead}}$$

For $16\times$ scaled $4\text{-ms}$ refresh ($t_{\text{REFI\_interval}} = 0.4875\ \mu\text{s}$):

$$\text{Overhead}_{\text{scaled}} = \frac{350\text{ ns}}{487.5\text{ ns}} \times 100\% \approx \mathbf{71.79\% \text{ Bus Overhead!}}$$

#### The Physical Result:
Global refresh rate scaling burns **$71.79\%$ of total memory bus bandwidth** purely refreshing idle memory cells! 

The CPU sits permanently stalled waiting for DRAM refresh cycles, rendering the computer unusable.

---

### The Overhead of PRAC + RFM Targeted Refreshing

Now, let us calculate the memory bus bandwidth consumed by **PRAC + RFM Targeted Refreshing** under a heavy, worst-case Rowhammer attack.

An attacker hammers a single DRAM bank at the maximum physical row activation rate ($t_{\text{RC}} = 32\text{ ns} \implies 31,250,000\text{ activations/second}$).

PRAC is configured with an Alert Threshold $N_{\text{PRAC\_alert}} = 500\text{ activations}$.

Each `RFM` command takes $t_{\text{RFM}} = 40.0\text{ nanoseconds}$ to execute.

1. **Number of `RFM` Commands Triggered per Second ($N_{\text{RFM\_sec}}$)**:

$$N_{\text{RFM\_sec}} = \frac{\text{Activations / Second}}{N_{\text{PRAC\_alert}}} = \frac{31,250,000 \text{ ACT/s}}{500 \text{ ACT/RFM}} = \mathbf{62,500 \text{ RFM Commands / Second}}$$

2. **Total Time Spent Executing `RFM` Commands per Second ($T_{\text{RFM\_total}}$)**:

$$T_{\text{RFM\_total}} = 62,500 \text{ RFM/s} \times 40.0 \times 10^{-9} \text{ s/RFM} = \mathbf{0.00250 \text{ Seconds / Second}} \quad (2.50\text{ ms})$$

3. **Percentage Memory Bus Overhead under Heavy Attack ($\text{Overhead}_{\text{PRAC}}$)**:

$$\mathbf{\text{Overhead}_{\text{PRAC}} = \frac{0.00250\text{ s}}{1.0\text{ s}} \times 100\% = \mathbf{0.25\% \text{ Bus Overhead!}}}$$

```text
BUS OVERHEAD COMPARISON: GLOBAL REFRESH VS. PRAC + RFM

 Strategy Class              │ Bus Overhead (%) │ Usable Memory BW │ Rowhammer Defense
─────────────────────────────┼──────────────────┼──────────────────┼───────────────────
 Standard 64ms Refresh       │    4.48%         │ 95.52%           │ VULNERABLE (<10nm)
 16x Global Refresh (4ms)    │   71.79%         │ 28.21% (CRASH!)  │ Protected (High Power)
 PRAC + RFM Targeted Refresh │    0.25%         │ 99.75% (OPTIMAL!)│ 100% DETERMINISTIC!
```

#### The Architectural Victory:
* Global refresh rate scaling destroyed **$71.79\%$ of memory bandwidth**.
* PRAC + RFM targeted refreshing consumes **ONLY $0.25\%$ of memory bandwidth** under heavy attack, while delivering $100\%$ deterministic protection against all Rowhammer variants!

---

## Solved Industrial Engineering Exercise: Quantitative PRAC In-DRAM Counter Accounting, RFM Alert Triggering, and Memory Bus Throughput Analysis

To consolidate your complete mastery of Per-Row Activation Counting (PRAC), in-DRAM counter mechanics, JEDEC DDR5 `RFM` command execution, and memory bus overhead math, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal memory systems architect designing the DDR5 memory subsystem for a $3.2\text{ GHz}$ enterprise cloud server ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The server is populated with DDR5-6400 DRAM modules ($3,200\text{ MHz}$ clock frequency, $6,400\text{ MT/s}$ transfer rate, $t_{\text{CK}} = 0.3125\text{ ns}$).

```text
3.2 GHz SERVER WITH DDR5-6400 PRAC MEMORY SUBSYSTEM

 Host CPU Memory Controller ──► [ DDR5-6400 DRAM Die (In-DRAM PRAC) ] ──► DRAM Bank Array
 Clock T = 312.5 ps             6-Bit Counters (Alert = 500 ACTs)         65,536 Rows
                                RFM Delay t_RFM = 40.0 ns                 t_RC = 32.0 ns
```

#### DDR5 Memory Bank Parameters:
* Number of Rows per Bank: $N_{\text{rows}} = 65,536\text{ rows}$ ($2^{16}$).
* Minimum Row Cycle Time: $t_{\text{RC}} = 32.0\text{ nanoseconds}$ ($32.0 \times 10^{-9}\text{ s}$).
* Standard Refresh Window: $t_{\text{REFI}} = 64.0\text{ milliseconds}$ ($64.0 \times 10^{-3}\text{ s}$).
* Physical Rowhammer Bit-Flip Threshold for Sub-10nm DRAM: $N_{\text{flip}} = 3,000\text{ activations}$.
* **In-DRAM PRAC Configuration**:
  * Counter Bit-Width: $B_{\text{counter}} = 10\text{ bits}$ per row ($0 \dots 1,023$).
  * PRAC Alert Threshold: $N_{\text{PRAC\_alert}} = \mathbf{500 \text{ Activations}}$.
  * `RFM` Command Execution Delay: $t_{\text{RFM}} = 40.0\text{ nanoseconds}$ ($40.0 \times 10^{-9}\text{ s}$).

#### Workload Attack Profile:
An attacker process executes a Many-Sided Rowhammer attack targeting Row $A$ (`0x0042`) in Bank 0, issuing $600,000\text{ activations}$ per second to Row $A$.

#### Your Objective

1. Calculate the total SRAM memory footprint (in Kilobytes) required to store the in-DRAM PRAC counter array for all 16 banks of a $1\text{-Gigabyte}$ DRAM chip.
2. Trace the PRAC counter state $C_{\text{row}}[A]$ as the attacker activates Row $A$ 500 times:
   * Show the exact activation count that triggers the PRAC alert signal.
   * Calculate the physical time $T_{\text{alert}}$ (in microseconds) required for Row $A$ to reach $N_{\text{PRAC\_alert}} = 500$.
3. Show how the host memory controller responds by issuing an `RFM` command:
   * Calculate the number of times Row $A$'s adjacent victim rows ($A-1$ and $A+1$) are refreshed during a $64\text{-ms}$ window.
   * Prove mathematically that Row $A$'s activation count **NEVER reaches the physical bit-flip threshold ($N_{\text{flip}} = 3,000$)**, guaranteeing $100\%$ protection.
4. Calculate the total number of `RFM` commands issued per second and the resulting memory bus overhead percentage ($\text{Overhead}_{\text{RFM}}$).
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Total In-DRAM PRAC Counter SRAM Footprint

A 1-GB DRAM chip contains $16\text{ banks}$, each holding $N_{\text{rows}} = 65,536\text{ rows}$.

Each row has a dedicated $10\text{-bit}$ counter ($B_{\text{counter}} = 10\text{ bits}$).

##### 1. Counter SRAM Bits per Bank:

$$\text{Bits}_{\text{bank}} = 65,536 \text{ rows} \times 10 \text{ bits/row} = \mathbf{655,360 \text{ Bits per Bank}}$$

##### 2. Total Counter SRAM Size for All 16 Banks:

$$\text{Bits}_{\text{chip}} = 16 \text{ banks} \times 655,360 \text{ bits/bank} = 10,485,760 \text{ Bits}$$

Convert to Kilobytes (KB) and Megabytes (MB):

$$\text{Size}_{\text{KB}} = \frac{10,485,760 \text{ bits}}{8 \text{ bits/byte} \times 1,024 \text{ bytes/KB}} = \mathbf{1,280.0 \text{ Kilobytes}} = \mathbf{1.250 \text{ Megabytes}}$$

##### Hardware Footprint Result:
Storing PRAC counters for all $1,048,576\text{ rows}$ across the entire 1-GB DRAM chip requires **$1.250\text{ Megabytes}$ of in-DRAM SRAM storage** ($1.250\text{ MB} \ll 1,024\text{ MB}$, representing $0.122\%$ of chip capacity!).

---

#### Step 2: Trace PRAC Counter State and Calculate Alert Time ($T_{\text{alert}}$)

The attacker activates Row $A$ (`0x0042`) at a rate of $600,000\text{ activations per second}$.

$$t_{\text{act\_interval}} = \frac{1.0 \text{ s}}{600,000 \text{ ACT/s}} = 1.6667 \times 10^{-6} \text{ s/activation} = \mathbf{1,666.67 \text{ nanoseconds}}$$

##### 1. Counter Increments:
* Activation 1: $C_{\text{row}}[A] = 1$
* Activation 2: $C_{\text{row}}[A] = 2$
* ...
* Activation 500: $C_{\text{row}}[A] = \mathbf{500 \quad (N_{\text{PRAC\_alert}} \text{ REACHED!})}$

##### 2. Calculate Physical Time to Trigger Alert ($T_{\text{alert}}$):

$$T_{\text{alert}} = 500 \text{ activations} \times 1,666.67 \times 10^{-9} \text{ s/activation}$$

$$T_{\text{alert}} = 0.00083333 \text{ Seconds} = \mathbf{833.33 \text{ Microseconds}} \quad (0.8333\text{ ms})$$

Row $A$'s counter reaches 500 and asserts the `ALERT_n` signal every **$833.33\text{ microseconds}$**!

---

#### Step 3: Verify $100\%$ Rowhammer Protection Invariant

When `ALERT_n` fires at $500$ activations:
1. Host memory controller issues an `RFM` command ($t_{\text{RFM}} = 40.0\text{ ns}$).
2. In-DRAM logic recharges Victim Rows $A-1$ and $A+1$ back to $100\%$ full charge ($1.1\text{ V}$).
3. In-DRAM counter $C_{\text{row}}[A]$ is reset to $0$:

$$C_{\text{row}}[A] \Leftarrow 0$$

##### Calculate Maximum Activations Row $A$ Can Ever Reach:

$$\mathbf{\max(C_{\text{row}}[A]) = N_{\text{PRAC\_alert}} = 500 \text{ Activations}}$$

##### Compare against Physical Bit-Flip Threshold ($N_{\text{flip}} = 4,000\text{ activations}$):

$$\max(C_{\text{row}}[A]) \, (500) \quad \ll \quad N_{\text{flip}} \, (4,000) \quad (\mathbf{\text{SAFETY MARGIN = 3,500 ACTIVATIONS!}})$$

$$\text{Safety Factor} = \frac{N_{\text{flip}}}{N_{\text{PRAC\_alert}}} = \frac{4,000}{500} = \mathbf{8.00\times \text{ Safety Margin!}}$$

##### Security Result:
Because $500 \ll 4,000$, Victim Rows $A-1$ and $A+1$ are refreshed **8 times before they can ever reach the bit-flip threshold**! A Rowhammer bit-flip is **$100\%$ mathematically impossible**!

---

#### Step 4: Calculate `RFM` Memory Bus Overhead Percentage

At $600,000\text{ activations/second}$ targeting Row $A$:

##### 1. Number of `RFM` Commands Triggered per Second ($N_{\text{RFM\_sec}}$):

$$N_{\text{RFM\_sec}} = \frac{600,000 \text{ ACT/s}}{500 \text{ ACT/RFM}} = \mathbf{1,200 \text{ RFM Commands / Second}}$$

##### 2. Total Time Spent Executing `RFM` Commands per Second ($T_{\text{RFM\_total}}$):

$$T_{\text{RFM\_total}} = 1,200 \text{ RFM/s} \times 40.0 \times 10^{-9} \text{ s/RFM} = \mathbf{0.000048 \text{ Seconds / Second}} \quad (48.0\ \mu\text{s})$$

##### 3. Percentage Memory Bus Overhead ($\text{Overhead}_{\text{RFM}}$):

$$\mathbf{\text{Overhead}_{\text{RFM}} = \frac{0.000048\text{ s}}{1.0\text{ s}} \times 100\% = \mathbf{0.0048\% \text{ Bus Overhead!}}}$$

```text
DDR5 PRAC + RFM PERFORMANCE & PROTECTION SUMMARY

 Performance Parameter        │ Measured Value / Result
──────────────────────────────┼─────────────────────────────────────────────
 Total PRAC Counter SRAM Size │ 1.250 Megabytes (0.122% of DRAM die)
 Max Row Activations Allowed  │ 500 Activations (Safety Factor = 8.0x)
 RFM Commands / Sec (Attack)  │ 1,200 RFM Commands / Second
 Memory Bus Overhead %        │ 0.0048% (Near-Zero Bandwidth Loss!)
 Rowhammer Protection State   │ 100% DETERMINISTIC PROTECTION (0 Bit-Flips!)
```

##### Engineering Conclusion:
Per-Row Activation Counting (PRAC) combined with Refresh Management (`RFM`) delivered **$100\%$ deterministic protection against Rowhammer** with an ultra-low memory bus overhead of **$0.0048\%$ ($48.0\ \mu\text{s}$ per second)**, while consuming only $1.25\text{ MB}$ of in-DRAM SRAM storage!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and hardware state results against memory principles:

1. **In-DRAM Counter Capacity Check**:
   * Total rows $= 16 \times 65,536 = 1,048,576\text{ rows}$.
   * At 10 bits per counter, $1,048,576 \times 10 = 10,485,760\text{ bits} = 1,310,720\text{ bytes} = 1,280\text{ KB} = 1.25\text{ MB}$. Math verified with $100\%$ precision!
2. **Safety Threshold Invariant**:
   * $N_{\text{PRAC\_alert}} = 500 \ll N_{\text{flip}} = 4,000$.
   * $4,000 / 500 = 8.0\times$ safety factor.
   * Zero bit-flips mathematically guaranteed under all hammering patterns!
3. **RFM Bus Overhead Math Check**:
   * $1,200\text{ RFM/sec} \times 40.0\text{ ns/RFM} = 48,000\text{ ns/sec} = 0.000048\text{ s/s} = 0.0048\%$.
   * Overhead is over $1,000\times$ lower than global refresh rate scaling ($71.79\%$).

All in-DRAM PRAC counter array capacity calculations, 10-bit counter threshold alert timings, JEDEC `RFM` command overheads, and $8.0\times$ Rowhammer safety factors evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Per-Row Activation Counting (PRAC)**: A deterministic in-DRAM hardware security architecture that embeds dedicated activation counters directly onto the silicon die for every physical row in every memory bank, tracking $100\%$ of row activations without sampling errors or table overflows.
* **In-DRAM activation tracking**: The physical hardware mechanism where on-die DDR5 logic intercepts incoming `ACTIVATE` commands, increments the specified row's hardware counter, and asserts an alert signal (`ALERT_n` / `RFM`) when the counter reaches a safety threshold ($N_{\text{PRAC\_alert}}$) to trigger targeted neighbor refreshes.

---

TERMINADO