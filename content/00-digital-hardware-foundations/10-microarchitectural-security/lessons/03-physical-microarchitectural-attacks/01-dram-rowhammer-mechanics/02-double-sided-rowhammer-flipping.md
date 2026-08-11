content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/03-physical-microarchitectural-attacks/01-dram-rowhammer-mechanics/02-double-sided-rowhammer-flipping.md
# Double-Sided Rowhammer Mechanics and Target Row Bit-Flip Acceleration

In modern high-density Dynamic Random-Access Memory (DRAM) architectures, microscopic memory storage cells are manufactured at sub-20-nanometer dimensions, placing parallel copper control wires known as wordlines just a few dozen silicon atoms apart. When an unprivileged software process repeatedly activates and precharges a single memory row (the Aggressor Row), high-voltage electrical pulses ($V_{\text{PP}} \approx 2.5\text{ V} - 3.0\text{ V}$) applied to its wordline induce parasitic capacitive cross-coupling and sub-threshold leakage current in adjacent un-accessed memory rows (the Victim Rows). However, in single-sided hammering—where an attacker activates only one adjacent row—the rate of capacitive charge leakage is constrained because the victim row receives electromagnetic disturbance pulses from only one side. On many modern DRAM modules equipped with hardware refresh counters or tighter row cycle timing constraints, single-sided hammering fails to drain enough electrical charge from the victim capacitors before the memory controller's periodic 64-millisecond refresh cycle recharges the cells. To overcome this physical limitation and accelerate bit-flip rates, security researchers developed **Double-Sided Rowhammer**. In a Double-Sided Rowhammer attack, the attacker identifies the exact physical memory geometry of the DRAM bank and selects two aggressor rows ($WL_{V-1}$ and $WL_{V+1}$) that directly sandwich a single target victim row ($WL_V$) between them. By executing an alternating execution loop that activates $WL_{V-1}$ and $WL_{V+1}$ sequentially at maximum bus speed, the victim row's storage capacitors are subjected to additive electromagnetic disturbance fields from **both top and bottom wordlines simultaneously**. This constructive interference doubles the capacitive leakage current, reducing the required activation threshold by over $80\%$ and triggering reliable physical bit-flips in memory modules that are completely immune to single-sided hammering.

```text
DOUBLE-SIDED ROWHAMMER "SANDWICH" TOPOLOGY

 Physical DRAM Memory Bank Array
 ┌─────────────────────────────────────────────────────────────┐
 │ AGGRESSOR ROW A1 (WL_V-1) : ACTIVATED ALTERNATELY!          │ ◄── Top Wordline
 ├─────────────────────────────────────────────────────────────┤ ◄── Parasitic Leakage C_top
 │ TARGET VICTIM ROW V (WL_V) : BOMBARDED FROM BOTH SIDES!     │ ◄── DOUBLE LEAKAGE!
 ├─────────────────────────────────────────────────────────────┤ ◄── Parasitic Leakage C_bottom
 │ AGGRESSOR ROW A2 (WL_V+1) : ACTIVATED ALTERNATELY!          │ ◄── Bottom Wordline
 └─────────────────────────────────────────────────────────────┘
  (Victim Row V suffers combined charge drain from top and bottom!)
```

---

## The Sandwich Squeeze and the Two Heavy Bass Drums

To build an intuitive, crystal-clear mental model of how Double-Sided Rowhammer accelerates charge leakage compared to single-sided hammering, let us consider an everyday analogy: a quiet apartment dweller trapped between two noisy neighbors.

Imagine a thin-walled apartment building (a dense DRAM Memory Bank Array) containing long rows of small studio apartments (DRAM Memory Rows).

Inside **Apartment 11 (The Victim Row $WL_V$)** lives a quiet tenant. On a narrow shelf mounted on the wall of Apartment 11 sits a delicate glass vase balancing near the edge. This glass vase represents an **electrical charge stored on a microscopic 1T1C memory capacitor**:
* If the glass vase remains balancing safely on the shelf, it represents a digital **$1$**.
* If the glass vase slides off the shelf and shatters on the floor, it represents a digital **$0$** (a physical bit-flip!).

Every 64 minutes, a diligent apartment building manager walks through the building, inspects every room, and re-centers all sliding vases back to the middle of their shelves (**The Periodic DRAM Refresh Cycle $t_{\text{REFI}} = 64\text{ ms}$**).

```text
APARTMENT BUILDING SANDWICH ANALOGY

 Apartment 10 (Aggressor A1)  ──► Heavy Bass Drum 1 (Top Neighbor)
 ┌───────────────────────────┐
 │ Thin Drywall Floor        │
 ├───────────────────────────┤
 │ Apartment 11 (Victim V)   │  ──► Glass Vase Balancing on Shelf
 ├───────────────────────────┤
 │ Thin Drywall Ceiling      │
 └───────────────────────────┘
 Apartment 12 (Aggressor A2)  ──► Heavy Bass Drum 2 (Bottom Neighbor)
```

Now, let us compare two different scenarios of neighbor noise:

### Scenario 1: Single-Sided Noise (Top Neighbor Only)
The tenant in Apartment 10 (above) plays a heavy bass drum, slamming the pedal 100,000 times in 30 minutes. 

The ceiling of Apartment 11 vibrates. The glass vase slides $0.6\text{ centimeters}$ toward the edge. But because $0.6\text{ cm}$ is less than the $1.0\text{-cm}$ edge threshold, the vase remains on the shelf. 

When minute 64 arrives, the building manager enters Apartment 11 and re-centers the vase. **Zero glass breaks (No Bit-Flip occurs!)**.

### Scenario 2: Double-Sided Noise (The Sandwich Squeeze)
Now, suppose both neighbors—the tenant in Apartment 10 (above) AND the tenant in Apartment 12 (below)—coordinate their noise!

They play two heavy bass drums in an alternating rhythm:
$$\text{BOOM (Apartment 10)} \longrightarrow \text{BOOM (Apartment 12)} \longrightarrow \text{BOOM (Apartment 10)} \longrightarrow \text{BOOM (Apartment 12)}$$

Look at what happens inside Apartment 11:
1. When Apartment 10 hits the drum, the **ceiling vibrates**, shaking the vase toward the edge.
2. A millisecond later, when Apartment 12 hits the drum, the **floor vibrates**, shaking the vase further in the exact same direction!
3. Apartment 11 is subjected to **additive physical vibration from both top and bottom simultaneously**!
4. Instead of sliding $0.6\text{ cm}$, the glass vase slides **$1.4\text{ centimeters}$ in just 20 minutes**!
5. Long before the building manager arrives at minute 64 to re-center the vase, **the glass vase falls off the shelf and shatters on the floor!** (**A Physical Double-Sided Bit-Flip!**)

```text
DOUBLE-SIDED VASE SHATTERING TIMELINE

 Top Neighbor BOOM!     ──► Vase slides 0.01 mm toward edge
 Bottom Neighbor BOOM!  ──► Vase slides another 0.01 mm in same direction!
 20,000 Alternating Boom Pairs ──► Vase FALLS OFF SHELF AND SHATTERS! (Bit-Flip!)
 Minute 64              ──► Manager arrives (TOO LATE! Vase already broken!)
```

Notice what Double-Sided hammering accomplished:
* The quiet tenant in Apartment 11 never touched their vase.
* The building manager followed all maintenance schedules.
* Yet, by **sandwiching Apartment 11 between two alternating noisy neighbors**, the total vibration force doubled, and the time required to break the vase dropped well below the manager's 64-minute refresh window!

This apartment sandwich scenario is the exact physical analogue of **Double-Sided Rowhammer**:
* Apartment 10 is **Aggressor Row 1 ($WL_{V-1}$)**.
* Apartment 12 is **Aggressor Row 2 ($WL_{V+1}$)**.
* Apartment 11 is **Victim Row ($WL_V$)**.
* The glass vase balancing on the shelf is the **Stored Electrical Charge on a 1T1C Capacitor ($C_{\text{cell}}$)**.
* Alternating bass drum hits are **Alternating `ACTIVATE` Commands on $WL_{V-1}$ and $WL_{V+1}$**.
* Additive wall vibration is **Superposition of Top and Bottom Capacitive Leakage ($C_{\text{cross1}} + C_{\text{cross2}}$)**.
* The glass vase shattering at minute 20 is a **Physical Double-Sided Bit-Flip ($1 \to 0$)**.

---

## Microarchitectural Mechanics of Double-Sided Hammering

To understand why double-sided hammering accelerates bit-flips in silicon, we must examine the physical geometry of DRAM wordlines and the mathematical equations governing capacitive charge loss.

### Physical Wordline Geometry and the Sandwich Array

A modern DRAM bank array is composed of thousands of parallel wordline copper traces etched into the silicon substrate.

In a 2D memory array, physical rows are arranged in exact numerical sequence:
* **Row $V-1$**: Physical Wordline 100 ($WL_{V-1}$)
* **Row $V$**: Physical Wordline 101 ($WL_V$ — Target Victim Row)
* **Row $V+1$**: Physical Wordline 102 ($WL_{V+1}$)

```text
PHYSICAL WORDLINE GEOMETRY IN DRAM SILICON

 Wordline WL_V-1 (Aggressor 1) ═════════════════════════════════════════
                                  ▲               ▲
                                  │ C_cross1      │ Sub-threshold Leakage 1
                                  ▼               ▼
 Wordline WL_V   (Victim)      ───[ 1T1C Storage Cell C_victim ]────────
                                  ▲               ▲
                                  │ C_cross2      │ Sub-threshold Leakage 2
                                  ▼               ▼
 Wordline WL_V+1 (Aggressor 2) ═════════════════════════════════════════
```

Each 1T1C storage cell in Victim Row $V$ consists of a storage capacitor $C_{\text{victim}}$ ($\sim 20\text{ fF}$) connected to its bitline through an access transistor $M_V$.

The access transistor $M_V$ is surrounded physically by two parallel control wires:
* $WL_{V-1}$ passes directly above $M_V$'s gate terminal, forming top parasitic capacitor $C_{\text{cross1}}$.
* $WL_{V+1}$ passes directly below $M_V$'s gate terminal, forming bottom parasitic capacitor $C_{\text{cross2}}$.

---

### The Alternating Double-Sided Activation Cycle

To execute a Double-Sided Rowhammer attack, the attacker's assembly loop dispatches alternating memory accesses to physical addresses $A_1$ (mapping to $WL_{V-1}$) and $A_2$ (mapping to $WL_{V+1}$).

This forces the memory controller to execute the following **Alternating Command Sequence** across the memory bus at maximum speed:

$$\text{ACT } WL_{V-1} \longrightarrow \text{PRE } WL_{V-1} \longrightarrow \text{ACT } WL_{V+1} \longrightarrow \text{PRE } WL_{V+1}$$

```text
DOUBLE-SIDED ALTERNATING COMMAND WAVEFORMS

 Voltage V_WL
  3.0V ┼─── ACT WL_V-1 ─────────┐                 ┌─── ACT WL_V+1 ─────────┐
       │                        │                 │                        │
  0.0V ┴────────────────────────┴── PRE WL_V-1 ───┴────────────────────────┴── PRE
       ◄─── Cycle 1 (Top) ─────►                  ◄─── Cycle 2 (Bottom) ───►
```

Trace the physical voltage and charge events across the two-cycle loop:

#### Cycle 1: Activating Aggressor $WL_{V-1}$ (Top Hammer)
1. The memory controller drives $WL_{V-1}$ from $0.0\text{ V}$ up to high pumping voltage $V_{\text{PP}} \approx 3.0\text{ V}$.
2. The rapid voltage transition ($\frac{dV}{dt}$) on $WL_{V-1}$ induces a transient voltage spike ($V_{\text{spike1}} \approx 0.35\text{ V}$) on victim wordline $WL_V$ via top capacitor $C_{\text{cross1}}$.
3. Victim access transistor $M_V$ enters sub-threshold conduction, leaking a charge packet $\Delta Q_{\text{top}}$ from $C_{\text{victim}}$.
4. The memory controller issues `PRECHARGE`, dropping $WL_{V-1}$ back to $0.0\text{ V}$.

#### Cycle 2: Activating Aggressor $WL_{V+1}$ (Bottom Hammer)
1. The memory controller immediately drives $WL_{V+1}$ from $0.0\text{ V}$ up to $V_{\text{PP}} = 3.0\text{ V}$.
2. The rapid voltage transition on $WL_{V+1}$ induces a second transient voltage spike ($V_{\text{spike2}} \approx 0.35\text{ V}$) on victim wordline $WL_V$ via bottom capacitor $C_{\text{cross2}}$.
3. Victim access transistor $M_V$ enters sub-threshold conduction a second time, leaking a charge packet $\Delta Q_{\text{bottom}}$ from $C_{\text{victim}}$.
4. The memory controller issues `PRECHARGE`, dropping $WL_{V+1}$ back to $0.0\text{ V}$.

---

### Superposition of Leakage Currents: Single-Sided vs Double-Sided Equations

Let us compare the mathematical charge loss equations between single-sided and double-sided hammering over a standard $64\text{-millisecond}$ refresh window ($t_{\text{REFI}} = 64\text{ ms}$).

Let $N_{\text{total\_activations}}$ be the maximum number of row activations the memory controller can execute in $64\text{ ms}$ (typically $N_{\text{total\_activations}} \approx 1,400,000$ activations at $t_{\text{RC}} = 45\text{ ns}$).

#### 1. Single-Sided Hammering Charge Loss ($Q_{\text{lost\_single}}$):
In single-sided hammering, all $N_{\text{total\_activations}}$ target a single row $WL_{V-1}$:

$$Q_{\text{lost\_single}} = (I_{\text{ret}} \cdot t_{\text{REFI}}) + \left( N_{\text{total\_activations}} \cdot \Delta Q_{\text{top}} \right)$$

Where:
* $I_{\text{ret}}$ is the natural retention leakage current of the DRAM cell in Amperes ($\text{A}$).
* $t_{\text{REFI}}$ is the refresh window duration ($64 \times 10^{-3}\text{ s}$).
* $N_{\text{total\_activations}}$ is the total number of activations executed.
* $\Delta Q_{\text{top}}$ is the charge lost per single top activation ($\Delta Q_{\text{top}} \approx 1.2 \times 10^{-19}\text{ C}$).

#### 2. Double-Sided Hammering Charge Loss ($Q_{\text{lost\_double}}$):
In double-sided hammering, $N_{\text{total\_activations}}$ is split equally between $WL_{V-1}$ ($N_{\text{pair}} = \frac{N_{\text{total}}}{2}$ activations) and $WL_{V+1}$ ($N_{\text{pair}}$ activations):

$$Q_{\text{lost\_double}} = (I_{\text{ret}} \cdot t_{\text{REFI}}) + \sum_{k=1}^{N_{\text{pair}}} \left( \Delta Q_{\text{top}}(k) + \Delta Q_{\text{bottom}}(k) + \Delta Q_{\text{trapped}}(k) \right)$$

$$\mathbf{Q_{\text{lost\_double}} = (I_{\text{ret}} \cdot t_{\text{REFI}}) + \left( \frac{N_{\text{total\_activations}}}{2} \right) \cdot \left( \Delta Q_{\text{top}} + \Delta Q_{\text{bottom}} + \Delta Q_{\text{trapped}} \right)}$$

Where:
* $\Delta Q_{\text{bottom}}$ is the charge lost per bottom activation ($\Delta Q_{\text{bottom}} \approx 1.2 \times 10^{-19}\text{ C}$).
* $\Delta Q_{\text{trapped}}$ is additional charge loss caused by trapped interface state charge accumulation during high-frequency alternating switching.

```text
SINGLE-SIDED VS DOUBLE-SIDED LEAKAGE RATE COMPARISON

 Charge Lost Q_lost (fC)
  24.0 fC ┼───────────────────────────────────────────── Initial Fully Charged State
          │
  12.0 fC ┼─── CRITICAL BIT-FLIP THRESHOLD (Q_thresh) ───────────────────────────
          │                                  /
   8.0 fC ┼                                 /  Double-Sided Leakage Slope
          │                                /   (REACHES THRESHOLD AT 20 MS!)
   4.0 fC ┼                  /------------*
          │                 /  Single-Sided Leakage Slope (Never reaches 12 fC!)
   0.0 fC ┴────────────────*─────────────────────────────► Time (ms)
          0               20ms        40ms              64ms (Refresh Window)
```

#### The Super-Linear Acceleration Effect:
Because $\Delta Q_{\text{top}} \approx \Delta Q_{\text{bottom}}$, the combined per-pair leakage term $(\Delta Q_{\text{top}} + \Delta Q_{\text{bottom}})$ is **more than twice as large** as single-sided leakage!

The activation count required to trigger a bit-flip drops by **$80\%\text{ to } 90\%$**:

$$N_{\text{double\_threshold}} \approx \frac{N_{\text{single\_threshold}}}{5 \text{ to } 10}$$

While single-sided hammering requires $\sim 200,000$ activations to flip a bit, double-sided hammering triggers bit-flips with as few as **$15,000 \text{ to } 30,000$ total activations**!

---

## Physical Address Mapping and Finding Double-Sided Sandwich Rows

To execute a double-sided Rowhammer attack in software, an attacker faces a major systems engineering challenge:

> **The Address Alignment Problem**: The attacker must find two virtual addresses, `addr_A1` and `addr_A2`, that map to physical memory rows that directly sandwich a target victim row $V$ in the exact same DRAM bank:
> $$WL_{A1} = WL_V - 1 \quad \mathbf{\text{AND}} \quad WL_{A2} = WL_V + 1$$

How does an unprivileged software process find sandwich rows when the operating system kernel uses virtual memory paging and hides physical addresses?

```text
VIRTUAL MEMORY FRAGMENTATION VS HUGEPAGES

 Standard 4KB Paging (Random Physical Page Placement)
 Virtual Page 0 (0x1000) ──► Physical DRAM Page 0x8400 (Row 100)
 Virtual Page 1 (0x2000) ──► Physical DRAM Page 0x1200 (Row 450 - NOT ADJACENT!)

 2MB Hugepages (Contiguous Physical Memory Block)
 Virtual Address 0x200000 ──► Physical Address 0x200000 (2 MB Contiguous RAM!)
                              (Contains 512 physically sequential 4KB DRAM Rows!)
```

---

### Step 1: Allocating Contiguous Physical Memory via 2MB Hugepages

In standard $4\text{-KB}$ virtual memory paging, the OS kernel allocates physical pages randomly across RAM. Virtual Page 0 and Virtual Page 1 are almost never physically adjacent in DRAM.

To obtain physically contiguous memory, the attacker allocates **$2\text{-Megabyte}$ Hugepages** (using `mmap` with `MAP_HUGETLB` or `posix_memalign`):
* A $2\text{-MB}$ Hugepage is an aligned block of $2,097,152\text{ bytes}$.
* The lowest 21 bits of a $2\text{-MB}$ virtual address ($A_{\text{virtual}}[20:0]$) are **$100\%$ identical to its physical address bits ($A_{\text{physical}}[20:0]$)**!
* A single $2\text{-MB}$ Hugepage contains **$512$ physically sequential $4\text{-KB}$ memory rows** ($512 \times 4,096 = 2,097,152\text{ bytes}$).

---

### Step 2: DRAM Bank and Row Function Decoding

Inside a $2\text{-MB}$ contiguous physical memory block, memory addresses map to DRAM Banks, Ranks, and Rows according to hardware **DRAM Address Mapping Functions**.

In standard dual-channel DDR4 memory controllers, the mapping of physical address bits to DRAM Bank and Row indices follows linear XOR functions:

$$\text{DRAM Row Index } R = A_{\text{physical}}[33:18]$$

$$\text{DRAM Bank Index } B = A_{\text{physical}}[14] \oplus A_{\text{physical}}[18]$$

$$\text{DRAM Bank Group } BG = A_{\text{physical}}[13] \oplus A_{\text{physical}}[17]$$

```text
PHYSICAL ADDRESS BIT DECOMPOSITION FOR DDR4 DRAM MAPPING

 Physical Address Bits A_physical[33:0]
 ┌───────────────────────────┬──────────────┬──────┬──────┬──────────────┬───────────┐
 │ Row Address Bits [33:18]  │ Col [17:15]  │ B[14]│BG[13]│ Col [12:6]   │ Offset[5:0│
 └───────────────────────────┴──────────────┴──────┴──────┴──────────────┴───────────┘
```

#### Locating Sandwich Rows in Code:
Because row index bits $[33:18]$ increase linearly with memory addresses:
1. Two addresses separated by exactly one $4\text{-KB}$ page size ($4,096\text{ bytes} = \text{0x1000}$) reside in **consecutive physical DRAM rows** ($Row_{k+1} = Row_k + 1$).
2. To sandwich Victim Row $V$ (located at address $A_V$):
   * Aggressor Row 1 ($A_1$) is allocated at address $A_V - 4096\text{ bytes}$ ($Row_{V-1}$).
   * Aggressor Row 2 ($A_2$) is allocated at address $A_V + 4096\text{ bytes}$ ($Row_{V+1}$).

$$\mathbf{Address(A_1) = A_V - 4096 \quad \mathbf{\text{AND}} \quad Address(A_2) = A_V + 4096}$$

```text
DOUBLE-SIDED SANDWICH ADDRESS SELECTION

 Memory Offset 0x0000 : Aggressor Row A1 (Address = A_V - 4096) ──► Row V - 1
 Memory Offset 0x1000 : Target Victim Row V (Address = A_V)       ──► Row V
 Memory Offset 0x2000 : Aggressor Row A2 (Address = A_V + 4096) ──► Row V + 1
```

By alternating memory reads between `A_V - 4096` and `A_V + 4096`, the attacker hammers Row $V-1$ and Row $V+1$ simultaneously, bombarding Target Victim Row $V$ from both sides!

---

## Kernel Privilege Escalation via Page Table Entry (PTE) Corruption

Why is a double-sided Rowhammer bit-flip so dangerous to operating system security?

Because an attacker can manipulate memory layout so that a target victim row $V$ contains a **Page Table Entry (PTE)** owned by the attacker's process!

### The Page Table Entry (PTE) Flip Attack Sequence

```text
DOUBLE-SIDED ROWHAMMER PRIVILEGE ESCALATION FLOW

 1. Spray Memory: Fill DRAM Bank with 1,000 Page Table Entries (PTEs).
 2. Target Identification: Victim Row V contains Attacker's PTE pointing to User Page.
    PTE Contents = [ Physical Frame Number PFN = 0x0008_4000 | User Flags U/S=1, R/W=1 ]
                               │
                               ▼
 3. Execute Double-Sided Hammering on Aggressor Rows V-1 and V+1!
                               │
                               ▼
 4. BIT-FLIP OCCURS IN VICTIM ROW V!
    Bit 18 of PFN flips from 0 -> 1!
    PTE Contents BECOME = [ Physical Frame Number PFN = 0x000C_4000 | Flags U/S=1 ]
                           ▲
                           └── PFN 0x0C4000 IS KERNEL PAGE TABLE MEMORY!
                               │
                               ▼
 5. ATTACKER GAINS DIRECT READ/WRITE ACCESS TO ENTIRE PHYSICAL RAM! (ROOT ESCALATION!)
```

Trace the step-by-step kernel compromise:

1. **Page Table Spraying**: The attacker process allocates thousands of virtual memory pages. The operating system kernel creates thousands of Page Table Entries (PTEs) in system DRAM to manage these pages.
2. **PTE Alignment**: The attacker structures allocation so that Victim Row $V$ contains a PTE owned by the attacker. The PTE initially points to a harmless user-space data page at Physical Frame Number $\text{PFN} = \text{0x0008\_4000}$:
   $$\text{PTE}_{\text{initial}} = [\quad \text{PFN} = \text{0x0008\_4000} \quad \mid \quad U/S = 1, \ R/W = 1, \ P = 1 \quad]$$
3. **Double-Sided Hammering**: The attacker hammers Aggressor Rows $V-1$ and $V+1$ for 20 milliseconds.
4. **The Bit-Flip Event**: A double-sided bit-flip occurs in Victim Row $V$! Bit 18 of the physical frame number ($\text{PFN}$) flips from $0 \to 1$:
   $$\text{PTE}_{\text{corrupted}} = [\quad \text{PFN} = \mathbf{\text{0x000C\_4000}} \quad \mid \quad U/S = 1, \ R/W = 1, \ P = 1 \quad]$$
5. **Kernel Hijack**: Physical Frame `0x000C_4000` is **a kernel-owned page table page**!
6. Because the corrupted PTE has $U/S = 1$ (User Mode Allowed), the attacker process now possesses **direct read and write access to a kernel page table**!
7. The attacker modifies the kernel page table, grants itself full supervisor root privileges, and takes over the operating system kernel completely!

---

## Hardware Evasion of Single-Row TRR Counters

When memory vendors integrated first-generation **Target Row Refresh (TRR)** mechanisms into DDR4 memory controllers and on-die DRAM chips, they designed TRR around a simple assumption: *Rowhammer is caused by repeatedly activating a single row.*

### How Single-Row TRR Failed Against Double-Sided Hammering

First-generation TRR controllers contained a single sampling register or counter:
1. TRR samples the row address $R_{\text{active}}$ on every `ACTIVATE` command.
2. If $R_{\text{active}}$ matches the previous row address, TRR increments a counter ($C_{\text{act}} \Leftarrow C_{\text{act}} + 1$).
3. If $C_{\text{act}} > 1024$, TRR triggers an emergency refresh to $R_{\text{active}} - 1$ and $R_{\text{active}} + 1$.

```text
SINGLE-ROW TRR COUNTER EVASION BY DOUBLE-SIDED HAMMERING

 Double-Sided Stream: ACT A1 -> ACT A2 -> ACT A1 -> ACT A2 ...
                      │          │        │        │
 TRR Counter Step 1 : Sample A1  │        │        │  (Count_A1 = 1)
 TRR Counter Step 2 : Sample A2 ─┘        │        │  (Address changed! Reset Count_A1 = 0!)
 TRR Counter Step 3 : Sample A1 ──────────┘        │  (Address changed! Reset Count_A2 = 0!)
 TRR Counter Step 4 : Sample A2 ───────────────────┘  (Address changed! Reset Count_A1 = 0!)
 (Single-row TRR counter NEVER reaches 1,024! TRR IS COMPLETELY BYPASSED!)
```

Look at the hardware evasion in the trace above:
* Because the double-sided attacker **alternates between Row $A_1$ and Row $A_2$ on every single cycle**, the active row address changes on every command!
* Single-row TRR counters see $A_1 \to A_2 \to A_1 \to A_2$ and reset their internal activation count to zero on every step!
* The TRR counter **never reaches 1,024**, no emergency refresh is ever issued, and Victim Row $V$ suffers a double-sided bit-flip in complete bypass of TRR hardware defenses!

---

## Solved Industrial Engineering Exercise: Quantitative Double-Sided Charge Leakage, Acceleration Factor, and TRR Evasion Thresholds

To consolidate your complete mastery of double-sided Rowhammer mechanics, 1T1C capacitive charge superposition, bit-flip acceleration factors, and TRR counter bypass math, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal memory hardware reliability engineer auditing a $3.2\text{ GHz}$ server processor connected to a dual-channel DDR4 memory module ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The memory controller accesses a DRAM bank with the following physical parameters:
* **Standard Refresh Window ($t_{\text{REFI}}$)**: $64.0\text{ milliseconds}$ ($64 \times 10^{-3}\text{ s}$).
* **Minimum Row Cycle Time ($t_{\text{RC}}$)**: $45.0\text{ nanoseconds}$ ($45.0 \times 10^{-9}\text{ s}$).
* **1T1C Storage Capacitor ($C_{\text{cell}}$)**: $20.0\text{ femtofarads}$ ($20.0 \times 10^{-15}\text{ F}$).
* **Supply Voltage ($V_{\text{DD}}$)**: $1.20\text{ Volts}$.
* **Initial Fully Charged State ($Q_{\text{initial}}$)**: $Q_{\text{initial}} = C_{\text{cell}} \cdot V_{\text{DD}} = \mathbf{24.0 \text{ fC}}$ ($24.0 \times 10^{-15}\text{ C}$).
* **Sense Amplifier Decision Threshold ($V_{\text{thresh}}$)**: $0.60\text{ Volts} \implies Q_{\text{thresh}} = \mathbf{12.0 \text{ fC}}$.
* **Maximum Allowable Charge Loss ($\Delta Q_{\text{max}}$)**: $\Delta Q_{\text{max}} = 24.0 - 12.0 = \mathbf{12.0 \text{ fC}}$.
* **Natural Retention Leakage Current ($I_{\text{ret}}$)**: $10.0\text{ pA} \implies Q_{\text{natural}} = 0.640\text{ fC}$ over $64\text{ ms}$.
* **Single-Sided Parasitic Leakage per Activation ($\Delta Q_{\text{single}}$)**: $\Delta Q_{\text{single}} = 1.20 \times 10^{-19}\text{ C/act} = 0.000120\text{ fC/act}$.
* **Double-Sided Combined Leakage per Pair Activation ($\Delta Q_{\text{double}}$)**: Because top and bottom wordlines both leak into Victim Row $V$, each pair activation ($1\text{ ACT } A_1 + 1\text{ ACT } A_2$) causes a combined leakage of:
  $$\Delta Q_{\text{double}} = 3.60 \times 10^{-19}\text{ C/pair} = \mathbf{0.000360 \text{ fC/pair activation}}$$

```text
DOUBLE-SIDED ROWHAMMER TEST PARAMETERS

 DRAM Storage Cell C_cell = 20 fF | V_DD = 1.2 V | Q_initial = 24.0 fC
 Allowed Charge Loss Delta_Q_max = 12.0 fC | Q_natural (64ms) = 0.64 fC
 Single-Sided Leakage Delta_Q_single = 0.000120 fC / activation
 Double-Sided Leakage Delta_Q_double = 0.000360 fC / pair activation
```

#### Your Objective

1. Calculate the single-sided activation threshold $N_{\text{single\_thresh}}$ required to trigger a bit-flip in a $64\text{-ms}$ window.
2. Calculate the double-sided pair activation threshold $N_{\text{double\_thresh}}$ required to trigger a bit-flip in a $64\text{-ms}$ window.
3. Calculate the **Bit-Flip Acceleration Factor ($\gamma$)** of double-sided hammering over single-sided hammering.
4. Calculate the physical execution time $T_{\text{flip\_double}}$ (in milliseconds) required for an attacker to execute $N_{\text{double\_thresh}}$ pair activations over the memory bus.
5. Evaluate a first-generation TRR counter that tracks only single-row activation runs ($C_{\text{act}} \ge 1,000$). Prove mathematically why double-sided alternating hammering ($A_1 \to A_2 \to A_1 \to A_2$) bypasses the TRR counter completely.
6. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Single-Sided Activation Threshold ($N_{\text{single\_thresh}}$)

Available charge budget for disturbance leakage over $64\text{ ms}$:

$$\Delta Q_{\text{allowed}} = \Delta Q_{\text{max}} - Q_{\text{natural}} = 12.0\text{ fC} - 0.640\text{ fC} = \mathbf{11.360 \text{ fC}} = 11.360 \times 10^{-15} \text{ C}$$

Given single-sided leakage $\Delta Q_{\text{single}} = 1.20 \times 10^{-19}\text{ C/act}$:

$$N_{\text{single\_thresh}} = \frac{\Delta Q_{\text{allowed}}}{\Delta Q_{\text{single}}} = \frac{11.360 \times 10^{-15} \text{ C}}{1.20 \times 10^{-19} \text{ C/act}}$$

$$N_{\text{single\_thresh}} = \frac{11.360 \times 10^{-15}}{0.000120 \times 10^{-15}} \approx \mathbf{94,666.67 \text{ Single Activations}}$$

$$\mathbf{N_{\text{single\_thresh}} = 94,667 \text{ Activations}}$$

Single-sided hammering requires **$94,667\text{ activations}$** on a single row to flip a bit.

---

#### Step 2: Calculate Double-Sided Activation Threshold ($N_{\text{double\_thresh}}$)

In double-sided hammering, each pair activation ($1\text{ ACT } A_1 + 1\text{ ACT } A_2$) leaks $\Delta Q_{\text{double}} = 0.000360\text{ fC/pair}$.

$$N_{\text{double\_thresh}} = \frac{\Delta Q_{\text{allowed}}}{\Delta Q_{\text{double}}} = \frac{11.360 \times 10^{-15} \text{ C}}{3.60 \times 10^{-19} \text{ C/pair}}$$

$$N_{\text{double\_thresh}} = \frac{11.360 \times 10^{-15}}{0.000360 \times 10^{-15}} \approx \mathbf{31,555.56 \text{ Pair Activations}}$$

$$\mathbf{N_{\text{double\_thresh}} = 31,556 \text{ Pair Activations (63,112 Total Row Activations)}}$$

Double-sided hammering requires only **$31,556\text{ pair activations}$ ($63,112\text{ total activations}$)** to flip the exact same bit!

---

#### Step 3: Calculate Bit-Flip Acceleration Factor ($\gamma$)

We compare the total row activations required for single-sided ($94,667$) versus double-sided ($63,112$):

$$\text{Total Activations Ratio} = \frac{N_{\text{single\_thresh}}}{N_{\text{double\_total}}} = \frac{94,667}{63,112} \approx \mathbf{1.500\times \text{ Total Activation Reduction}}$$

Now let us compare the **per-row activation requirement** ($94,667$ activations on Row $A_1$ for single-sided vs $31,556$ activations on Row $A_1$ for double-sided):

$$\mathbf{\text{Acceleration Factor } \gamma = \frac{N_{\text{single\_thresh}}}{N_{\text{double\_per\_row}}} = \frac{94,667}{31,556} \approx \mathbf{3.000\times \text{ Per-Row Acceleration!}}}$$

##### Acceleration Result:
Double-sided hammering **reduces the required activations per aggressor row by $3.0\times$ ($66.7\%$ reduction in per-row stress)**, enabling bit-flips to occur far faster and below single-row detection thresholds!

---

#### Step 4: Calculate Physical Execution Time for Double-Sided Bit-Flip ($T_{\text{flip\_double}}$)

Each pair activation ($1\text{ ACT } A_1 + 1\text{ PRE } A_1 + 1\text{ ACT } A_2 + 1\text{ PRE } A_2$) requires two row cycle times ($2 \times t_{\text{RC}}$):

$$T_{\text{pair\_cycle}} = 2 \times t_{\text{RC}} = 2 \times 45.0\text{ ns} = \mathbf{90.0 \text{ nanoseconds}}$$

Total physical time $T_{\text{flip\_double}}$ to execute $31,556\text{ pair activations}$:

$$T_{\text{flip\_double}} = 31,556 \text{ pairs} \times 90.0 \times 10^{-9}\text{ s/pair} = \mathbf{0.00284004 \text{ Seconds}} = \mathbf{2.840 \text{ Milliseconds}}$$

```text
PHYSICAL TIMING COMPARISON

 Attack Topology            │ Activations / Row │ Total Time to Bit-Flip │ Status vs 64ms Refresh
────────────────────────────┼───────────────────┼────────────────────────┼────────────────────────
 Single-Sided Hammering     │ 94,667 Acts       │ 4.260 Milliseconds     │ Bit-Flip Occurs
 Double-Sided Hammering     │ 31,556 Acts/Row   │ 2.840 Milliseconds     │ 1.5x FASTER BIT-FLIP!
```

##### Physical Result:
Double-sided hammering triggers a physical bit-flip in **$2.840\text{ milliseconds}$**—over 22 times faster than the $64\text{-ms}$ DRAM refresh window!

---

#### Step 5: Evaluate Single-Row TRR Counter Evasion

The first-generation TRR counter monitors single-row activations and triggers an emergency refresh when $C_{\text{act\_single}} \ge 1,000$ consecutive activations on the same row.

##### Trace Double-Sided Alternating Stream ($A_1 \to A_2 \to A_1 \to A_2$):
1. Iteration 1: `ACT A1` $\implies$ TRR stores $R_{\text{active}} = A_1$, sets $C_{\text{act}} = 1$.
2. Iteration 2: `ACT A2` $\implies$ TRR detects $A_2 \neq A_1$. TRR resets $C_{\text{act}} \Leftarrow 1$, storing $R_{\text{active}} = A_2$.
3. Iteration 3: `ACT A1` $\implies$ TRR detects $A_1 \neq A_2$. TRR resets $C_{\text{act}} \Leftarrow 1$, storing $R_{\text{active}} = A_1$.

```text
TRR COUNTER EVASION PROOF

 Command Stream : ACT A1 ──► ACT A2 ──► ACT A1 ──► ACT A2 ... (31,556 Pairs)
 TRR Counter    : C = 1  ──► C = 1  ──► C = 1  ──► C = 1  ... (NEVER REACHES 1,000!)
 (Single-row TRR counter remains stuck at C = 1 forever! TRR BYPASSED!)
```

##### Mathematical Proof of TRR Evasion:
Because the active row address changes on every single command:

$$\forall k \in [1, N_{\text{double\_thresh}}], \quad C_{\text{act}}(k) \equiv 1 \ll 1,000$$

$$\mathbf{\text{TRR Counter Status: NEVER TRIGGERS EMERGENCY REFRESH!}}$$

The single-row TRR counter stays stuck at $C_{\text{act}} = 1$ forever. 

Victim Row $V$ receives zero emergency refreshes, and the double-sided bit-flip completes in $2.840\text{ ms}$ with $100\%$ zero TRR detection!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against memory principles:

1. **Charge Superposition Check**:
   * Single-sided leakage $\Delta Q_{\text{single}} = 0.000120\text{ fC/act}$.
   * Double-sided pair leakage $\Delta Q_{\text{double}} = 0.000360\text{ fC/pair}$.
   * $\Delta Q_{\text{double}} > 2 \times \Delta Q_{\text{single}}$ ($0.000360 > 0.000240$), reflecting constructive inter-wordline field superposition.
2. **Bit-Flip Time vs Refresh Window Check**:
   * $T_{\text{flip\_double}} = 2.840\text{ ms}$.
   * Refresh window $t_{\text{REFI}} = 64.0\text{ ms}$.
   * $2.840\text{ ms} \ll 64.0\text{ ms}$, proving the bit-flip executes 22.5 times before the refresh cycle arrives.
3. **TRR Evasion Proof Verification**:
   * Alternating $A_1 \to A_2$ forces a row switch on every $45\text{ ns}$ cycle.
   * Single-row tracker fails to accumulate counts, verifying $100\%$ TRR bypass.

All 1T1C DRAM cell charge calculations, double-sided capacitive superposition equations, per-row acceleration factors ($\gamma = 3.0\times$), and TRR counter bypass proofs evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Double-sided Rowhammer**: An advanced hardware physical disturbance attack where an attacker alternates activations between two physical DRAM aggressor rows ($WL_{V-1}$ and $WL_{V+1}$) that directly sandwich a target victim row ($WL_V$), subjecting the victim capacitors to simultaneous top and bottom capacitive charge leakage.
* **Target row bit-flip acceleration**: The physical phenomenon where double-sided wordline activation creates additive electromagnetic field superposition, reducing the required per-row activation threshold by over $80\%$ and bypassing single-row TRR refresh counters to trigger rapid physical bit-flips.
