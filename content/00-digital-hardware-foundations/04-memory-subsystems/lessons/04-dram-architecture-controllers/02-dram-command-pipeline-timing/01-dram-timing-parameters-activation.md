content/00-digital-hardware-foundations/04-memory-subsystems/lessons/04-dram-architecture-controllers/02-dram-command-pipeline-timing/01-dram-timing-parameters-activation.md
# DRAM Timing Parameters Activation and Row Buffer Conflict Latency

## The Physical Charge-Sharing Delay and the Row-Change Latency Penalty

In high-performance digital computing architectures, processor execution cores operate at astronomical speeds, driven by master clocks running at frequencies of $3.0\text{ GHz}$ to $5.0\text{ GHz}$. At $3.2\text{ GHz}$, a single processor clock cycle elapses in a mere $312.5\text{ picoseconds}$ ($0.3125\text{ nanoseconds}$). Within this tiny fraction of a nanosecond, execution pipelines decode instructions, evaluate register operations, and dispatch memory requests.

However, when a processor execution pipeline issues a memory load or store request that misses the local on-chip Level 1, Level 2, and Level 3 Static RAM (SRAM) caches and must fetch data from main system Dynamic Random-Access Memory (DRAM), execution encounters a severe physical timing barrier: **The DRAM Timing Parameter Constraints**.

Main system DRAM memory is constructed from billions of microscopic One-Transistor One-Capacitor (1T1C) cells arranged in two-dimensional matrix arrays called **Banks**. 

Unlike digital logic gates or SRAM cache cells—which switch cleanly between $0\text{ V}$ and supply voltage ($V_{DD}$) in tens of picoseconds—a 1T1C DRAM cell stores a binary bit as an analog electrical charge ($Q = C_s \cdot V$) inside an ultra-tiny $25\text{-femtofarad}$ capacitor.

Opening a row of 1T1C cells inside a DRAM bank is an analog charge-redistribution process:
1. The memory controller asserts a horizontal Word Line ($WL$).
2. All 65,536 storage capacitors along that row open simultaneously, dumping their tiny electrical charges onto long, capacitive vertical metal wires called **Bit Lines**.
3. High-sensitivity analog **Sense Amplifiers** detect minuscule voltage shifts of $\pm 50\text{ millivolts}$, amplify those shifts to full supply rails ($1.20\text{ V}$ or $0.0\text{ V}$), and latch the entire 8-Kilobyte row into an on-chip SRAM buffer called **The Row Buffer**.
4. The full supply voltage on the bit lines flows back through the access transistors to **re-charge the microscopic capacitors** back to their full initial states (**Active Restore Phase**).

```text
THE ANALOG CHARGE-SHARING TIMING BARRIER

 Word Line WL Asserted ──► Charge Sharing on Bit Line ──► Sense Amp Fires
                          (Tiny +-50 mV Voltage Shift)   (Amplifies to 1.2V)
                          ◄────────────── t_RCD Delay ──────────────►
                          (CPU MUST STALL! CANNOT READ COLUMNS YET!)
```

Because charge sharing, sense amplification, and capacitor restoration are physical analog processes governed by $RC$ time constants, **they cannot be executed instantaneously**.

If a memory controller dispatches a `READ` command to select a column word immediately after issuing an `ACTIVATE` command without waiting for the sense amplifiers to stabilize, the column decoder reads un-amplified voltage noise, returning corrupted garbage to the CPU!

Similarly, if the memory controller attempts to close a row and precharge the bit lines before the capacitors have finished re-charging, the stored data inside the 1T1C cells is permanently destroyed!

To guarantee physical data integrity and prevent memory corruption, hardware memory controllers MUST enforce a set of strict, hardwired physical time delays between memory bus commands: **DRAM Timing Parameters** (such as $t_{\text{RCD}}, t_{\text{CL}}, t_{\text{RP}}, t_{\text{RAS}}, \text{and } t_{\text{RC}}$).

Furthermore, when consecutive memory requests issued by the CPU target different rows inside the same DRAM bank (**A Row Buffer Conflict**), the memory controller is forced to execute a three-step command sequence:
1. Close the old row (`PRECHARGE`, taking delay $t_{\text{RP}}$).
2. Open the new row (`ACTIVATE`, taking delay $t_{\text{RCD}}$).
3. Read the target column (`READ`, taking delay $t_{\text{CL}}$).

This three-step row conflict sequence takes **nearly four times longer** ($45\text{ to } 50\text{ nanoseconds}$) than reading data from an already open row buffer ($8\text{ to } 10\text{ nanoseconds}$)!

To design high-speed memory controllers and write cache-friendly software algorithms, computer engineers must master the physical origin of each DRAM timing parameter, the state transitions of the DRAM bank command state machine, and the performance impact of Row Buffer Hits versus Row Buffer Conflicts.

---

## The Heavy Library Vault and the Reading Table: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of DRAM timing parameters, row activation, and row buffer conflict penalties before analyzing nanosecond timing equations and signal waveforms, let us consider an everyday analogy: **The Archival Vault Library**.

Imagine an archival research library containing millions of rare, historical manuscripts (**Main DRAM System Memory**). A research clerk (**The Memory Controller**) receives book requests from a professor (**The CPU Core**).

```text
THE ARCHIVAL VAULT LIBRARY METAPHOR

 Research Clerk (Memory Controller)         Archival Storage Vault (DRAM Bank)
 ┌───────────────────────────┐              ┌───────────────────────────┐
 │ Request Queue             │              │ Heavy Vault Cabinets      │
 │ Receives Book Orders      │              │ (Holds 131,072 Rows)      │
 └───────────────────────────┘              └─────────────┬─────────────┘
                                                          │
 ┌────────────────────────────────────────────────────────┴─────────────┐
 │ Single Reading Table (The Row Buffer Latch Array: 8,192 Bytes)       │
 └──────────────────────────────────────────────────────────────────────┘
```

The library is organized into specialized cabinets (**DRAM Banks**). Each cabinet contains **131,072 manuscript boxes (Rows)**. 

Inside each cabinet sits a single **Reading Table (The Row Buffer)**. The reading table is small: it can hold **only one manuscript box (8 Kilobytes of data)** at a time.

The manuscripts are written in extremely faint, delicate pencil ink (1T1C capacitive charge) that cannot be read from across the room.

Let us observe the clerk's physical actions and required waiting times as they service the professor's requests:

---

### Step 1: Opening the Vault Cabinet ($t_{\text{RCD}}$ — Row-to-Column Delay)

The professor calls the clerk asking for a specific page from **Box #10** (Row 10):

1. The clerk walks over to Cabinet 0, inserts a key, and turns a heavy wheel to unlock the vault door (**`ACTIVATE` Command**).
2. The clerk pulls Box #10 out of the cabinet, places it on the reading table, opens the lid, and turns on a bright magnifying lamp (**Sense Amplifiers Fire**).
3. **The Physical Delay ($t_{\text{RCD}}$)**: Unlocking the heavy vault door, carrying Box #10, and setting up the magnifying lamp takes the clerk **14 seconds** ($t_{\text{RCD}} = 14\text{ ns}$). 

The clerk **cannot read any page numbers** until this 14-second setup process is complete!

---

### Step 2: Reading a Page from the Table ($t_{\text{CL}}$ — Column Access Strobe Latency)

Once Box #10 is sitting open under the magnifying lamp on the reading table:

1. The clerk flips to Page 42 (Column Address) inside Box #10 (**`READ` Command**).
2. **The Physical Delay ($t_{\text{CL}}$)**: Reading Page 42 off the open table takes the clerk only **2 seconds** ($t_{\text{CL}} = 2\text{ ns}$)!
3. The clerk shouts the answer to the professor over the intercom (**Data Driven to CPU**).

#### The Power of the Open Reading Table (Row Buffer Hit):
Suppose the professor immediately calls back asking for **Page 43** from Box #10:
* Does the clerk put Box #10 away and re-lock the door? **NO!** Box #10 is ALREADY sitting open on the reading table!
* The clerk skips Step 1 entirely! The clerk simply flips to Page 43 and reads it in **2 seconds** ($t_{\text{CL}}$)!

As long as the professor requests pages from Box #10, every single read completes in **2 seconds** (**Row Buffer Hit / Page Hit**)!

---

### Step 3: Closing the Vault Cabinet ($t_{\text{RP}}$ — Row Precharge Time)

Now, suppose the professor calls asking for a page from a *different* box: **Box #20** in the same cabinet!

The clerk faces a physical problem: The reading table can hold **only one box at a time**!

1. The clerk cannot open Box #20 while Box #10 is sitting on the table.
2. The clerk must carefully put Page 43 back, close Box #10, turn off the magnifying lamp, carry Box #10 back to its shelf, and lock the vault door (**`PRECHARGE` Command**).
3. **The Physical Delay ($t_{\text{RP}}$)**: Putting away Box #10 and locking the vault door takes **14 seconds** ($t_{\text{RP}} = 14\text{ ns}$).

---

### Step 4: The Minimum Open Rule ($t_{\text{RAS}}$ — Row Active Time)

The library board enforces a safety rule: *"To prevent manuscript pages from wrinkling, whenever a box is opened on the table, it MUST remain open for at least **36 seconds** ($t_{\text{RAS}}$) before you are allowed to lock it back up!"*

Even if the professor gets their answer in 2 seconds, the clerk **cannot issue a `PRECHARGE` command** until $36\text{ seconds}$ have elapsed since the box was opened!

```text
LIBRARIAN TIMING DELAY SUMMARY

 Action Performed          │ Physical Action in Library      │ Clock Delay Parameter
───────────────────────────┼─────────────────────────────────┼───────────────────────────
 Open Box onto Table       │ Unlock door & setup lamp        │ t_RCD (Row-to-Column)
 Read Page off Open Table  │ Flip to page & read text        │ t_CL  (CAS Latency)
 Lock Box Back in Cabinet  │ Put box away & lock door        │ t_RP  (Row Precharge)
 Minimum Table Open Time   │ Keep box open for paper safety  │ t_RAS (Row Active Time)
```

#### Comparing the Three Real-World Research Scenarios:

```text
1. Row Buffer Hit (Page Hit - FASTEST)
   Box #10 is ALREADY on the table!
   Read Page 43 ──► Takes 2 Seconds (t_CL)!

2. Row Buffer Miss (Closed Vault - MODERATE)
   Vault is locked; table is empty.
   Open Box #10 (14s) + Read Page 42 (2s) ──► Takes 16 Seconds (t_RCD + t_CL)!

3. Row Buffer Conflict (Page Conflict - SLOWEST!)
   Box #10 is open on the table, BUT professor wants Box #20!
   Lock Box #10 (14s) + Open Box #20 (14s) + Read Page (2s) ──► Takes 30 Seconds (t_RP + t_RCD + t_CL)!
```

This archival vault library is the exact physical analogue of **DRAM Timing Parameters and Row Buffer Conflicts**:
* The manuscript boxes are **DRAM Word Line Rows (8 KB each)**.
* The reading table is the **DRAM Row Buffer (Sense Amplifier Latch Array)**.
* The research clerk is the **Memory Controller Command Scheduler**.
* Opening the vault door is the **`ACTIVATE` Command ($t_{\text{RCD}}$)**.
* Reading a page off the open table is the **`READ` Command ($t_{\text{CL}}$)**.
* Locking the vault door is the **`PRECHARGE` Command ($t_{\text{RP}}$)**.
* The 36-second minimum open rule is **Row Active Time ($t_{\text{RAS}}$)**.
* Reading from the wrong box is a **Row Buffer Conflict ($t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}$)**.

---

## Primitive 1: Fundamental DRAM Timing Parameters ($t_{\text{RCD}}, t_{\text{CL}}, t_{\text{RP}}, t_{\text{RAS}}, t_{\text{RC}}$)

Now that we possess a clear intuitive mental model of the archival vault library, let us examine the formal, rigorous engineering mechanics of **DRAM Timing Parameters**.

DRAM timing parameters represent the physical, electrical delays required for transistor switches, sense amplifiers, and capacitive bit lines inside a DRAM chip to stabilize.

These timing specifications are defined by the JEDEC (Joint Electron Device Engineering Council) memory standards and are expressed in two equivalent units:
1. **Absolute Physical Time**: Measured in nanoseconds ($\text{ns}$).
2. **Memory Bus Clock Cycles**: Measured in memory clock cycles ($t_{\text{CK}}$), where $t_{\text{CK}} = \frac{1}{f_{\text{bus}}}$.

```text
THE FIVE CORE DRAM TIMING PARAMETERS

 Parameter Name │ Symbol │ Physical Meaning & Electrical Constraint
────────────────┼────────┼───────────────────────────────────────────────────────────
 Row-to-Column  │ t_RCD  │ Delay from ACTIVATE to READ/WRITE command.
 CAS Latency    │ t_CL   │ Delay from READ command to first data byte on DQ bus pins.
 Row Precharge  │ t_RP   │ Delay from PRECHARGE command to next ACTIVATE command.
 Row Active Time│ t_RAS  │ Minimum duration a row MUST stay open after ACTIVATE.
 Row Cycle Time │ t_RC   │ Minimum time for a complete ACTIVATE -> PRECHARGE sequence.
```

Let us dissect the physical origin, transistor actions, and mathematical constraints of each parameter in deep detail:

---

### 1. $t_{\text{RCD}}$ — RAS-to-CAS Delay (Row-to-Column Delay)

* **Definition**: The minimum required time delay between issuing an **`ACTIVATE` Command** (opening a row) and issuing a **`READ` or `WRITE` Command** (selecting a column) to the same DRAM bank.

$$T_{\text{wait\_after\_ACT}} \ge t_{\text{RCD}}$$

Where:
* $T_{\text{wait\_after\_ACT}}$ is the time duration elapsed after issuing an `ACTIVATE` command.
* $t_{\text{RCD}}$ is the JEDEC Row-to-Column Delay specification.

* **Transistor-Level Physical Cause**:
  When an `ACTIVATE` command is issued with Row Address $R_A$:
  1. The row decoder raises Word Line $WL_A$ from $0\text{ V}$ to $V_{DD} + V_T$.
  2. All 65,536 1T1C storage capacitors along Row $R_A$ dump their charges onto vertical Bit Lines ($BL$).
  3. Charge sharing occurs, creating a tiny voltage delta $\Delta V = \pm 50\text{ mV}$ on the bit lines.
  4. The 65,536 cross-coupled differential sense amplifiers trigger, amplifying the $50\text{-mV}$ delta to full supply rails ($1.20\text{ V}$ or $0.0\text{ V}$) and latching the values into the Row Buffer.

```text
PHYSICAL SIGNAL TIMING FOR t_RCD

 WL_A Asserted (ACTIVATE) ──► Charge Sharing ──► Sense Amplifiers Fire
                             (+-50 mV Delta)    (Amplifies to 1.2V / 0V)
                             ◄────────────── t_RCD (~14 ns) ─────────────►
                                                                        │
                                   Column READ Command Permitted HERE! ◄┘
```

The memory controller **MUST wait $t_{\text{RCD}}$** ($13 \text{ to } 15\text{ ns}$) for the sense amplifiers to fully amplify the bit line voltages before issuing a `READ` command! 

If a `READ` command is dispatched prematurely ($t < t_{\text{RCD}}$), the column multiplexer reads un-amplified voltage noise, returning corrupted data to the CPU.

---

### 2. $t_{\text{CL}}$ (or $t_{\text{CAS}}$) — Column Access Strobe Latency (CAS Latency)

* **Definition**: The exact time delay between the memory controller issuing a **`READ` Command** with Column Address $C_k$ and the first 64-bit data word appearing on the external memory bus data pins ($DQ_0 \dots DQ_{63}$).

$$T_{\text{data\_arrival}} = T_{\text{READ\_issued}} + t_{\text{CL}}$$

Where:
* $T_{\text{data\_arrival}}$ is the exact time instant when data appears on the bus pins.
* $T_{\text{READ\_issued}}$ is the time instant when the `READ` command was dispatched.
* $t_{\text{CL}}$ is the CAS Latency specification.

* **Transistor-Level Physical Cause**:
  When a `READ` command is issued to an open Row Buffer:
  1. The column address decoder receives Column Address $C_k$.
  2. The column decoder drives 64 column select lines, enabling a 1,024-to-1 multiplexer tree at the base of the Row Buffer.
  3. The selected 64 bits of data pass through output driver buffers, travel across the silicon package traces, and appear on the physical $DQ$ package pins.

```text
PHYSICAL SIGNAL TIMING FOR t_CL (CAS LATENCY)

 READ Command Issued on Bus ──► Column Decoder ──► MUX Tree ──► Output Pins DQ
                             ◄───────────── t_CL (~10 ns) ────────────►
                                                                      │
                                    First Data Word Appears HERE! ────┘
```

Because the data is read directly from the active SRAM sense amplifier latches in the Row Buffer, **$t_{\text{CL}}$ is very fast** ($10 \text{ to } 14\text{ ns}$). No capacitor charge sharing is required!

---

### 3. $t_{\text{RP}}$ — Row Precharge Time

* **Definition**: The minimum required time delay between issuing a **`PRECHARGE` Command** (closing an open row) and issuing a new **`ACTIVATE` Command** (opening a different row) in the same DRAM bank.

$$T_{\text{wait\_after\_PRE}} \ge t_{\text{RP}}$$

Where:
* $T_{\text{wait\_after\_PRE}}$ is the time duration elapsed after issuing a `PRECHARGE` command.
* $t_{\text{RP}}$ is the JEDEC Row Precharge Time specification.

* **Transistor-Level Physical Cause**:
  When a `PRECHARGE` command is issued to close Row $R_A$:
  1. Word Line $WL_A$ is driven to $0\text{ V}$, turning OFF the 65,536 access transistors ($M_1$) and trapping the restored charges inside the cell capacitors.
  2. The sense amplifiers are disconnected from the bit lines.
  3. The **Precharge Circuitry** activates, driving all vertical Bit Lines ($BL_0 \dots BL_{65535}$) back to the exact midpoint voltage: $V_{\text{pre}} = \frac{V_{DD}}{2} = 0.60\text{ V}$.

```text
PHYSICAL SIGNAL TIMING FOR t_RP (ROW PRECHARGE)

 PRECHARGE Issued ──► WL_A Turned OFF ──► Bit Lines Precharged to VDD / 2
                     ◄────────────── t_RP (~14 ns) ─────────────►
                                                                │
                            Next ACTIVATE Command Permitted HERE! ◄┘
```

The memory controller **MUST wait $t_{\text{RP}}$** ($13 \text{ to } 15\text{ ns}$) for all bit line wires to return to $V_{DD}/2$ before opening a new row! 

If a new `ACTIVATE` command is issued before precharging completes, the leftover voltage on the bit lines will corrupt the next row's charge-sharing operation.

---

### 4. $t_{\text{RAS}}$ — Row Active Time

* **Definition**: The minimum time duration that a DRAM row **MUST remain active and open ($WL = 1$)** following an `ACTIVATE` command before a `PRECHARGE` command is permitted to close the row.

$$T_{\text{PRE\_issued}} - T_{\text{ACT\_issued}} \ge t_{\text{RAS}}$$

Where:
* $T_{\text{PRE\_issued}}$ is the time instant when the `PRECHARGE` command is issued.
* $T_{\text{ACT\_issued}}$ is the time instant when the `ACTIVATE` command was issued.
* $t_{\text{RAS}}$ is the JEDEC Row Active Time specification.

* **Transistor-Level Physical Cause**:
  Recall that a DRAM read operation is **DESTRUCTIVE**. During the initial charge sharing phase ($t_{\text{RCD}}$), up to $45\%$ of the capacitor's stored charge is lost.
  
  After the sense amplifiers fire, the full $1.20\text{-V}$ rail voltage on the bit line flows back through access transistor $M_1$ to **re-charge storage capacitor $C_s$ back to $100\%$ full $V_{DD}$** (**Active Restore Phase**).

Re-charging 65,536 microscopic 3D capacitors through thin transistor channels takes time ($28 \text{ to } 36\text{ ns}$). 

If the memory controller issues a `PRECHARGE` command too early ($t < t_{\text{RAS}}$), Word Line $WL_A$ will turn OFF before the capacitors are fully re-charged, **permanently destroying the data stored in Row $R_A$**!

---

### 5. $t_{\text{RC}}$ — Row Cycle Time

* **Definition**: The total minimum time required to complete an entire cycle of opening a row, restoring its data, closing the row, and restoring bit line precharge on a single DRAM bank:

$$\mathbf{t_{\text{RC}} = t_{\text{RAS}} + t_{\text{RP}}}$$

Where:
* $t_{\text{RC}}$ is the minimum time between two consecutive `ACTIVATE` commands to different rows in the *same* DRAM bank.
* $t_{\text{RAS}}$ is the minimum row active time.
* $t_{\text{RP}}$ is the row precharge time.

If $t_{\text{RAS}} = 35.0\text{ ns}$ and $t_{\text{RP}} = 14.0\text{ ns}$:

$$t_{\text{RC}} = 35.0\text{ ns} + 14.0\text{ ns} = \mathbf{49.0 \text{ nanoseconds}}$$

---

### Summary Table of Standard DDR Memory Timing Values

The following table summarizes standard JEDEC timing parameters across DDR3, DDR4, and DDR5 memory modules (expressed in both nanoseconds and memory bus clock cycles $t_{\text{CK}}$):

```text
JEDEC DDR MEMORY TIMING SPECIFICATION MATRIX

 Timing Parameter │ DDR3-1600 (t_CK = 1.25ns) │ DDR4-3200 (t_CK = 0.625ns) │ DDR5-4800 (t_CK = 0.416ns)
──────────────────┼───────────────────────────┼────────────────────────────┼───────────────────────────
 t_CL (CAS)       │ 11 cycles (13.75 ns)      │ 22 cycles (13.75 ns)       │ 40 cycles (16.64 ns)
 t_RCD (Activate) │ 11 cycles (13.75 ns)      │ 22 cycles (13.75 ns)       │ 40 cycles (16.64 ns)
 t_RP (Precharge) │ 11 cycles (13.75 ns)      │ 22 cycles (13.75 ns)       │ 40 cycles (16.64 ns)
 t_RAS (Active)   │ 28 cycles (35.00 ns)      │ 56 cycles (35.00 ns)       │ 76 cycles (31.62 ns)
 t_RC (Row Cycle) │ 39 cycles (48.75 ns)      │ 78 cycles (48.75 ns)       │ 116 cycles (48.26 ns)
```

#### Key Observation on Memory Progress:
Look at the timing values in nanoseconds across DDR3, DDR4, and DDR5:
* While memory clock frequencies accelerated from $1,600\text{ MHz}$ to $4,800\text{ MHz}$ ($3\times$ speedup), physical access latencies ($t_{\text{CL}}, t_{\text{RCD}}, t_{\text{RP}}$) remained virtually constant at **$13.5 \text{ to } 16.5\text{ nanoseconds}$**!

This physical constancy occurs because silicon $RC$ charge-sharing time constants are dictated by transistor physics, not marketing clock labels!

---

## Primitive 2: Row Buffer Hit vs. Conflict Latency Mechanics

Now that we understand the individual timing parameters, let us analyze how the memory controller combines these parameters to execute memory access operations under three distinct real-world operational scenarios:
1. **Row Buffer Hit (Open Page Hit)**
2. **Row Buffer Miss (Closed Page / Precharged Bank)**
3. **Row Buffer Conflict (Page Conflict / Wrong Row Open)**

```text
THE THREE ROW BUFFER ACCESS PATHWAYS

                 Memory Request Arrives at DRAM Controller
                                   │
                     Is Target Bank Currently Open?
                                   │
               ┌───────────────────┼───────────────────┐
               │ YES               │ NO (Precharged)   │ YES (Wrong Row Open)
               ▼                   ▼                   ▼
       ROW BUFFER HIT      ROW BUFFER MISS      ROW BUFFER CONFLICT
       (Open Page)         (Closed Page)        (Page Conflict)
       Command: READ       Command: ACT -> READ Command: PRE -> ACT -> READ
       Latency: t_CL       Latency: t_RCD+t_CL  Latency: t_RP+t_RCD+t_CL
```

---

### Scenario 1: Row Buffer Hit Mechanics (Page Hit — $t_{\text{CL}}$)

A **Row Buffer Hit** occurs when the CPU requests a byte address $X$ in Bank $K$, and Bank $K$'s Row Buffer **already holds the open Row $R_X$ containing address $X$**.

#### Command Sequence:
The memory controller does not need to open or close any rows. It issues a single command:

$$\text{Command Sequence: } \mathbf{\text{READ } C_X}$$

Where $C_X$ is the Column Address within the open Row Buffer.

#### Total Latency Equation:

$$T_{\text{hit}} = t_{\text{CL}}$$

Where:
* $T_{\text{hit}}$ is the total latency of a Row Buffer Hit.
* $t_{\text{CL}}$ is the Column Access Strobe Latency.

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$ for a $3.2\text{-GHz}$ CPU):

$$T_{\text{hit\_cycles}} = \frac{t_{\text{CL}}}{T_{\text{clk}}} = \frac{13.75\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{44 \text{ CPU Clock Cycles}}$$

---

### Scenario 2: Row Buffer Miss Mechanics (Closed Page — $t_{\text{RCD}} + t_{\text{CL}}$)

A **Row Buffer Miss** occurs when the CPU requests a byte address $Y$ in Bank $K$, and Bank $K$ is currently in the **Precharged (Closed) State** (no row is currently open).

#### Command Sequence:
The memory controller must open Row $R_Y$ first, and then read Column $C_Y$:

$$\text{Command Sequence: } \mathbf{\text{ACTIVATE } R_Y} \quad \xrightarrow{\quad t_{\text{RCD}} \quad} \quad \mathbf{\text{READ } C_Y}$$

#### Total Latency Equation:

$$T_{\text{miss}} = t_{\text{RCD}} + t_{\text{CL}}$$

Where:
* $T_{\text{miss}}$ is the total latency of a Row Buffer Miss on a closed bank.
* $t_{\text{RCD}}$ is the Row-to-Column Delay.
* $t_{\text{CL}}$ is the Column Access Strobe Latency.

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{miss\_cycles}} = \frac{t_{\text{RCD}} + t_{\text{CL}}}{T_{\text{clk}}} = \frac{13.75\text{ ns} + 13.75\text{ ns}}{0.3125\text{ ns/cycle}} = \frac{27.50\text{ ns}}{0.3125} = \mathbf{88 \text{ CPU Clock Cycles}}$$

---

### Scenario 3: Row Buffer Conflict Mechanics (Page Conflict — $t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}$)

A **Row Buffer Conflict** occurs when the CPU requests a byte address $Z$ in Row $R_Z$ of Bank $K$, BUT Bank $K$'s Row Buffer **currently holds an open, different Row $R_W$ ($R_W \neq R_Z$)**.

The memory controller cannot open Row $R_Z$ while Row $R_W$ is sitting on the bit lines.

#### Command Sequence:
The memory controller must execute a three-step sequence:
1. Close Row $R_W$ using `PRECHARGE`. Wait $t_{\text{RP}}$.
2. Open Row $R_Z$ using `ACTIVATE`. Wait $t_{\text{RCD}}$.
3. Read Column $C_Z$ using `READ`. Wait $t_{\text{CL}}$.

$$\text{Command Sequence: } \mathbf{\text{PRECHARGE}} \, \xrightarrow{\, t_{\text{RP}} \,} \, \mathbf{\text{ACTIVATE } R_Z} \, \xrightarrow{\, t_{\text{RCD}} \,} \, \mathbf{\text{READ } C_Z}$$

#### Total Latency Equation:

$$T_{\text{conflict}} = t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}$$

Where:
* $T_{\text{conflict}}$ is the total latency of a Row Buffer Conflict.
* $t_{\text{RP}}$ is the Row Precharge Time.
* $t_{\text{RCD}}$ is the Row-to-Column Delay.
* $t_{\text{CL}}$ is the Column Access Strobe Latency.

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{conflict\_cycles}} = \frac{t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}}}{T_{\text{clk}}} = \frac{13.75\text{ ns} + 13.75\text{ ns} + 13.75\text{ ns}}{0.3125\text{ ns/cycle}} = \frac{41.25\text{ ns}}{0.3125} = \mathbf{132 \text{ CPU Clock Cycles}}$$

```text
LATENCY PENALTY COMPARISON MATRIX

 Access Scenario     │ Command Sequence        │ Time (ns) │ CPU Clock Cycles (3.2 GHz)
─────────────────────┼─────────────────────────┼───────────┼───────────────────────────
 Row Buffer Hit      │ READ                    │  13.75 ns │  44 Cycles
 Row Buffer Miss     │ ACTIVATE -> READ        │  27.50 ns │  88 Cycles (2x Slower!)
 Row Buffer Conflict │ PRECHARGE -> ACT -> READ│  41.25 ns │ 132 Cycles (3x Slower!)
```

Look at the severe penalty of a Row Buffer Conflict:
A Row Buffer Conflict ($132\text{ cycles}$) takes **three times longer** than a Row Buffer Hit ($44\text{ cycles}$)!

---

## Inter-Bank Power and Current Constraints ($t_{\text{RRD}}$ and $t_{\text{FAW}}$)

Beyond per-bank row timing, physical memory systems enforce multi-bank power supply constraints to prevent high current spikes on the DRAM chip die.

When an `ACTIVATE` command is issued, 65,536 sense amplifiers fire simultaneously, drawing a massive pulse of electrical current ($I_{\text{DD7}}$) from the motherboard power supply.

If a memory controller issued `ACTIVATE` commands to eight different DRAM banks on eight consecutive clock cycles, the combined current draw would cause the on-chip supply voltage to collapse, resetting the memory chip!

To restrict peak power supply current, JEDEC standards enforce two **Inter-Bank Activation Constraints**:

```text
INTER-BANK POWER TIMING CONSTRAINTS

 1. Row-to-Row Delay (t_RRD):
    Minimum time delay required between issuing ACTIVATE commands to DIFFERENT banks.
    Command Bus: [ ACT Bank 0 ] ──(t_RRD Delay)──► [ ACT Bank 1 ]

 2. Four-Activate Window (t_FAW):
    Maximum rolling time window during which NO MORE THAN 4 ACTIVATE commands
    can be issued across ALL banks on the same DRAM chip.
    Time Window t_FAW: [ ACT 1 ][ ACT 2 ][ ACT 3 ][ ACT 4 ] ──► (Blocked until t_FAW expires!)
```

#### 1. $t_{\text{RRD}}$ — Row-to-Row Activation Delay
* **Definition**: The minimum time delay required between issuing `ACTIVATE` commands to two **different banks** inside the same DRAM chip.
* **Value**: $t_{\text{RRD}} \approx 4 \text{ to } 6\text{ ns}$ ($4 \text{ to } 8\text{ bus cycles}$).

#### 2. $t_{\text{FAW}}$ — Four-Activate Window
* **Definition**: A rolling time window during which **no more than four `ACTIVATE` commands** may be issued across all banks on a single DRAM chip.
* **Value**: $t_{\text{FAW}} \approx 20 \text{ to } 30\text{ ns}$ ($32 \text{ to } 48\text{ bus cycles}$).
* **Hardware Enforcement**: If the memory controller dispatches 4 `ACTIVATE` commands in rapid succession, it **MUST STALL** and refrain from issuing a 5th `ACTIVATE` command until the $t_{\text{FAW}}$ sliding window expires!

---

## Engineering Reality: Memory Controller Timing State Counters

How does a physical memory controller hardware module ensure that it never violates $t_{\text{RCD}}, t_{\text{CL}}, t_{\text{RP}}, t_{\text{RAS}}, \text{or } t_{\text{FAW}}$?

Inside the memory controller chip, the command scheduler maintains a set of **Hardware Down-Counters** for every bank in the memory subsystem:

```text
MEMORY CONTROLLER BANK TIMING DOWN-COUNTERS

 Bank 0 Controller State Tracker:
 ┌──────────────────┬──────────────┬────────────────────────────────────┐
 │ Counter Name     │ Value (N)    │ Hardware Command Blocking Rule     │
 ├──────────────────┼──────────────┼────────────────────────────────────┤
 │ t_RCD_counter    │  12 Cycles   │ Blocks READ / WRITE to Bank 0      │
 │ t_RAS_counter    │  42 Cycles   │ Blocks PRECHARGE to Bank 0         │
 │ t_RP_counter     │   0 Cycles   │ Bank 0 Precharge Clear! (Ready)    │
 └──────────────────┴──────────────┴────────────────────────────────────┘
  (Counters decrement by 1 on every bus clock cycle!)
```

1. When the controller dispatches an `ACTIVATE` command to Bank 0:
   * It sets $\text{t\_RCD\_counter}_0 \Leftarrow t_{\text{RCD\_cycles}}$ (e.g., $22\text{ cycles}$).
   * It sets $\text{t\_RAS\_counter}_0 \Leftarrow t_{\text{RAS\_cycles}}$ (e.g., $56\text{ cycles}$).
2. On every bus clock cycle, all active counters decrement by $1$.
3. When the controller wants to dispatch a `READ` command to Bank 0:
   * It checks $\text{t\_RCD\_counter}_0$.
   * **If Counter $> 0$**: The command is **BLOCKED**! The controller holds the command in its queue.
   * **If Counter $== 0$**: The command is **APPROVED** and driven onto the memory bus!

By maintaining digital down-counters for every timing parameter across every bank, the memory controller guarantees 100% physical timing closure in hardware.

---

## Solved Industrial Engineering Exercise: Quantitative DRAM Timing Closure, Command Scheduling, and Conflict Penalty Analysis

To consolidate your complete mastery of DRAM timing parameters ($t_{\text{RCD}}, t_{\text{CL}}, t_{\text{RP}}, t_{\text{RAS}}, t_{\text{RC}}$), Row Buffer hit vs conflict latencies, and memory controller command scheduling, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal memory systems architect designing the DDR4 memory controller for a $3.2\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor connects to a DDR4-3200 memory module operating at a bus clock frequency $f_{\text{bus}} = 1,600\text{ MHz}$ ($T_{\text{bus}} = 0.625\text{ ns} = 625\text{ ps}$).

```text
3.2 GHz SERVER PROCESSOR WITH DDR4-3200 MEMORY INTERFACE

 CPU Core (3.2 GHz) ──► [ Memory Controller ] ──► [ DDR4-3200 DRAM Module ]
 Clock T = 312.5 ps     Bus T = 625 ps            Timing: 22-22-22-56
```

#### DDR4-3200 Physical Timing Parameters (in Memory Bus Cycles $t_{\text{CK}} = 0.625\text{ ns}$):
* $t_{\text{CL}}$ (CAS Latency) = $22\text{ }t_{\text{CK}} = 13.75\text{ ns}$ ($44\text{ CPU clock cycles}$).
* $t_{\text{RCD}}$ (Row-to-Column Delay) = $22\text{ }t_{\text{CK}} = 13.75\text{ ns}$ ($44\text{ CPU clock cycles}$).
* $t_{\text{RP}}$ (Row Precharge Time) = $22\text{ }t_{\text{CK}} = 13.75\text{ ns}$ ($44\text{ CPU clock cycles}$).
* $t_{\text{RAS}}$ (Row Active Time) = $56\text{ }t_{\text{CK}} = 35.00\text{ ns}$ ($112\text{ CPU clock cycles}$).
* $t_{\text{RC}}$ (Row Cycle Time) = $t_{\text{RAS}} + t_{\text{RP}} = 78\text{ }t_{\text{CK}} = 48.75\text{ ns}$ ($156\text{ CPU clock cycles}$).
* $t_{\text{RRD}}$ (Row-to-Row Delay) = $6\text{ }t_{\text{CK}} = 3.75\text{ ns}$ ($12\text{ CPU clock cycles}$).

#### Memory Workload Request Sequence:
At physical time $t = 0.0\text{ ns}$ (CPU Cycle 0 / Bus Cycle 0), the memory controller queue receives four consecutive memory load instructions targeting **Bank 0** in rapid succession:

* **Req 1 ($t = 0.0\text{ ns}$)**: `LOAD [Bank 0, Row 10, Col 0]` (Bank 0 is initially **Precharged / Closed**).
* **Req 2 ($t = 0.3125\text{ ns}$)**: `LOAD [Bank 0, Row 10, Col 64]` (Same Row 10!).
* **Req 3 ($t = 0.6250\text{ ns}$)**: `LOAD [Bank 0, Row 20, Col 0]` (**Row Buffer Conflict!** Row 20 $\neq$ Row 10).
* **Req 4 ($t = 0.9375\text{ ns}$)**: `LOAD [Bank 0, Row 20, Col 128]` (Same Row 20!).

#### Your Objective

1. Determine the exact bus dispatch cycle ($t_{\text{bus}}$ in $t_{\text{CK}}$) and CPU arrival time (in nanoseconds and CPU clock cycles) for each of the 4 requests under an **Open-Page Policy**.
2. Verify whether the minimum Row Active Time ($t_{\text{RAS}} = 56\text{ }t_{\text{CK}}$) constraint is satisfied for Row 10 before `PRECHARGE` is issued to open Row 20. If $t_{\text{RAS}}$ is violated, calculate the required $t_{\text{RAS}}$ stall cycles!
3. Calculate total execution time (in nanoseconds) to complete all 4 requests.
4. Evaluate a **Closed-Page Policy Alternative**: Calculate total execution time if the memory controller forcibly closed the row after every single read operation.
5. Calculate the overall **Performance Speedup Factor** of the Open-Page policy over the Closed-Page policy for this request stream.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Trace Request Execution under Open-Page Policy

Let us calculate the bus dispatch and data arrival timing for each request in bus clock cycles ($t_{\text{CK}} = 0.625\text{ ns}$):

##### Request 1: `LOAD [Bank 0, Row 10, Col 0]` (Closed Bank $\implies$ Page Miss)
* Bank 0 is initially closed.
* Bus Cycle 0 ($t = 0\text{ ns}$): Dispatches **`ACTIVATE Bank 0, Row 10`**.
  * Row 10 opens. Must wait $t_{\text{RCD}} = 22\text{ }t_{\text{CK}}$.
* Bus Cycle 22 ($t = 13.75\text{ ns}$): Dispatches **`READ Bank 0, Col 0`**.
  * Data arrives after $t_{\text{CL}} = 22\text{ }t_{\text{CK}}$ at Bus Cycle $22 + 22 = \mathbf{44\text{ }t_{\text{CK}}}$ ($27.50\text{ ns}$).
  * CPU Arrival Time = $27.50\text{ ns} / 0.3125\text{ ns/cycle} = \mathbf{88 \text{ CPU Clock Cycles}}$.

##### Request 2: `LOAD [Bank 0, Row 10, Col 64]` (Row 10 is OPEN $\implies$ Row Buffer Hit!)
* Row 10 is ALREADY open in Bank 0's Row Buffer!
* Bus Cycle 23 ($t = 14.375\text{ ns}$): Dispatches **`READ Bank 0, Col 64`**.
  * Data arrives after $t_{\text{CL}} = 22\text{ }t_{\text{CK}}$ at Bus Cycle $23 + 22 = \mathbf{45\text{ }t_{\text{CK}}}$ ($28.125\text{ ns}$).
  * CPU Arrival Time = $28.125\text{ ns} / 0.3125\text{ ns/cycle} = \mathbf{90 \text{ CPU Clock Cycles}}$.

---

##### Request 3: `LOAD [Bank 0, Row 20, Col 0]` (Row Buffer Conflict! Row 20 $\neq$ Row 10)
* Bank 0 currently holds open Row 10. Must precharge Row 10, then activate Row 20!

**CRITICAL $t_{\text{RAS}}$ TIMING CONSTRAINT CHECK**:
* Row 10 was activated at **Bus Cycle 0**.
* JEDEC rule: $t_{\text{RAS}} = 56\text{ }t_{\text{CK}}$.
* Earliest permitted `PRECHARGE` dispatch cycle for Row 10 = $0 + 56 = \mathbf{\text{Bus Cycle 56}}$ ($35.00\text{ ns}$)!
* Can the controller issue `PRECHARGE` at Bus Cycle 24? **NO!** That would violate $t_{\text{RAS}}$ ($24 < 56$) and destroy Row 10's stored charge!
* The controller **MUST STALL** until Bus Cycle 56 before issuing `PRECHARGE`!

##### Continuing Request 3 Execution:
* Bus Cycle 56 ($t = 35.00\text{ ns}$): Dispatches **`PRECHARGE Bank 0`**.
  * Precharge takes $t_{\text{RP}} = 22\text{ }t_{\text{CK}}$.
* Bus Cycle $56 + 22 = \mathbf{78\text{ }t_{\text{CK}}}$ ($48.75\text{ ns}$): Dispatches **`ACTIVATE Bank 0, Row 20`**.
  * Activation takes $t_{\text{RCD}} = 22\text{ }t_{\text{CK}}$.
* Bus Cycle $78 + 22 = \mathbf{100\text{ }t_{\text{CK}}}$ ($62.50\text{ ns}$): Dispatches **`READ Bank 0, Col 0`**.
  * Data arrives after $t_{\text{CL}} = 22\text{ }t_{\text{CK}}$ at Bus Cycle $100 + 22 = \mathbf{122\text{ }t_{\text{CK}}}$ ($76.25\text{ ns}$).
  * CPU Arrival Time = $76.25\text{ ns} / 0.3125\text{ ns/cycle} = \mathbf{244 \text{ CPU Clock Cycles}}$.

---

##### Request 4: `LOAD [Bank 0, Row 20, Col 128]` (Row 20 is OPEN $\implies$ Row Buffer Hit!)
* Row 20 is ALREADY open in Bank 0's Row Buffer!
* Bus Cycle 101 ($t = 63.125\text{ ns}$): Dispatches **`READ Bank 0, Col 128`**.
  * Data arrives after $t_{\text{CL}} = 22\text{ }t_{\text{CK}}$ at Bus Cycle $101 + 22 = \mathbf{123\text{ }t_{\text{CK}}}$ ($76.875\text{ ns}$).
  * CPU Arrival Time = $76.875\text{ ns} / 0.3125\text{ ns/cycle} = \mathbf{246 \text{ CPU Clock Cycles}}$.

```text
OPEN-PAGE POLICY COMMAND TIMING CHRONOLOGY

 Bus Cycle │ Command Dispatched │ Bank 0 State      │ Target Data Returned
───────────┼────────────────────┼───────────────────┼───────────────────────────
  Cycle 0  │ ACTIVATE Row 10    │ Opening Row 10    │ -
  Cycle 22 │ READ Col 0         │ Row 10 Open       │ -
  Cycle 23 │ READ Col 64        │ Row 10 Open (Hit) │ Req 1 Data Arrives! (Cycle 44)
  Cycle 45 │ -                  │ Row 10 Open       │ Req 2 Data Arrives! (Cycle 45)
  Cycle 56 │ PRECHARGE Bank 0   │ Closing Row 10    │ (t_RAS satisfied!)
  Cycle 78 │ ACTIVATE Row 20    │ Opening Row 20    │ -
  Cycle 100│ READ Col 0         │ Row 20 Open       │ -
  Cycle 101│ READ Col 128       │ Row 20 Open (Hit) │ Req 3 Data Arrives! (Cycle 122)
  Cycle 123│ Completion!        │ Row 20 Open       │ Req 4 Data Arrives! (Cycle 123)
```

##### Total Execution Time (Open-Page Policy):
$$\text{Total Bus Cycles} = 123\text{ }t_{\text{CK}}$$

$$T_{\text{open\_page}} = 123 \times 0.625\text{ ns} = \mathbf{76.875 \text{ nanoseconds}} \quad (246\text{ CPU Clock Cycles})$$

---

#### Step 2: Analyze Closed-Page Policy Alternative

Under a **Closed-Page Policy**, the memory controller automatically issues a `PRECHARGE` after every single read operation, closing the row immediately.

* Req 1 (Row 10, Col 0): `ACT(10)` $\to$ `READ(0)` $\to$ `PRE`.
  * Bus Cycles: $0\text{ (ACT)} \to 22\text{ (READ)} \to 56\text{ (PRE, satisfies } t_{\text{RAS}})$.
  * Closes at $56 + 22 = \mathbf{78\text{ }t_{\text{CK}}}$. Data arrives at $22 + 22 = 44\text{ }t_{\text{CK}}$.
* Req 2 (Row 10, Col 64): Closed! Must re-open Row 10!
  * Bus Cycles: $78\text{ (ACT)} \to 100\text{ (READ)} \to 134\text{ (PRE)}$.
  * Closes at $134 + 22 = \mathbf{156\text{ }t_{\text{CK}}}$. Data arrives at $100 + 22 = 122\text{ }t_{\text{CK}}$.
* Req 3 (Row 20, Col 0): Closed! Must open Row 20!
  * Bus Cycles: $156\text{ (ACT)} \to 178\text{ (READ)} \to 212\text{ (PRE)}$.
  * Closes at $212 + 22 = \mathbf{234\text{ }t_{\text{CK}}}$. Data arrives at $178 + 22 = 200\text{ }t_{\text{CK}}$.
* Req 4 (Row 20, Col 128): Closed! Must re-open Row 20!
  * Bus Cycles: $234\text{ (ACT)} \to 256\text{ (READ)} \to 290\text{ (PRE)}$.
  * Data arrives at $256 + 22 = \mathbf{278\text{ }t_{\text{CK}}}$.

##### Total Execution Time (Closed-Page Policy):
$$\text{Total Bus Cycles} = 278\text{ }t_{\text{CK}}$$

$$T_{\text{closed\_page}} = 278 \times 0.625\text{ ns} = \mathbf{173.750 \text{ nanoseconds}} \quad (556\text{ CPU Clock Cycles})$$

---

#### Step 3: Calculate Performance Speedup Factor

$$\text{Speedup} = \frac{T_{\text{closed\_page}}}{T_{\text{open\_page}}} = \frac{173.750\text{ ns}}{76.875\text{ ns}} = \frac{278\text{ bus cycles}}{123\text{ bus cycles}} \approx \mathbf{2.260\times \text{ Performance Advantage!}}$$

```text
DRAM PAGE POLICY PERFORMANCE COMPARISON

 Policy Name        │ Total Bus Cycles │ Total Time (ns) │ CPU Stall Cycles │ Speedup Factor
────────────────────┼──────────────────┼─────────────────┼──────────────────┼────────────────
 Closed-Page Policy │ 278 Cycles       │ 173.75 ns       │ 556 Cycles       │ 1.00x (Base)
 Open-Page Policy   │ 123 Cycles       │  76.88 ns       │ 246 Cycles       │ 2.26x FASTER!
                    │ (55.8% Saved!)   │ (96.87 ns Saved)│ (310 Cycles Saved)│ (+126% Gain)
```

##### Engineering Conclusion:
By keeping rows open in the Row Buffer (Open-Page Policy), the memory controller captured two Row Buffer Hits (Req 2 and Req 4), reducing total execution time from $173.75\text{ ns}$ down to $76.88\text{ ns}$—a **$2.26\times$ performance speedup ($126\%$ throughput gain)**!

---

### Sanity Check and Verification

Let us verify our mathematical and timing results against JEDEC specifications:

1. **$t_{\text{RAS}}$ Invariant Check**:
   * Row 10 activated at Cycle 0. `PRECHARGE` issued at Cycle 56.
   * $56 - 0 = 56\text{ }t_{\text{CK}} = t_{\text{RAS}}$. $t_{\text{RAS}}$ constraint satisfied with $100\%$ precision.
2. **$t_{\text{RC}}$ Invariant Check**:
   * Row 10 activated at Cycle 0. Row 20 activated at Cycle 78.
   * $78 - 0 = 78\text{ }t_{\text{CK}} = t_{\text{RC}} = t_{\text{RAS}} + t_{\text{RP}} = 56 + 22 = 78\text{ }t_{\text{CK}}$.
   * Row Cycle Time satisfied with 100% mathematical accuracy.
3. **Row Hit Latency Verification**:
   * Req 2 (Hit on Row 10) delivered data in $t_{\text{CL}} = 22\text{ bus cycles}$ ($13.75\text{ ns}$ / $44\text{ CPU cycles}$), matching $1\text{-command}$ hit latency.

All command dispatch cycles, $t_{\text{RAS}} / t_{\text{RC}}$ constraint validations, Row Buffer hit/conflict latencies, and Open-Page speedup metrics evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **DRAM Timing Parameters ($t_{\text{RCD}}, t_{\text{CL}}, t_{\text{RP}}, t_{\text{RAS}}, t_{\text{RC}}$)**: The hardwired physical clock-cycle delay specifications ($t_{\text{RCD}}$ Row-to-Column activate delay, $t_{\text{CL}}$ CAS read latency, $t_{\text{RP}}$ Row precharge close delay, $t_{\text{RAS}}$ active restore window, $t_{\text{RC}}$ row cycle time) that a memory controller must enforce between bus commands to guarantee 1T1C cell data integrity.
* **Row Buffer Hit vs. Conflict Latency**: The performance disparity between accessing an already open row buffer ($T_{\text{hit}} = t_{\text{CL}} \approx 10\text{ ns}$) versus closing an open row, precharging bit lines, and activating a new row ($T_{\text{conflict}} = t_{\text{RP}} + t_{\text{RCD}} + t_{\text{CL}} \approx 40\text{ ns}$), driving memory controller scheduling policies.
