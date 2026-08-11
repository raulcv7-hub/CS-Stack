---
title: "One-Transistor One-Capacitor DRAM Cell Mechanics and Destructive Read Operations"
---

# One-Transistor One-Capacitor DRAM Cell Mechanics and Destructive Read Operations

## The Silicon Area Density Wall and the Impermanence of Charge Storage

In high-performance digital systems, central processing units and graphics accelerators require massive amounts of primary working memory to store operating system kernels, application code, and multi-gigabyte data sets. To maintain high execution speeds, this primary memory must offer random-access capabilities, allowing any arbitrary memory address to be accessed in a fixed, short duration.

Earlier in our exploration of memory hierarchies, we examined Static Random-Access Memory (SRAM), which is used to construct ultra-fast Level 1, Level 2, and Level 3 cache buffers directly on the processor die. An SRAM cell uses a cross-coupled feedback loop formed by six complementary metal-oxide-semiconductor (CMOS) transistors (a 6T SRAM cell) to store a single binary bit ($0$ or $1$). Because the cross-coupled inverters actively drive their outputs to full supply voltage ($V_{DD}$) or Ground ($0\text{ V}$), an SRAM cell holds its stored bit indefinitely as long as electrical power remains connected.

However, when system designers need to build gigabytes or terabytes of main system memory, SRAM encounters an insurmountable physical wall: **The Silicon Area Density Barrier**.

Let us perform a physical transistor count calculation to understand why SRAM cannot be used for main system memory:

```text
THE TRANSISTOR COUNT EXPLOSION OF SRAM MAIN MEMORY

 1 Byte of Data       = 8 Bits
 1 Gigabyte (GB)      = 8,589,934,592 Bits (8.58 Billion Bits)
 6T SRAM Transistors  = 8.58 Billion x 6 = 51,539,607,552 Transistors!
 64 GB System RAM     = 64 x 51.5 Billion = 3.29 TRILLION TRANSISTORS!
```

Storing 64 Gigabytes of main system memory using 6T SRAM cells would require **over 3.29 trillion physical transistors** dedicated exclusively to basic memory storage! 

In physical silicon manufacturing:
* A single 6T SRAM cell occupies an area of approximately $120 \text{ to } 150 \times F^2$ (where $F$ is the minimum feature length of the manufacturing process node).
* A 64-GB SRAM memory module would require a silicon die surface area covering hundreds of square centimeters—larger than a dinner plate!
* Manufacturing such a massive silicon chip is physically impossible due to silicon crystal defects, and the cost would reach hundreds of thousands of dollars per single computer.
* Furthermore, hundreds of billions of active SRAM transistors leaking subthreshold current would consume hundreds of watts of static power even when the computer is completely idle!

To store gigabytes of main memory affordably on a tiny silicon chip that fits inside a laptop or smartphone, semiconductor engineers must reduce the physical footprint of a memory cell to its absolute physical minimum.

How small can we make a binary memory cell?

We can strip away the cross-coupled inverter feedback loop entirely and reduce the memory cell to **ONE SINGLE ACCESS TRANSISTOR AND ONE SINGLE STORAGE CAPACITOR**: **The 1T1C DRAM Cell**.

```text
CELL AREA COMPARISON: 6T SRAM VS 1T1C DRAM

 6T SRAM Cell (4x to 5x Larger Footprint)
 ┌─────────────────────────────────────────────────────────────┐
 │ 2 Pull-Up PMOS + 2 Pull-Down NMOS + 2 Access NMOS (6 Trans) │
 └─────────────────────────────────────────────────────────────┘

 1T1C DRAM Cell (Ultra-Dense 1x Footprint)
 ┌───────────────────────────┐
 │ 1 Access NMOS Transistor  │  ◄── 85% to 90% SMALLER SILICON AREA!
 │ 1 Storage Capacitor (Cs)  │      Allows Billions of Bits per Chip!
 └───────────────────────────┘
```

By replacing six active transistors with one transistor and one microscopic capacitor:
* The physical area of a single memory cell collapses from $120 \times F^2$ down to **$6 \text{ to } 8 \times F^2$**—an **$85\%$ to $90\%$ reduction in silicon area**!
* A single silicon die that could store only 1 Megabyte of SRAM can now store **16 Gigabytes of Dynamic RAM (DRAM)** at a tiny fraction of the manufacturing cost!

However, replacing active transistor feedback loops with a microscopic storage capacitor introduces two profound physical hardware problems that govern all main memory operations:

1. **Charge Leakage (Impermanence of Stored State)**: A 1T1C cell stores a binary bit as a presence or absence of a tiny electrical charge ($Q = C_s \cdot V$) inside a microscopic capacitor. But capacitors are not perfect insulators. Electrons slowly leak out through the transistor's PN-junctions and dielectric insulator. A 1T1C cell is **Dynamic**—it forgets its stored data within a few milliseconds unless it is continuously recharged via a **Periodic Refresh Cycle**.
2. **Destructive Read Operations**: A 1T1C storage capacitor holds an infinitesimal electrical charge—typically less than **30 femtocoulombs ($30 \times 10^{-15}\text{ C}$)**. When the access transistor turns ON to read the stored bit, that tiny charge dumps out onto a long, highly capacitive metal wire (the Bit Line). **The act of reading the cell completely destroys the stored charge!** Every read operation wipes out the data inside the cell, requiring a mandatory, immediate **Active Restore Phase** before the row can be closed.

To design reliable main memory subsystems, hardware engineers must master the internal physics of the 1T1C cell, charge-sharing dynamics, sense amplification, destructive read restoration, and periodic refresh scheduling.


### Problem 1: Water Seepage and Evaporation (Charge Leakage)

The paper teacups are porous. Water slowly seeps through the paper walls and evaporates into the air.

* If a teacup is filled to the top with water at 12:00:00 PM (Logical '1'), by 12:00:01 PM it has lost $10\%$ of its water.
* By 12:00:06 PM, it has lost $50\%$ of its water.
* If left alone for 64 milliseconds, all the water leaks out completely! A full teacup (Logical '1') turns into an empty teacup (Logical '0') on its own!

To prevent data loss, a maintenance worker (**The DRAM Controller Refresh Engine**) must walk down every aisle every 64 milliseconds, check every teacup, and **refill all full teacups back to the top** (**Periodic Refresh Cycle**).


### The Solution: The Ultra-Sensitive Scale and High-Pressure Hose (Sense Amplifier & Restore)

How does the inspector complete the read operation and fix the destroyed teacup?

1. **Sense Amplification**: An ultra-sensitive balance scale (**The Differential Sense Amplifier**) detects the tiny $+0.1\text{ mm}$ rise or $-0.1\text{ mm}$ drop in the trough water level.
   * If it detects $+0.1\text{ mm}$, it shouts: **"THE TEACUP HELD LOGICAL '1'!"**
   * If it detects $-0.1\text{ mm}$, it shouts: **"THE TEACUP HELD LOGICAL '0'!"**
2. **Mandatory Active Restoration**: While the valve is STILL OPEN:
   * If the scale detected Logical '1', a high-pressure hose turns ON and **fills the trough and the teacup all the way back to the top** ($100\%$ Full)!
   * If the scale detected Logical '0', a pump turns ON and **sucks all the water out of the trough and teacup until both are completely empty** ($0\%$ Water)!
3. **Closing the Valve**: Now that the teacup has been restored to its original state ($100\%$ Full or $0\%$ Empty), the valve is closed (**Precharge Command / Row Close**).

```text
SENSE AMPLIFICATION AND MANDATORY RESTORE PHASE

 Step 1: Detect +0.1 mm Rise ──► Scale Shouts "LOGICAL 1 DETECTED!"
 Step 2: High-Pressure Hose ──► Fills Trough & Teacup back to 100% FULL!
 Step 3: Close Valve        ──► Teacup restored to original 100% Full state!
 (The read operation completed AND the destroyed data was restored!)
```

This leaky teacup warehouse is the exact physical analogue of a **1T1C DRAM Memory Array**:
* The paper teacup is the **Microscopic Storage Capacitor ($C_s \approx 25\text{ fF}$)**.
* The valve is the **NMOS Access Transistor ($M_1$)**.
* The heavy measurement trough is the **Capacitive Bit Line Wire ($C_{BL} \approx 250\text{ fF}$)**.
* Water level shifting by $+0.1\text{ mm}$ is **Charge-Sharing Voltage Delta ($\Delta V \approx 100\text{ mV}$)**.
* Tipping the teacup is a **Destructive Read Operation**.
* The ultra-sensitive balance scale is the **Differential Sense Amplifier**.
* The high-pressure hose refilling the cup is the **Active Restore Phase ($t_{\text{RAS}}$)**.
* Refilling full cups every 64 ms is the **Periodic Refresh Cycle ($t_{\text{REF}}$)**.


### Binary State Representation in a 1T1C Cell

Unlike an SRAM cell, which uses active transistors to hold logic levels, a 1T1C cell stores binary information as **stored electrical charge ($Q$)**:

$$Q = C_s \cdot V_c$$

Where:
* $Q$ is the electrical charge stored inside the capacitor in coulombs ($\text{C}$).
* $C_s$ is the physical storage capacitance in farads ($\text{F}$).
* $V_c$ is the voltage level at internal storage node $V_c$ in volts ($\text{V}$).

```text
1T1C BINARY STATE VOLTAGE MAP

 Stored Logic State │ Node Voltage Vc │ Stored Charge Q        │ Cell Energy
────────────────────┼─────────────────┼────────────────────────┼───────────────────
 Logical '1'        │    Vc = VDD     │ Q = Cs * VDD           │ E = 0.5 * Cs * VDD²
 Logical '0'        │    Vc = 0V (GND)│ Q = 0 Coulombs         │ E = 0 Joules
```

* **Logical '1'**: The capacitor is fully charged to supply voltage ($V_c = V_{DD}$, e.g., $1.2\text{ V}$). The stored charge is $Q_1 = C_s \cdot V_{DD} \approx 30\text{ fF} \times 1.2\text{ V} = \mathbf{36 \text{ femtocoulombs}}$.
* **Logical '0'**: The capacitor is completely discharged to Ground ($V_c = 0\text{ V}$). The stored charge is $Q_0 = \mathbf{0 \text{ coulombs}}$.


## Primitive 2: Destructive Read Operations and Charge-Sharing Physics

Now that we understand the physical architecture of a 1T1C cell, let us examine the core physical phenomenon that governs reading data from DRAM: **Charge Sharing** and **Destructive Read Restoration**.


#### Phase 1: Bit Line Precharge Phase ($t = 0\text{ ns}$)

Before any read or write operation begins, the vertical Bit Line ($BL$) is prepared by a dedicated **Precharge Circuit**.

The Bit Line is a long, heavy metal trace running past hundreds of DRAM cells in a column. Because of its physical length and proximity to other wires, the Bit Line possesses a large **Parasitic Interconnect Capacitance ($C_{BL}$)**:

$$C_{BL} \approx 200 \text{ to } 300\text{ femtofarads } (200 \times 10^{-15}\text{ F})$$

Notice that the Bit Line capacitance $C_{BL}$ is **$8\times \text{to } 12\times$ larger** than the cell storage capacitor $C_s$ ($C_{BL} \approx 10 \cdot C_s$)!

During the Precharge Phase:
* The Word Line is OFF ($V_{WL} = 0\text{ V}$). Transistor $M_1$ is open.
* The Precharge Circuit drives the Bit Line to exactly **half of the supply voltage**:

$$V_{BL,\text{initial}} = V_{\text{pre}} = \frac{V_{DD}}{2}$$

Where:
* $V_{BL,\text{initial}}$ is the initial precharge voltage on the bit line.
* $V_{\text{pre}}$ is the precharge target voltage.
* $V_{DD}$ is the full power supply voltage.

For a $V_{DD} = 1.2\text{ V}$ DRAM system, $V_{BL,\text{initial}} = 0.60\text{ V}$.

Once precharged, the precharge switches open, leaving the Bit Line floating at $V_{DD}/2$ with a stored reference charge:

$$Q_{BL,\text{initial}} = C_{BL} \cdot \left( \frac{V_{DD}}{2} \right)$$

Where:
* $Q_{BL,\text{initial}}$ is the initial electrical charge stored on the bit line parasitic capacitance.
* $C_{BL}$ is the bit line parasitic capacitance.
* $V_{DD}$ is the supply voltage.


### Deriving the Voltage Delta ($\Delta V$) on the Bit Line

How much does the Bit Line voltage shift from its initial precharge level ($V_{DD}/2$) during charge sharing?

The voltage change $\Delta V$ on the Bit Line is:

$$\Delta V = V_{\text{final}} - V_{BL,\text{initial}} = V_{\text{final}} - \frac{V_{DD}}{2}$$

Substituting the expression for $V_{\text{final}}$:

$$\Delta V = \frac{C_s \cdot V_c + C_{BL} \cdot \left( \frac{V_{DD}}{2} \right)}{C_s + C_{BL}} - \frac{V_{DD}}{2} \cdot \frac{C_s + C_{BL}}{C_s + C_{BL}}$$

$$\Delta V = \frac{C_s \cdot V_c - C_s \cdot \left( \frac{V_{DD}}{2} \right)}{C_s + C_{BL}}$$

$$\mathbf{\Delta V = \left( V_c - \frac{V_{DD}}{2} \right) \cdot \frac{C_s}{C_s + C_{BL}}}$$

Where:
* $\Delta V$ is the voltage shift on the Bit Line resulting from charge sharing.
* $V_c$ is the initial voltage on the cell capacitor ($V_{DD}$ or $0\text{ V}$).
* $V_{DD}$ is the supply voltage.
* $\frac{C_s}{C_s + C_{BL}}$ is the **Capacitive Attenuation Ratio** ($\sim \frac{1}{11}$).

Let us evaluate $\Delta V$ for both binary logic states:

#### Case A: Reading a Stored Logical '1' ($V_c = V_{DD}$)

$$\Delta V_1 = \left( V_{DD} - \frac{V_{DD}}{2} \right) \cdot \frac{C_s}{C_s + C_{BL}} = +\frac{V_{DD}}{2} \cdot \frac{C_s}{C_s + C_{BL}}$$

If $V_{DD} = 1.2\text{ V}, C_s = 25\text{ fF}, C_{BL} = 220\text{ fF}$:

$$\Delta V_1 = +0.60\text{ V} \cdot \frac{25\text{ fF}}{25\text{ fF} + 220\text{ fF}} = +0.60\text{ V} \cdot \frac{25}{245} \approx \mathbf{+0.06122 \text{ V}} = \mathbf{+61.22 \text{ mV}}$$

The Bit Line voltage rises slightly from $0.6000\text{ V}$ to **$0.6612\text{ V}$**.

#### Case B: Reading a Stored Logical '0' ($V_c = 0\text{ V}$)

$$\Delta V_0 = \left( 0 - \frac{V_{DD}}{2} \right) \cdot \frac{C_s}{C_s + C_{BL}} = -\frac{V_{DD}}{2} \cdot \frac{C_s}{C_s + C_{BL}}$$

$$\Delta V_0 = -0.60\text{ V} \cdot \frac{25}{245} \approx \mathbf{-0.06122 \text{ V}} = \mathbf{-61.22 \text{ mV}}$$

The Bit Line voltage drops slightly from $0.6000\text{ V}$ to **$0.5388\text{ V}$**.

```text
CHARGE SHARING VOLTAGE DELTA RESULTS

 Initial Precharge Level : V_BL = 0.6000 V (VDD / 2)
 Reading Logical '1'     : V_BL rises by +61.22 mV ──► 0.6612 V
 Reading Logical '0'     : V_BL drops by -61.22 mV ──► 0.5388 V
 (Notice how small the voltage shift is! Only 61.22 millivolts!)
```


### Phase 3: Differential Sense Amplification ($t = 5.0\text{ ns}$)

Because the voltage shift $\Delta V = \pm 61.22\text{ mV}$ is far too small to drive digital CMOS logic gates directly, the Bit Line $BL$ and a reference Bit Line Bar $\overline{BL}$ (held at $V_{DD}/2 = 0.60\text{ V}$) enter a **Cross-Coupled Differential Sense Amplifier**.

```text
CROSS-COUPLED DIFFERENTIAL SENSE AMPLIFIER

 Bit Line BL (0.6612 V) ───────┬───► [ Inverter 1 ] ───┬───► Full VDD (1.2 V)
                               │                       │
                               │   Positive Feedback   │
                               │                       │
 Reference BL_bar (0.6000 V) ──┼───► [ Inverter 2 ] ───┼───► Full GND (0.0 V)
                               └───────────────────────┘
 (Amplifies 61.22 mV difference into full-rail 1.2V vs 0.0V logic signals!)
```

1. The Sense Amplifier is strobed by a clock signal ($SAN / SAP$).
2. The internal positive feedback inverters sense that $V_{BL} (0.6612\text{ V}) > V_{\overline{BL}} (0.6000\text{ V})$.
3. The Sense Amplifier rapidly pulls $BL$ all the way up to **full supply voltage $V_{DD} = 1.20\text{ V}$**, while pulling $\overline{BL}$ down to **Ground $0.0\text{ V}$**.
4. The $61.22\text{-mV}$ analog delta is converted into a clean $1.20\text{-V}$ digital Logical '1'!


## Real-World Silicon Engineering: Charge Leakage and Periodic Refresh Cycles

While the Active Restore Phase repairs destruction caused by read operations, we must now confront the second core limitation of 1T1C DRAM cells: **Spontaneous Charge Leakage**.

### Why DRAM Capacitors Leak Electrons

A 1T1C storage capacitor $C_s$ does not sit in an ideal vacuum. It is fabricated inside a silicon substrate surrounded by doped semiconductor regions. 

Electrons stored on capacitor $C_s$ leak away through three primary physical conduction pathways:

```text
DRAM CAPACITOR CHARGE LEAKAGE PATHWAYS

                  VDD
                   │
               ┌───┴───┐
               │  Cs   │ Storage Node (Vc)
               └───┬───┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼ Pathway 1    ▼ Pathway 2    ▼ Pathway 3
 Subthreshold   PN-Junction    Dielectric
 Leakage        Reverse Leak   Tunneling
 Through M1     to Substrate   Through Insulator
```

1. **Subthreshold Transistor Leakage ($I_{\text{sub}}$)**: Current leaking through the OFF-state access transistor $M_1$ between Drain and Source onto the Bit Line.
2. **PN-Junction Reverse-Bias Leakage ($I_{\text{junc}}$)**: Electrons leaking from the $N^+$-doped Drain diffusion node of $M_1$ into the $P$-type silicon substrate wafer.
3. **Dielectric Tunneling Leakage ($I_{\text{tunnel}}$)**: Quantum mechanical tunneling of electrons directly through the high-$k$ insulating oxide dielectric of capacitor $C_s$.


### How a Refresh Cycle Operates

A **Periodic Refresh Cycle** is essentially a dummy Read operation executed without sending data to the CPU:

1. The DRAM memory controller issues an **AUTO-REFRESH Command (`REF`)**.
2. An internal refresh counter inside the DRAM chip supplies a row address $R_{\text{refresh}}$.
3. The DRAM controller activates Word Line $R_{\text{refresh}}$.
4. Charge sharing occurs, the Sense Amplifiers fire, and the **Active Restore Phase re-charges all capacitors in row $R_{\text{refresh}}$ back to $100\%$ full $V_{DD}$**!
5. The row is closed, and the internal refresh counter increments to $R_{\text{refresh}} + 1$.

#### The Refresh Performance Penalty:
While a DRAM bank is executing a refresh cycle, **it cannot service CPU read or write requests**! The CPU must wait until the refresh cycle completes ($t_{\text{RFC}} \approx 350\text{ ns}$).

As DRAM chip capacities scale to 16Gb, 32Gb, and 64Gb, the number of rows increases dramatically, causing background refresh cycles to consume **up to $15\%$ to $20\%$ of total memory system bandwidth and power**!


### Scenario and Parameters

You are a senior DRAM memory design engineer auditing a $16\text{-Gigabit}$ DDR4 DRAM chip fabricated on a $1\alpha\text{-nm}$ process node.

The DRAM chip operates at a supply voltage $V_{DD} = 1.20\text{ V}$.

```text
16-GIGABIT DDR4 DRAM 1T1C CELL ARCHITECTURE

 Word Line WL ────────► [ NMOS Access M1 ] ──► Storage Capacitor Cs = 25 fF
 Bit Line BL  ────────► Parasitic CBL = 220 fF   Precharge Vpre = 0.60 V
```

#### Physical 1T1C Cell and Array Parameters:
* Storage Capacitance: $C_s = 25.0\text{ fF} = 25.0 \times 10^{-15}\text{ F}$.
* Bit Line Parasitic Capacitance: $C_{BL} = 220.0\text{ fF} = 220.0 \times 10^{-15}\text{ F}$.
* Precharge Voltage: $V_{\text{pre}} = \frac{V_{DD}}{2} = 0.60\text{ V}$.
* Sense Amplifier Minimum Differential Sensitivity: $\Delta V_{\text{min}} = 40.0\text{ mV} = 0.040\text{ V}$.
* Word Line Activation Delay: $t_{\text{activate}} = 2.5\text{ ns}$.
* Sense Amplifier Sensing & Amplification Delay: $t_{\text{sense}} = 3.5\text{ ns}$.
* Capacitor Active Restore Delay: $t_{\text{restore}} = 15.0\text{ ns}$.
* Precharge / Row Close Delay: $t_{\text{precharge}} = 14.0\text{ ns}$.

#### Your Objective

1. Calculate the initial electrical charge $Q_1$ stored in the cell capacitor when holding a Logical '1' ($V_c = 1.20\text{ V}$) versus $Q_0$ when holding a Logical '0' ($V_c = 0.0\text{ V}$).
2. Calculate the charge-sharing equilibrium voltage $V_{\text{final}}$ and the voltage delta $\Delta V_1$ on the Bit Line when reading a Logical '1'.
3. Verify whether $\Delta V_1$ satisfies the Sense Amplifier minimum sensitivity threshold ($\Delta V_{\text{min}} = 40.0\text{ mV}$).
4. Calculate the exact percentage of stored charge lost from capacitor $C_s$ during the charge-sharing phase, proving mathematically why the read operation is destructive.
5. Calculate the total minimum **Row Access Strobe Time ($t_{\text{RAS}}$)** and total **Row Cycle Time ($t_{\text{RC}}$)** required for a complete Read-Restore-Precharge cycle.
6. Verify mathematical, structural, and physical correctness.


#### Step 2: Derive Charge-Sharing Equilibrium Voltage $V_{\text{final}}$ and Delta $\Delta V_1$

Before Word Line activation, the Bit Line $BL$ holds precharge voltage $V_{\text{pre}} = 0.60\text{ V}$.
Initial charge on Bit Line capacitance $C_{BL}$:

$$Q_{BL,\text{initial}} = C_{BL} \cdot V_{\text{pre}} = (220.0 \times 10^{-15}\text{ F}) \times 0.60\text{ V} = 132.0\text{ fC}$$

When Word Line activates, total initial charge $Q_{\text{total}}$ is:

$$Q_{\text{total}} = Q_1 + Q_{BL,\text{initial}} = 30.0\text{ fC} + 132.0\text{ fC} = \mathbf{162.0 \text{ fC}}$$

##### Calculate Final Equilibrium Voltage $V_{\text{final}}$:
Total combined capacitance = $C_s + C_{BL} = 25.0\text{ fF} + 220.0\text{ fF} = 245.0\text{ fF}$.

$$V_{\text{final}} = \frac{Q_{\text{total}}}{C_s + C_{BL}} = \frac{162.0 \times 10^{-15}\text{ C}}{245.0 \times 10^{-15}\text{ F}} \approx \mathbf{0.66122 \text{ Volts}}$$

##### Calculate Bit Line Voltage Delta ($\Delta V_1$):

$$\Delta V_1 = V_{\text{final}} - V_{\text{pre}} = 0.66122\text{ V} - 0.60000\text{ V} = \mathbf{+0.06122 \text{ Volts}} = \mathbf{+61.22 \text{ mV}}$$

Alternatively, using our direct formula:

$$\Delta V_1 = \left( V_{DD} - \frac{V_{DD}}{2} \right) \cdot \frac{C_s}{C_s + C_{BL}} = 0.60\text{ V} \cdot \frac{25.0}{245.0} = 0.60 \times 0.10204 = \mathbf{+61.22 \text{ mV}}$$

The Bit Line voltage shifts upward by **$+61.22\text{ millivolts}$**.


#### Step 4: Calculate Percentage Charge Loss (Proof of Destructive Read)

At the end of charge sharing ($t = 2.5\text{ ns}$), the voltage remaining on capacitor $C_s$ is $V_{\text{final}} = 0.66122\text{ V}$.

Remaining charge $Q_{\text{remaining}}$ on $C_s$:

$$Q_{\text{remaining}} = C_s \cdot V_{\text{final}} = 25.0\text{ fF} \times 0.66122\text{ V} = 16.53\text{ fC}$$

##### Calculate Percentage Charge Lost:

$$\text{Percentage Charge Lost} = \frac{Q_1 - Q_{\text{remaining}}}{Q_1} \times 100\% = \frac{30.0\text{ fC} - 16.53\text{ fC}}{30.0\text{ fC}} \times 100\%$$

$$\text{Percentage Charge Lost} = \frac{13.47}{30.0} \times 100\% = \mathbf{44.9\% \text{ Charge Loss!}}$$

##### Conclusion:
The charge sharing phase **wiped out $44.9\%$ of the cell's stored charge**! 

If the active restore phase were omitted, the cell would be left with only $16.53\text{ fC}$ of charge, causing the stored '1' to degrade into a '0' within milliseconds.


### Sanity Check and Verification

Let us verify our mathematical and physical results against DRAM chip principles:

1. **Capacitive Attenuation Check**:
   * Attenuation factor $\frac{C_s}{C_s + C_{BL}} = \frac{25}{245} \approx 0.10204$.
   * $\Delta V = 0.60\text{ V} \times 0.10204 = 0.06122\text{ V} = 61.22\text{ mV}$. Matches calculation!
2. **Charge Conservation Check**:
   * Initial Charge = $30.0\text{ fC} + 132.0\text{ fC} = 162.0\text{ fC}$.
   * Final Charge = $245\text{ fF} \times 0.66122\text{ V} = 162.0\text{ fC}$.
   * Charge is conserved to 5 decimal places!
3. **Timing Closure Check**:
   * Total Row Cycle Time $t_{\text{RC}} = 35.0\text{ ns}$.
   * Reciprocal maximum row access rate = $\frac{1}{35.0\text{ ns}} \approx 28.57\text{ million row accesses/sec per bank}$.

All 1T1C cell equations, charge conservation models, voltage deltas, charge destruction percentages, and timing parameters evaluate with 100% mathematical, physical, and logical precision.

