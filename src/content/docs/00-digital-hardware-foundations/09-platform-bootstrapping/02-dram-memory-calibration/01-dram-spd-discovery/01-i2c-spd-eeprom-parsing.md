---
title: "01-i2c-spd-eeprom-parsing — I2C Serial Presence Detect (SPD) EEPROM Parsing and Memory Topology Discovery"
---

# 01-i2c-spd-eeprom-parsing — I2C Serial Presence Detect (SPD) EEPROM Parsing and Memory Topology Discovery

## 1. The Blank Memory Controller Blindness

When an integrated central processing unit (CPU) initializes a computer platform, its integrated memory controller is physically connected to motherboard Dual In-line Memory Module (DIMM) expansion slots via hundreds of parallel copper traces. These copper traces carry address lines, data buses, command control signals, and high-speed differential clocks ($CK / CK\#$).

However, the motherboard DIMM slots are completely modular. A user might populate the motherboard with a single $8\text{-Gigabyte}$ unbuffered single-rank DDR4 module, two $32\text{-Gigabyte}$ registered dual-rank DDR5 modules, or leave the slots completely empty!

When the CPU exits reset, its integrated memory controller operates in a state of **total physical blindness regarding memory topology and timing specifications**.

```text
THE BLANK MEMORY CONTROLLER BLINDNESS

 CPU Integrated Memory Controller (Wants to Drive DRAM)
 ┌─────────────────────────────────────────────────────────────┐
 │ Un-Configured Control Registers & PHY Drivers               │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼ (High-Speed DDR Signals)
 ┌─────────────────────────────────────────────────────────────┐
 │ Motherboard DIMM Expansion Slot 0                           │
 │ Status: UNKNOWN CAPACITY, UNKNOWN VOLTAGE, UNKNOWN TIMINGS! │
 └─────────────────────────────────────────────────────────────┘
  (Driving high-speed clocks blindly causes SILICON DESTRUCTION!)
```

Consider the physical disaster that occurs if the integrated memory controller attempts to drive memory clock signals and activation commands blindly without knowing what is plugged into those slots:

1. **Voltage Level Mismatch (Silicon Destruction)**: Different generations and classes of DRAM operate at completely different supply voltages ($V_{DD}$). Standard DDR4 operates at $1.20\text{ V}$, DDR5 operates at $1.10\text{ V}$, and low-power LPDDR5 operates at $0.50\text{ V} / 1.05\text{ V}$. 

   If a memory controller drives $1.20\text{-V}$ electrical signals to an LPDDR5 memory die designed for $0.50\text{ V}$, the microscopic oxide layers inside the transistors suffer immediate dielectric breakdown, permanently destroying the memory chip!
2. **Timing Violation (Data Corruption)**: DRAM physical storage cells consist of microscopic capacitors that require precise time windows to charge and discharge. 
   
   If the memory controller issues a Row-to-Column Delay ($\text{RAS}$-to-$\text{CAS}$ delay, or $t_{\text{RCD}}$) command in $10.0\text{ nanoseconds}$ when the installed DRAM silicon physically requires $13.75\text{ nanoseconds}$ to open a row buffer, the access fails. The memory controller reads un-charged floating voltages, corrupting memory.
3. **Address Line Aliasing (Memory Map Overlap)**: Different DRAM chips feature different bank, row, and column structures (e.g., $16\text{ banks}$ grouped into $4\text{ bank groups}$ versus $32\text{ banks}$ in $8\text{ bank groups}$). 
   
   If the memory controller drives address lines assuming 4 bank groups when the physical module contains 8 bank groups, two completely different virtual addresses will write to the exact same physical storage cell, overwriting critical data buffers.

A memory controller cannot drive high-speed memory clocks or issue commands blindly!

Before the memory controller is allowed to enable its high-speed physical layer (PHY) drivers or issue a single activation command to the DRAM chips, the platform firmware **must discover the exact physical capacity, voltage requirements, bank topology, and nanosecond timing limits of every installed memory module.**

How can an integrated memory controller inspect the physical properties of an un-configured memory module using an ultra-simple, low-overhead communication channel *before* high-speed DRAM clocks and main memory buses are turned on?

To solve this physical discovery problem and eliminate memory controller blindness, computer architectures employ **I2C Serial Presence Detect (SPD) EEPROM Parsing** and **Memory Topology Discovery**.


## 3. Mechanics of I2C/SMBus Communications and JEDEC SPD Parsing

Now that we possess a clear intuitive mental model of crane operators, 2-wire robot arms, and plastic spec sheet tags, let us examine the formal engineering mechanics of **I2C/SMBus Communications** and **Serial Presence Detect (SPD) EEPROM Parsing**.

To read memory metadata before the main memory bus is powered on, platform architectures separate early memory discovery into two distinct layers:
1. **The Physical Serial Transport Layer ($I^2C$ / SMBus Protocol)**: The 2-wire hardware bus used to send read commands to the DIMM.
2. **The Application Metadata Layer (JEDEC SPD Byte Structure)**: The standardized binary table stored inside the EEPROM chip that encodes memory capacity and timing limits.


### The Anatomic Phases of an I2C Frame Transaction

An $I^2C$ read transaction executed by early boot firmware to read a byte from an SPD EEPROM progresses through five sequential protocol phases:

```text
I2C FRAME PROTOCOL TIMING WAVEFORM

 SCL : ──┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌──
         └───┘   └───┘   └───┘   └───┘   └───┘   └───┘   └───┘   └───┘   └───┘
 SDA : ──┐     ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌
         └───┴─┘   └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
         ▲     ◄────── 7-Bit Slave Addr ──────► │R/W│ ACK   ◄──── Data Byte ────►
         │                                       (0) (Low)
   START Condition
```

#### Phase 1: The START Condition
While $SCL$ is held High ($3.3\text{ V}$), the master pulls $SDA$ from High to Low ($3.3\text{ V} \to 0.0\text{ V}$). This unique transition signals to all devices on the bus that a new frame is beginning.

#### Phase 2: 7-Bit Slave Address + Read/Write Bit
The master clocks out 8 bits on $SDA$:
* **Bits [7:1] (7-Bit Slave Address)**: Identifies the target DIMM slot. By JEDEC convention, SPD EEPROMs occupy fixed $I^2C$ slave addresses ranging from `0x50` (`7'b1010_000`) for Slot 0 up to `0x57` (`7'b1010_111`) for Slot 7.
* **Bit 0 (Read/Write Flag)**: $0 = \text{Write}$ (to set the internal byte offset pointer); $1 = \text{Read}$.

#### Phase 3: The Acknowledge (ACK) Bit
On the 9th clock pulse, the master releases $SDA$. The target SPD EEPROM pulls $SDA$ Low ($0\text{ V}$) to prove it is installed in the slot and ready to communicate. If $SDA$ remains High (**NACK**), the slot is empty!

#### Phase 4: Byte Offset and Data Byte Transfer
* The master writes the desired **SPD Byte Offset** (e.g., `0x18` for CAS latency) onto $SDA$.
* The master issues a Repeated START condition, sends the slave address with $R/W = 1$, and reads the $8\text{-bit}$ SPD data byte returned by the EEPROM.

#### Phase 5: The STOP Condition
While $SCL$ is held High ($3.3\text{ V}$), the master releases $SDA$ from Low to High ($0.0\text{ V} \to 3.3\text{ V}$), freeing the bus.


### Calculating Total Channel Memory Topology Capacity

Once firmware has parsed SPD Bytes 4 and 12, it calculates the **Total Module Capacity ($C_{\text{total}}$)** in Gigabytes using the **JEDEC Memory Topology Equation**:

$$\mathbf{C_{\text{total}} = \left( \frac{\text{Density}_{\text{die\_bits}}}{8} \right) \times \left( \frac{\text{Bus\_Width}_{\text{channel}}}{\text{Die\_Width}} \right) \times \text{Ranks}}$$

Where:
* $C_{\text{total}}$ is the total memory capacity of the DIMM in Gigabytes (GB).
* $\text{Density}_{\text{die\_bits}}$ is the individual DRAM chip die capacity in Gigabits (from SPD Byte 4, e.g., $16\text{ Gb}$).
* $\text{Bus\_Width}_{\text{channel}}$ is the primary memory channel data bus width in bits (e.g., $64\text{ bits}$ for standard DDR4/DDR5, or $32\text{ bits}$ per sub-channel in DDR5).
* $\text{Die\_Width}$ is the output data width of an individual DRAM chip (from SPD Byte 12, e.g., $x8 = 8\text{ bits}$).
* $\text{Ranks}$ is the number of physical package ranks on the module (from SPD Byte 12, e.g., $2\text{ Ranks}$).

```text
EXAMPLE CAPACITY COMPUTATION (16 GB DUAL-RANK x8 DIMM)

 Inputs parsed from SPD Bytes:
  * Die Density = 8 Gigabits (1 Gigabyte)
  * Bus Width   = 64 Bits
  * Die Width   = x8 (8 Bits)
  * Ranks       = 2 Ranks

 Calculation:
  C_total = (8 Gb / 8) * (64 Bits / 8 Bits) * 2 Ranks
  C_total = (1 GB) * (8 Chips per Rank) * (2 Ranks)
  C_total = 16 Gigabytes Total Capacity!
```


### 1. The $I^2C$ Bus Lockup Hazard ($SDA$ Stuck Low)

What happens if an $I^2C$ transaction reading an SPD EEPROM is interrupted mid-transfer by a power glitch, a reset event, or an early software exception?

The slave SPD EEPROM was in the middle of driving a logical '0' onto the $SDA$ data line.

When the CPU resets and attempts to start a new $I^2C$ transaction:
* The slave EEPROM is still waiting for the master to complete the previous clock cycle! It continues driving **$SDA = 0\text{ V}$ (Low)**.
* The master $I^2C$ controller looks at $SDA$, sees that $SDA$ is stuck Low, and assumes another master is occupying the bus!
* **The Bus Lockup**: The $I^2C$ controller waits indefinitely for $SDA$ to return to High ($3.3\text{ V}$).
* The memory discovery process freezes, and the entire system hangs during early boot!

```text
THE I2C SDA STUCK LOW BUS LOCKUP

 Master attempts START Condition
                       │
                       ▼
 Reads SDA Line ──► SDA is STUCK LOW (0V) driven by Slave!
                    Master assumes bus is busy -> STALLS FOREVER! (HARD LOCKUP)
```

#### The Hardware / Software Solution: The 9-Clock Bus Recovery Sequence
To recover from an $SDA$ stuck-low bus lockup without rebooting power rails, early boot firmware executes the **9-Clock $I^2C$ Bus Recovery Algorithm**:

```text
9-CLOCK I2C BUS RECOVERY ALGORITHM

 1. Configure SCL and SDA Pins as Software GPIOs.
 2. Check if SDA == 0 (Low).
 3. Loop up to 9 times:
    * Drive SCL Low (0V), wait 5 us.
    * Drive SCL High (3.3V), wait 5 us.
    * Read SDA: If SDA == 1 (High), SLAVE RELEASED BUS! Break loop!
 4. Generate a clean STOP Condition (SDA Low-to-High while SCL High).
 5. Re-assign pins back to Hardware I2C Controller. Resume normal operation!
```

By toggling $SCL$ 9 times manually in software, the master forces the stuck SPD EEPROM to finish its shifted byte, release the $SDA$ line High, and return the bus to the idle state!


### 3. Multi-Slot Address Collisions and $I^2C$ Multiplexers

An enterprise server motherboard might contain 16 or 32 physical DIMM slots.

Because standard $I^2C$ addresses use 7 bits, reserving 32 unique addresses for SPD EEPROMs would exhaust the system's $I^2C$ address space!

To manage multi-slot platforms without address collisions:
1. **Slot Address Pin Hardwiring ($SA_0, SA_1, SA_2$)**: Physical pins on each motherboard slot are hardwired High ($3.3\text{ V}$) or Low ($0.0\text{ V}$), giving each slot a unique 3-bit physical offset added to base address `0x50` (`Slot 0 = 0x50`, `Slot 1 = 0x51`, ..., `Slot 7 = 0x57`).
2. **$I^2C$ Bus Multiplexers (e.g., PCA9548)**: For motherboards with more than 8 slots, the $I^2C$ bus is split across an $I^2C$ Multiplexer chip. Firmware selects Channel 0 on the MUX to read Slots 0–7, and then switches the MUX to Channel 1 to read Slots 8–15!


### Scenario & Parameters

You are a principal memory firmware architect initializing the integrated memory controller for a $3.2\text{-GHz}$ 64-bit server processor ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The motherboard contains **2 memory expansion slots**:
* Slot 0: $I^2C$ Slave Address `0x50` (`7'b1010_000`).
* Slot 1: $I^2C$ Slave Address `0x51` (`7'b1010_001`).

```text
SPD DISCOVERY HARDWARE PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 f_i2c                     │ 400.0 kHz (Fast-Mode) │ I2C SMBus serial clock frequency
 f_dram_target             │ 1,200.0 MHz (2400 MT/s)Target DDR4 DRAM clock frequency
 Bus_Width_channel         │ 64 Bits               │ Primary DDR4 memory channel data bus width
 N_spd_bytes               │ 32 Bytes              │ Number of critical SPD bytes read per slot
 N_i2c_bits_per_byte_read  │ 29 I2C Clock Cycles   │ Total I2C clock pulses required per byte read
```

#### Hardware Status at Power-On:
* Slot 0 contains an installed **DDR4 UDIMM module**.
* Slot 1 is **EMPTY** (unpopulated).

#### Binary Bytes Read from Slot 0 SPD EEPROM (`Address 0x50`):
* **Byte 2 (Key Byte / DRAM Type)** $= \mathbf{\text{0x0C}}$ ($12_{10} \implies \text{DDR4 SDRAM}$).
* **Byte 4 (SDRAM Density & Banks)** $= \mathbf{\text{0x04}}$ ($\text{Bits}[3:0] = 0100_2 \implies 8\text{ Gb die density}$; $\text{Bits}[7:6] = 01_2 \implies 4\text{ Bank Groups}$).
* **Byte 12 (Module Organization)** $= \mathbf{\text{0x09}}$ ($\text{Bits}[5:3] = 001_2 \implies 2\text{ Ranks}$; $\text{Bits}[2:0] = 001_2 \implies x8\text{ Die Width}$).
* **Byte 18 ($t_{\text{CKmin}}$ Base Clock Period)** $= \mathbf{\text{0x0A}}$ ($10_{10} \implies 0.8333\text{ ns}$ minimum cycle time $\implies \text{DDR4-2400}$).
* **Byte 24 ($t_{\text{AAmin}}$ / Minimum $t_{\text{CL}}$)** $= \mathbf{\text{0x6E}}$ ($110_{10}$ in units of $0.125\text{ ns} \implies 110 \times 0.125\text{ ns} = \mathbf{13.75 \text{ ns}}$).
* **Byte 25 ($t_{\text{RCDmin}}$ Minimum RAS-to-CAS)** $= \mathbf{\text{0x6E}}$ ($110_{10} \times 0.125\text{ ns} = \mathbf{13.75 \text{ ns}}$).
* **Byte 26 ($t_{\text{RPmin}}$ Minimum Row Precharge)** $= \mathbf{\text{0x6E}}$ ($110_{10} \times 0.125\text{ ns} = \mathbf{13.75 \text{ ns}}$).


### Step-by-Step Derivation

#### Step 1: Calculate $I^2C$ Scan Time for Populated Slot 0 ($t_{\text{scan\_slot0}}$)

The $I^2C$ bus operates at $f_{\text{i2c}} = 400.0\text{ kHz} = 400,000\text{ Hz}$.

The $I^2C$ clock period $T_{\text{i2c}}$ is:

$$T_{\text{i2c}} = \frac{1}{400,000\text{ Hz}} = 2.50 \times 10^{-6}\text{ seconds} = \mathbf{2,500.0 \text{ nanoseconds}} \quad (2.50\ \mu\text{s})$$

Reading a single byte via $I^2C$ random read protocol requires $N_{\text{i2c\_bits}} = 29\text{ clock cycles}$:
* START (1) + Slave Addr (7) + Write Flag (1) + ACK (1) + Byte Offset (8) + ACK (1) + RepSTART (1) + Slave Addr (7) + Read Flag (1) + ACK (1) + Data Byte (8) + NACK (1) + STOP (1) $= 29\text{ I2C Cycles}$.

##### 1. Physical Latency per Byte Read ($t_{\text{byte}}$):

$$t_{\text{byte}} = 29 \text{ cycles} \times 2,500.0\text{ ns/cycle} = \mathbf{72,500.0 \text{ nanoseconds}} \quad (72.50\ \mu\text{s})$$

##### 2. Total Time to Read 32 Bytes from Slot 0 ($t_{\text{scan\_slot0}}$):

$$t_{\text{scan\_slot0}} = 32 \text{ bytes} \times 72,500.0\text{ ns/byte} = \mathbf{2,320,000.0 \text{ nanoseconds}} = \mathbf{2.320 \text{ milliseconds}}$$

In CPU clock cycles at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$C_{\text{scan\_slot0}} = \frac{2,320,000.0\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{7,424,000 \text{ CPU Clock Cycles}}$$

Scanning 32 bytes from populated Slot 0 takes **$2.320\text{ milliseconds}$ ($7,424,000\text{ CPU clock cycles}$)**.


#### Step 3: Calculate DIMM Memory Capacity ($C_{\text{total}}$) for Slot 0

From SPD Bytes:
* Die Density ($\text{Density}_{\text{die\_bits}}$) $= 8\text{ Gb}$ (Byte 4 $= \text{0x04}$).
* Channel Bus Width ($\text{Bus\_Width}_{\text{channel}}$) $= 64\text{ bits}$.
* Chip Data Width ($\text{Die\_Width}$) $= x8 = 8\text{ bits}$ (Byte 12 $= \text{0x09}$).
* Ranks $= 2\text{ Ranks}$ (Byte 12 $= \text{0x09}$).

Using the JEDEC Capacity Equation:

$$C_{\text{total}} = \left( \frac{\text{Density}_{\text{die\_bits}}}{8} \right) \times \left( \frac{\text{Bus\_Width}_{\text{channel}}}{\text{Die\_Width}} \right) \times \text{Ranks}$$

$$C_{\text{total}} = \left( \frac{8\text{ Gb}}{8} \right) \times \left( \frac{64\text{ bits}}{8\text{ bits}} \right) \times 2 = 1\text{ GB} \times 8\text{ chips/rank} \times 2\text{ ranks}$$

$$\mathbf{C_{\text{total}} = 16 \text{ Gigabytes (16 GB)}}$$

The DIMM installed in Slot 0 is a **$16\text{-Gigabyte}$ Dual-Rank x8 DDR4 UDIMM**!


#### Step 5: Calculate I2C Speedup Factor ($400\text{ kHz}$ vs $100\text{ kHz}$)

Under $100\text{-kHz}$ Standard-Mode $I^2C$ ($T_{\text{i2c\_100k}} = 10.0\ \mu\text{s}$):

$$t_{\text{scan\_100k}} = 32 \text{ bytes} \times (29 \times 10.0\ \mu\text{s}) = 32 \times 290.0\ \mu\text{s} = \mathbf{9.280 \text{ milliseconds}}$$

$$\text{Speedup Factor} = \frac{t_{\text{scan\_100k}}}{t_{\text{scan\_slot0}}} = \frac{9.280\text{ ms}}{2.320\text{ ms}} = \mathbf{4.000\times \text{ Performance Speedup!}}$$

```text
SPD DISCOVERY PERFORMANCE AND TIMING SUMMARY

 Parameter Metric             │ Calculated Engineering Value
──────────────────────────────┼─────────────────────────────────────────────
 Slot 0 Modules Discovered    │ 16 GB Dual-Rank x8 DDR4-2400 UDIMM
 Memory Timing Matrix         │ CL17 - tRCD17 - tRP17 (At 1200 MHz Clock)
 Slot 0 I2C Scan Time (32B)   │ 2.320 Milliseconds (7,424,000 CPU Cycles)
 Slot 1 Empty Scan Time       │ 0.025 Milliseconds (80,000 CPU Cycles)
 I2C 400 kHz Speedup vs 100 kHz│ 4.000x Faster Discovery Time
```

##### Engineering Conclusion:
By parsing 32 bytes from the SPD EEPROM over a $400\text{-kHz } I^2C$ bus in $2.320\text{ ms}$, the platform firmware safely eliminated memory controller blindness, discovered a $16\text{-GB}$ dual-rank DDR4 module, and programmed the exact $17-17-17$ timing matrix required to operate the DRAM silicon at full $2400\text{ MT/s}$ performance without risking data corruption!


## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Serial Presence Detect (SPD)**: A JEDEC-standard non-volatile EEPROM chip mounted on a memory module (DIMM) that stores a structured binary table encoding module capacity, rank organization, operating voltage limits, and nanosecond DRAM timing parameters ($t_{\text{CKmin}}, t_{\text{AAmin}}, t_{\text{RCDmin}}, t_{\text{RPmin}}$).
* **I2C Memory Discovery**: The 2-wire open-drain serial bus protocol ($SCL / SDA$) used by early platform firmware to query SPD EEPROMs at fixed slave addresses (`0x50` to `0x57`), enabling the memory controller to discover installed RAM topology and synthesize physical timing matrices prior to enabling DRAM PHY drivers.