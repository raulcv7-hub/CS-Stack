content/00-digital-hardware-foundations/09-platform-bootstrapping/lessons/02-dram-memory-calibration/02-dram-phy-training/01-dram-write-leveling-calibration.md
# 01-dram-write-leveling-calibration — DRAM Write Leveling Calibration and Fly-By Topology Signal Alignment

## 1. The Fly-By Trace Skew Barrier

In high-performance computer architecture, modern main system memory subsystems—specifically Double Data Rate (DDR) memory architectures such as DDR3, DDR4, and DDR5—operate at multi-gigahertz transfer rates. On a DDR5 memory channel operating at a data rate of $4,800\text{ MT/s}$ (Megatransfers per second), the clock frequency driving the memory bus is $2.4\text{ GHz}$. At this speed, a single memory clock period lasts a mere $416.67\text{ picoseconds}$, and a single data bit window (Unit Interval, or $\text{UI}$) spans an ultra-short duration of just $208.33\text{ picoseconds}$.

To transfer write data reliably at these multi-gigahertz speeds from the integrated memory controller (IMC) inside the processor to physical Dynamic Random-Access Memory (DRAM) chips mounted on a memory module (DIMM), the physical electrical signals must maintain pristine signal integrity.

In older, lower-frequency memory architectures (such as DDR2 operating below $800\text{ MT/s}$), memory modules routed clock, address, and command signals using a **T-Topology (Balanced Tree Topology)** layout. 

In a T-topology layout, the physical copper trace coming from the memory controller splits into a balanced tree of branching wires, reaching every DRAM chip on the circuit board at approximately the exact same physical distance and time.

```text
T-TOPOLOGY SIGNAL ROUTING (LEGACY DDR2)

 Memory Controller Clock Output
               │
               ▼
        ┌──────┴──────┐  (Branching T-Junctions)
        │             │
     ┌──┴──┐       ┌──┴──┐
     ▼     ▼       ▼     ▼
   Chip0 Chip1   Chip2 Chip3
 (Equal trace lengths, BUT severe signal reflections at junctions!)
```

However, as memory speeds accelerated past $1.0\text{ GHz}$, the T-topology layout hit an insurmountable physical wall: **Impedance Discontinuity Signal Reflections**.

When a high-frequency electrical pulse encounters a physical T-junction split on a circuit board, the sudden impedance change causes a portion of the electrical wave to reflect backward down the copper trace. 

At multi-gigahertz frequencies, these reflected waves collide with incoming data pulses, creating severe electromagnetic interference, voltage ringing, and complete collapse of the Data Eye window. T-topology could not scale to modern memory speeds.

To eliminate T-junction reflections and preserve high-frequency signal integrity, JEDEC memory standards abandoned T-topology and adopted a **Fly-By Topology (Daisy-Chain Topology)** for all DDR3, DDR4, and DDR5 memory modules.

In a Fly-By topology, a single, continuous copper trace originates at the memory controller and snakes sequentially from the first DRAM chip to the last DRAM chip on the module in a single line, ending at a termination resistor ($R_{\text{TT}}$).

```text
FLY-BY TOPOLOGY SIGNAL ROUTING (DDR3 / DDR4 / DDR5)

 Memory Controller
 Clock / Addr / Cmd
 ──────┬────────────► Chip 0 ───► Chip 1 ───► Chip 2 ───► Chip 3 ───► R_TT
       │               ▲          ▲          ▲          ▲             (Term)
       │               │          │          │          │
 Point-to-Point DQS:  Byte 0     Byte 1     Byte 2     Byte 3
 (Clock arrives at Chip 3 HUNDREDS OF PICOSECONDS LATER than Chip 0!)
```

While Fly-By topology completely eliminates T-junction signal reflections, it introduces a severe physical timing problem: **Flight-Time Propagation Delay Skew**.

Look at the physical geometry of the Fly-By trace:
* The clock ($CK / CK\#$), address ($ADDR$), and command ($CMD$) lines travel sequentially along the fly-by trace, reaching Chip 0 first, Chip 1 second, Chip 2 third, and Chip 3 last.
* Meanwhile, the data lines ($DQ$) and data strobe lines ($DQS / DQS\#$) are routed in **direct, point-to-point traces** from the memory controller to each individual byte-lane DRAM chip!

Because Chip 3 sits several centimeters farther down the fly-by copper trace than Chip 0, the clock signal ($CK$) arrives at Chip 3 **hundreds of picoseconds LATER** than it arrives at Chip 0!

Now, observe the physical catastrophe that occurs during a memory write operation if the memory controller dispatches write data ($DQ$) and write strobes ($DQS$) to all byte lanes simultaneously:

1. The memory controller outputs $DQS$ and $DQ$ for all byte lanes at time $t = 0$.
2. On Chip 0 (located close to the controller), $CK$ arrives early. The write strobe $DQS$ and clock $CK$ arrive in phase, and Chip 0 captures the write data correctly.
3. On Chip 3 (located at the far end of the module), the point-to-point $DQS$ strobe arrives at time $t = 0.5\text{ ns}$. But because of the long fly-by trace, **the clock signal $CK$ does not arrive at Chip 3 until $t = 0.9\text{ ns}$**!
4. **The Write Timing Failure**: Chip 3 receives the write strobe $DQS$ long before the clock $CK$ arrives! The internal logic inside Chip 3 fails to synchronize the write payload. The data bits are lost, corrupted, or written into the wrong memory cells!

```text
WRITE TIMING FAILURE AT FAR-END DRAM CHIP

 Chip 0 (Near End) : CK Arrival ──┐  (In Phase! Data captured correctly!)
                     DQS Arrival ─┘

 Chip 3 (Far End)  : DQS Arrival ──► Arrives at t = 0.5 ns!
                     CK Arrival  ──────────────► Arrives at t = 0.9 ns! (SKEWED!)
                     (DQS arrives 400 ps TOO EARLY! Write Data Corrupted!)
```

We face a fundamental physical hardware problem:
* We *must* use Fly-By topology to prevent electrical signal reflections at multi-gigahertz speeds.
* But Fly-By topology causes the clock signal $CK$ to arrive at different DRAM chips at different physical times along the board.

How can an integrated memory controller's physical layer (PHY) dynamically measure the exact flight-time delay to every individual DRAM chip on a memory module, and delay the write strobe ($DQS$) for each byte lane in picosecond steps so that $DQS$ and $CK$ arrive at the exact same picosecond at every single chip?

To eliminate fly-by trace skew and align write strobes with memory clocks across all byte lanes, platform firmware and memory controller PHYs employ **DRAM Write Leveling Calibration**.

---

## 2. The Relay Sprinters and the Staggered Starter Pistol

To build an intuitive, crystal-clear mental model of Fly-By trace skew, clock-to-strobe alignment, delay-locked loops (DLLs), and write leveling feedback loops before inspecting silicon timing waveforms and register bitfields, let us consider an everyday analogy: **The Relay Track Race on a Curved Track**.

Imagine a track coach (**The Integrated Memory Controller PHY**) standing at the starting area, preparing to signal 8 individual relay sprinters (**8 DRAM Silicon Chips on a Memory Module**).

```text
THE RELAY TRACK RACE ANALOGY

 Track Coach (Memory Controller PHY)          Curved Running Track (Fly-By Trace)
 ┌───────────────────────────┐                ┌───────────────────────────┐
 │ Holds Starter Pistol (CK) │                │ Sprinter 0 at 10m Mark    │
 │ Fires Sound Wave          │                │ Sprinter 7 at 80m Mark    │
 └─────────────┬─────────────┘                └─────────────▲─────────────┘
               │                                            │
               ▼ Sound Wave Travels Down Curved Track       │
 ┌──────────────────────────────────────────────────────────┴─────────────┐
 │ Assistant Coaches (DQS Drivers) Throw Batons (DQ) to Sprinters!        │
 └────────────────────────────────────────────────────────────────────────┘
```

The 8 sprinters stand at different positions along a long, curved running track (**The Fly-By Copper Trace**):
* Sprinter 0 stands at the 10-meter mark (Chip 0, close to the controller).
* Sprinter 3 stands at the 40-meter mark.
* Sprinter 7 stands at the 80-meter mark (Chip 7, at the far end of the trace).

Each sprinter needs to catch a baton (**Write Data $DQ$**) thrown by an assistant coach (**A Byte-Lane $DQS$ Strobe Driver**) standing right next to them.

The head coach fires a starter pistol (**The Differential Clock Signal $CK$**). The sound wave travels down the track at 340 meters per second (**Flight-Time Delay along the Copper Trace**):
* The sound wave reaches Sprinter 0 at 10 meters in **$0.03\text{ seconds}$**.
* The sound wave reaches Sprinter 7 at 80 meters in **$0.24\text{ seconds}$**!

Now, consider what happens if all 8 assistant coaches throw their batons ($DQS$) to the sprinters at the exact same instant ($t = 0\text{ seconds}$) without adjusting for the sound wave delay:

1. Assistant Coach 0 throws the baton at $t = 0$. Sprinter 0 catches the baton right as the pistol sound wave arrives at $t = 0.03\text{s}$. Sprinter 0 starts running successfully!
2. Assistant Coach 7 throws the baton at $t = 0$. Sprinter 7 catches the baton at $t = 0.01\text{s}$.
3. **The Failure**: Sprinter 7 is holding the baton at $t = 0.01\text{s}$, but the starter pistol sound wave does **not** reach Sprinter 7 until $t = 0.24\text{s}$! 

Sprinter 7 gets confused, drops the baton on the ground, and fails the race (**Write Data Corruption**)!

---

### The Staggered Throw Calibration Protocol (Write Leveling)

To fix this timing failure, the head coach implements **The Staggered Throw Calibration Protocol (Write Leveling)** before the real race begins:

The head coach puts all 8 sprinters into a **Listening Test Mode (Write Leveling Calibration Mode)**. 

Each sprinter holds an electronic buzzer connected back to the head coach's scoreboard (**The $DQ$ Data Feedback Line**).

The sprinter's rule in test mode is simple:
> *"When you hear the starter pistol sound wave ($CK$), look at your hands. If the assistant coach's baton ($DQS$) has ALREADY arrived, press your buzzer to High (1)! If the baton has NOT arrived yet, leave your buzzer at Low (0)!"*

Now, watch how the head coach calibrates Assistant Coach 7 (standing at the 80-meter mark):

```text
CALIBRATING ASSISTANT COACH 7 (WRITE LEVELING SWEEP)

 Attempt 1: Throw baton at t = 0.05s ──► Pistol sound arrives at t = 0.24s
            Sprinter 7 checks hands: Baton IS there!
            Sprinter 7 presses buzzer: High (1)!
            Head Coach says: "You threw TOO EARLY! Delay your throw!"

 Attempt 2: Throw baton at t = 0.20s ──► Pistol sound arrives at t = 0.24s
            Sprinter 7 checks hands: Baton IS there!
            Buzzer: High (1)! -> "Still too early!"

 Attempt 3: Throw baton at t = 0.25s ──► Pistol sound arrives at t = 0.24s
            Pistol sound arrives FIRST!
            Sprinter 7 checks hands: Baton NOT there yet!
            Buzzer flips to LOW (0)!
```

Trace the calibration steps:
1. **Attempt 1**: Assistant Coach 7 throws the baton early at $t = 0.05\text{s}$. The pistol sound wave arrives at $t = 0.24\text{s}$. Sprinter 7 sees the baton is already in their hands, so they press the buzzer: **High (`1`)**! 
   
   The head coach sees `1` on the scoreboard and thinks: *"Assistant Coach 7 threw the baton too early! Increase the delay on Assistant Coach 7's arm!"*
2. **Attempt 2**: The head coach adds a delay line. Assistant Coach 7 throws the baton at $t = 0.20\text{s}$. The sound wave arrives at $t = 0.24\text{s}$. The baton is still in Sprinter 7's hands first. Buzzer: **High (`1`)**! 
   
   The head coach increases the delay further.
3. **Attempt 3**: The head coach adds more delay. Assistant Coach 7 throws the baton at $t = 0.25\text{s}$. 
   
   The starter pistol sound wave arrives at $t = 0.24\text{s}$ **BEFORE** the baton arrives! 

   Sprinter 7 looks at their hands on the sound wave: the baton is **not** there yet! Sprinter 7's buzzer flips to **Low (`0`)**!
4. **THE EDGE DETECTED!**: The head coach sees the scoreboard flip from `1` to `0`! 
   
   The head coach knows that the transition boundary between `1` and `0` is the **EXACT MILLISECOND** where the baton and the starter pistol sound wave arrive together!

The head coach records that exact delay setting ($0.24\text{ seconds}$) into Assistant Coach 7's memory sheet (**The PHY Write Leveling Delay Register**)!

When the real race begins, Assistant Coach 0 throws at $0.03\text{s}$, Assistant Coach 3 throws at $0.12\text{s}$, and Assistant Coach 7 throws at $0.24\text{s}$. 

Every sprinter catches their baton at the **exact same millisecond** that the starter pistol sound wave reaches their ears!

This staggered throw calibration is the exact physical analogue of **DRAM Write Leveling Calibration**:
* The head coach is the **Integrated Memory Controller PHY**.
* The 8 sprinters are the **Physical DRAM Silicon Chips (Chip 0 to Chip 7)**.
* The starter pistol sound wave is the **Differential Memory Clock ($CK / CK\#$)**.
* The batons are the **Write Data Strobes ($DQS / DQS\#$)** and **Write Data ($DQ$)**.
* The curved running track is the **Fly-By Topology Copper Trace**.
* The electronic buzzer is the **DRAM Sampling Flip-Flop driving the $DQ$ Feedback Line**.
* Staggered throw delays are **Programmable Delay-Locked Loop (DLL) Taps on $DQS$ Lines**.

---

## 3. Formal Mechanics of Fly-By Topology and Write Leveling Calibration

Now that we possess an intuitive mental model of relay sprinters and staggered baton throws, let us examine the formal, rigorous engineering mechanics of **Fly-By Topology** and **Write Leveling Calibration**.

---

### Fly-By Topology vs. T-Topology Signal Physics

To understand why Write Leveling is mandatory in modern memory systems, we must analyze the signal propagation physics of Fly-By PCB trace routing.

```text
TOPOLOGY COMPARISON: T-TOPOLOGY VS. FLY-BY TOPOLOGY

 1. T-Topology (Legacy DDR2):
 Controller ──► [ Split Junction ] ──┬──► Chip 0 (Trace Length L)
                                     └──► Chip 1 (Trace Length L)
 (Equal trace lengths to all chips, BUT stub reflections cap speed at < 800 MT/s!)

 2. Fly-By Topology (DDR3 / DDR4 / DDR5):
 Controller ─────────────────► Chip 0 ───► Chip 1 ───► Chip 2 ───► R_TT
 (Single continuous daisy-chain with termination resistor R_TT. Zero stub reflections!
  BUT Clock arrival time t_CK increases linearly for each chip down the line!)
```

In Fly-By topology, clock ($CK/CK\#$), address ($ADDR$), and command ($CMD$) signals travel along a single continuous transmission line terminated by a resistor $R_{\text{TT}}$ connected to supply voltage.

The physical signal propagation delay $t_{\text{prop}}$ along a copper motherboard trace is governed by the dielectric constant ($\epsilon_r$) of the surrounding circuit board material (typically FR-4 fiberglass):

$$v_{\text{prop}} = \frac{c}{\sqrt{\epsilon_r}}$$

$$t_{\text{prop}} = \frac{\Delta L}{v_{\text{prop}}}$$

Where:
* $v_{\text{prop}}$ is the signal propagation velocity in the PCB copper trace (typically $150.0\text{ mm/ns}$, or $6.667\text{ ps/mm}$).
* $c$ is the speed of light in a vacuum ($3.0 \times 10^8\text{ m/s}$).
* $\epsilon_r$ is the relative dielectric constant of the PCB substrate ($\epsilon_r \approx 4.0 \text{ to } 4.5$ for FR-4).
* $\Delta L$ is the physical trace length in millimeters.

For a memory module where the fly-by clock trace spans $120.0\text{ mm}$ from Chip 0 to Chip 7:

$$\Delta t_{\text{skew}} = 120.0\text{ mm} \times 6.667\frac{\text{ps}}{\text{mm}} = \mathbf{800.0 \text{ picoseconds}}$$

Look at that physical skew: **$800.0\text{ picoseconds}$**!

At DDR5-4800 data rates ($T_{\text{dram}} = 416.67\text{ ps}$ clock period), an $800\text{-ps}$ trace skew represents **almost TWO FULL CLOCK CYCLES of delay** between Chip 0 and Chip 7! 

Without write leveling, attempting to write data across this module would result in $100\%$ data corruption.

---

### The Write Leveling Hardware Handshake Protocol

To compensate for this $800\text{-ps}$ fly-by clock skew, JEDEC memory specifications define a specialized hardware calibration mode: **Write Leveling Mode**.

The goal of Write Leveling is to adjust the programmable **Delay-Locked Loop (DLL)** time delay added to the $DQS$ write strobe line for each byte lane until the rising edge of $DQS$ aligns perfectly with the rising edge of $CK$ at the physical input pins of every DRAM chip!

$$\text{Calibration Goal: } \quad \mathbf{t_{\text{DQS\_arrival\_at\_chip\_k}} == t_{\text{CK\_arrival\_at\_chip\_k}}}$$

```text
WRITE LEVELING HARDWARE HANDSHAKE DATAPATH

 Memory Controller PHY                                   DRAM Silicon Chip k
 ┌───────────────────────────┐  DQS Strobe (Delayed)    ┌──────────────────┐
 │ Programmable DLL Line     ├─────────────────────────►│ Sampler Flip-Flop│
 │ (Adds delay tap t_delay)  │                          │ D = CK Signal    │
 ├───────────────────────────┤  Clock CK (Fly-By)       │ CLK = DQS Strobe │
 │ Clock Generator (CK)      ├─────────────────────────►│                  │
 ├───────────────────────────┤                          └────────┬─────────┘
 │ Feedback Evaluator        │  DQ Data Feedback Line            │
 │ (Reads DQ0..DQ7 state)    │◄──────────────────────────────────┘
 └───────────────────────────┘  (DRAM drives DQ = CK state!)
```

---

#### Step-by-Step Hardware Calibration Execution

Let us trace the complete step-by-step hardware execution of the Write Leveling Calibration algorithm:

#### Step 1: Entering Write Leveling Mode (MRS Command)
The memory controller issues a **Mode Register Set (MRS)** command to the DRAM chips across the command bus:
* For DDR4: Sets Bit 7 of Mode Register 1 ($\text{MR1}[7] = 1$).
* For DDR5: Sets Bit 1 of Mode Register 2 ($\text{MR2}[1] = 1$).

Upon receiving this command, the DRAM chips enter **Write Leveling Mode**:
1. The DRAM chip's internal $DQ$ output drivers are disabled from driving normal memory data.
2. The DRAM chip connects its physical $CK$ clock input pin to the $D$ input of an internal sampling flip-flop.
3. The DRAM chip connects its incoming $DQS$ write strobe pin to the $CLK$ clock input of that same sampling flip-flop!
4. The Q output of the sampling flip-flop is routed directly out onto the $DQ_0$ data feedback line back to the memory controller!

#### Step 2: Driving Continuous Reference Clocks
The memory controller PHY drives continuous, stable differential clock pulses ($CK / CK\#$) across the fly-by trace. 

Because of the fly-by layout, $CK$ arrives at each DRAM chip at its specific flight-time delay $t_{\text{CK\_flight\_k}}$.

#### Step 3: Sweeping the $DQS$ Delay Line (DLL Taps)
The memory controller PHY begins a calibration sweep for Byte Lane $k$:
1. The PHY initializes its $DQS$ Delay-Locked Loop (DLL) register to zero delay ($\text{DLL}_{\text{tap}} = 0$).
2. The PHY dispatches a $DQS$ strobe pulse ($DQS / DQS\#$) down the point-to-point trace for Byte Lane $k$.
3. When the $DQS$ pulse arrives at DRAM Chip $k$, the chip's internal sampling flip-flop samples the instantaneous voltage state of the continuous $CK$ clock signal:

$$\text{Sampled } DQ \text{ State} = \begin{cases} 0 & \text{if } t_{\text{DQS}} < t_{\text{CK\_rising}} \quad (CK \text{ is Low when } DQS \text{ arrives}) \\ 1 & \text{if } t_{\text{DQS}} \ge t_{\text{CK\_rising}} \quad (CK \text{ is High when } DQS \text{ arrives}) \end{cases}$$

```text
DQS DELAY SWEEP WAVEFORMS (FINDING THE RISING EDGE)

 Clock CK at Chip k : 0000000000111111111100000000001111111111
                               ▲ (Rising Edge of CK at Chip k)

 Attempt 1 (Tap = 0):  0001000000000000000000000000000000000000
                       (DQS arrives while CK is Low -> DRAM outputs DQ = 0)

 Attempt 2 (Tap = 10): 0000000100000000000000000000000000000000
                       (DQS arrives while CK is Low -> DRAM outputs DQ = 0)

 Attempt 3 (Tap = 24): 0000000000100000000000000000000000000000
                       (DQS arrives EXACTLY as CK rises -> DRAM outputs DQ = 1!)
                       (TRANSITION DETECTED! Lock TAP = 24!)
```

4. **Reading Feedback**: The memory controller PHY reads the $DQ_0$ feedback line driven by DRAM Chip $k$:
   * If $DQ_0 == 0$, the $DQS$ strobe is arriving too early (before $CK$ rises).
   * The PHY increments the DLL delay register ($\text{DLL}_{\text{tap}} \Leftarrow \text{DLL}_{\text{tap}} + 1$), adding a few picoseconds of delay to $DQS$.
5. **Detecting the Transition Boundary**: The PHY repeats the $DQS$ pulse. 
   
   The exact instant the PHY detects the $DQ_0$ line flip from **$0 \to 1$**, the rising edge of $DQS$ has aligned perfectly with the rising edge of $CK$ at DRAM Chip $k$!

#### Step 4: Storing Calibrated Delay Values
The PHY captures the final $\text{DLL}_{\text{tap}}$ value and programs it into the **Write Leveling Delay Register** for Byte Lane $k$.

The PHY repeats this calibration sweep independently for all byte lanes ($k = 0 \dots 7$).

#### Step 5: Exiting Write Leveling Mode
The memory controller issues an MRS command clearing the Write Leveling bit ($\text{MR1}[7] = 0$). The DRAM chips reconnect their internal $DQ$ drivers back to the standard write data pipeline.

Calibration is complete!

---

## 4. Real-World Silicon Engineering: Temperature Drift, Jitter, and Coarse/Fine Taps

In commercial high-speed memory systems engineering, implementing Write Leveling requires managing physical semiconductor edge cases that can disrupt signal calibration if not accounted for by firmware.

---

### 1. Thermal Expansion and Dielectric Drift

What happens to a calibrated memory link after a computer has been running an intensive AI training or 3D rendering workload for two hours?

The temperature of the motherboard circuit board rises from a room temperature of $25^\circ\text{C}$ up to an operating temperature of $85^\circ\text{C}$.

As temperature increases:
* The relative dielectric constant ($\epsilon_r$) of the fiberglass PCB material shifts slightly.
* The physical signal propagation velocity $v_{\text{prop}}$ decreases.
* The flight-time propagation delay $t_{\text{prop}}$ along the fly-by copper trace **lengthens by several picoseconds**!

```text
TEMPERATURE DRIFT TIMING SHIFT

 Calibrated at 25°C : DQS and CK arrive in PERFECT ALIGNMENT (0 ps Skew).
 Running at 85°C    : Fly-by trace delay lengthens -> CK delayed by 15 ps!
                      DQS arrives 15 ps EARLY relative to CK!
                      (If skew exceeds t_DQSS window -> Write Data Corrupted!)
```

If the physical $CK$-to-$DQS$ skew shifts by more than the JEDEC allowable window (**$\text{t}_{\text{DQSS}}$ specification window: $\pm 0.25 \times t_{\text{CK}}$**), write operations will fail.

#### Hardware Solution: Periodic Re-Leveling and Thermal Drift Tracking
To maintain signal alignment across changing temperatures:
* Modern DDR5 memory controllers incorporate **Periodic Write Leveling**.
* During brief idle intervals (such as during DRAM refresh cycles), the PHY re-issues $DQS$ test pulses to monitor $DQ$ feedback.
* If thermal drift has shifted the transition edge by 1 or 2 DLL taps, the PHY updates its delay registers dynamically in the background without interrupting software execution!

---

### 2. Jitter Zones and Majority-Vote Lock Filters

When the $DQS$ strobe pulse is delayed so that its rising edge lands **at the exact instantaneous transition point** of the $CK$ clock signal, physical voltage noise and high-frequency clock jitter cause the DRAM sampler flip-flop to produce unstable outputs.

Instead of a clean $0 \to 1$ transition, the $DQ$ feedback line may flicker erratically across consecutive test pulses:

$$\text{Feedback Stream near Edge: } \quad 0 \longrightarrow 0 \longrightarrow 1 \longrightarrow 0 \longrightarrow 1 \longrightarrow 1 \longrightarrow 1$$

If a naive PHY algorithm locks onto the first $1$ it sees, it may lock onto a false noise spike, setting the $DQS$ delay 10 picoseconds too early!

#### Hardware Solution: Majority-Vote Filter (Lock Verification)
To filter out jitter noise, modern PHY calibration engines use a **Majority-Vote Lock Filter**:

```text
MAJORITY-VOTE FILTER STATE MACHINE

 Tap N: Read DQ 3 times -> [ 0, 0, 1 ] -> Majority = 0 (Keep Sweeping!)
 Tap N+1: Read DQ 3 times -> [ 0, 1, 0 ] -> Majority = 0 (Keep Sweeping!)
 Tap N+2: Read Read DQ 3 times -> [ 1, 1, 1 ] -> Majority = 1 (VALID LOCK CONFIRMED!)
```

The PHY requires $DQ$ to return **$N$ consecutive $1$s** (e.g., 4 consecutive $1$s) before declaring that the true rising edge boundary has been achieved!

---

### 3. Coarse vs. Fine Delay Taps

A high-speed PHY Delay-Locked Loop (DLL) does not use a single monolithic delay line. 

To cover both long physical trace delays ($> 1,000\text{ ps}$) and sub-picosecond fine tuning, the PHY divides its delay registers into two stages:

1. **Coarse Delay Taps**: Adds integer multiples of full or half memory clock cycles ($1\text{ UI} \text{ or } \frac{1}{2}\text{ UI}$, e.g., $208.33\text{ ps}$ steps).
2. **Fine Delay Taps**: Adds microscopic sub-cycle delay increments driven by analog delay lines (e.g., $64\text{ fine taps per UI} \implies 3.255\text{ ps}$ per fine tap!).

The Write Leveling algorithm first sweeps Coarse Taps to align $DQS$ within the correct clock cycle window, and then sweeps Fine Taps to achieve sub-picosecond edge alignment!

---

## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of Fly-By topology trace skew, signal propagation velocity equations, 2-stage (Coarse/Fine) DLL tap calculations, and Write Leveling calibration logic, let us walk through a complete, step-by-step quantitative engineering calculation.

---

### Scenario & Parameters

You are a principal physical layer (PHY) hardware architect calibrating the memory subsystem for a $3.2\text{-GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor's integrated memory controller drives an unbuffered **DDR5-4800 memory module (DIMM)** operating at a target memory clock frequency:

$$f_{\text{dram}} = 2,400.0\text{ MHz} = 2.4 \times 10^9\text{ Hz} \quad (4,800\text{ MT/s Data Rate})$$

The memory clock period $T_{\text{dram}}$ is:

$$T_{\text{dram}} = \frac{1}{2.4 \times 10^9\text{ Hz}} = 0.416667\text{ nanoseconds} = 416.667\text{ picoseconds}$$

One Unit Interval ($\text{UI}$ — half clock period) is:

$$1\text{ UI} = \frac{T_{\text{dram}}}{2} = \frac{416.667\text{ ps}}{2} = \mathbf{208.333 \text{ picoseconds}}$$

```text
HARDWARE WRITE LEVELING CALIBRATION PARAMETERS

 Parameter Symbol          │ Value                 │ Description
───────────────────────────┼───────────────────────┼─────────────────────────────────────────────
 f_dram                    │ 2,400.0 MHz           │ DDR5 Memory Channel Clock Frequency
 T_dram                    │ 416.667 Picoseconds   │ DDR5 Memory Clock Period
 v_prop                    │ 150.0 mm / Nanosecond │ FR-4 PCB Signal Propagation Speed (0.15mm/ps)
 L_DQS (All Byte Lanes)    │ 25.0 Millimeters      │ Point-to-Point DQS Trace Length (Matched)
 L_CK_Chip0 (Closest)      │ 20.0 Millimeters      │ Fly-By Clock Trace Length to DRAM Chip 0
 L_CK_Chip3 (Middle)       │ 65.0 Millimeters      │ Fly-By Clock Trace Length to DRAM Chip 3
 L_CK_Chip7 (Farthest)     │ 125.0 Millimeters     │ Fly-By Clock Trace Length to DRAM Chip 7
 T_coarse_tap              │ 208.333 Picoseconds   │ 1 Coarse Delay Tap (= 1 UI = 0.5 T_dram)
 N_fine_taps_per_coarse    │ 64 Fine Taps          │ 64 Fine Taps per Coarse Tap
```

#### PHY Delay Line Resolution:
Each **Fine Delay Tap** ($\text{Tap}_{\text{fine}}$) adds a delay increment of:

$$T_{\text{fine\_tap}} = \frac{T_{\text{coarse\_tap}}}{64} = \frac{208.333\text{ ps}}{64} = \mathbf{3.2552 \text{ Picoseconds per Fine Tap}}$$

---

### The Hardware Execution Tasks:

1. Calculate the physical flight time of the clock signal ($t_{\text{CK\_flight}}$) from the memory controller to Chip 0 ($L = 20.0\text{ mm}$), Chip 3 ($L = 65.0\text{ mm}$), and Chip 7 ($L = 125.0\text{ mm}$).
2. Calculate the physical flight time of the $DQS$ write strobe signal ($t_{\text{DQS\_flight}}$) from the memory controller to all chips over the matched $25.0\text{-mm}$ point-to-point traces.
3. Calculate the net clock-to-strobe arrival skew ($\Delta t_{\text{skew}} = t_{\text{CK\_flight}} - t_{\text{DQS\_flight}}$) at Chip 0, Chip 3, and Chip 7.
4. Calculate the required number of **Coarse Delay Taps** ($\text{Taps}_{\text{coarse}}$) and **Fine Delay Taps** ($\text{Taps}_{\text{fine}}$) that the PHY Write Leveling engine must program for Byte Lane 0, Byte Lane 3, and Byte Lane 7 to achieve $100\%$ edge alignment ($DQS$ aligned with $CK$).
5. Verify whether the calculated fine tap settings fall within valid 64-tap DLL hardware bounds ($0 \le \text{Taps}_{\text{fine}} \le 63$).

---

### Step-by-Step Derivation

#### Step 1: Calculate $CK$ Clock Flight Times ($t_{\text{CK\_flight}}$)

Using $t_{\text{prop}} = \frac{L}{v_{\text{prop}}}$ with $v_{\text{prop}} = 0.150\text{ mm/ps}$ ($6.6667\text{ ps/mm}$):

##### 1. Chip 0 ($L_0 = 20.0\text{ mm}$):

$$t_{\text{CK\_flight0}} = \frac{20.0\text{ mm}}{0.150\text{ mm/ps}} = \mathbf{133.333 \text{ Picoseconds}}$$

##### 2. Chip 3 ($L_3 = 65.0\text{ mm}$):

$$t_{\text{CK\_flight3}} = \frac{65.0\text{ mm}}{0.150\text{ mm/ps}} = \mathbf{433.333 \text{ Picoseconds}}$$

##### 3. Chip 7 ($L_7 = 125.0\text{ mm}$):

$$t_{\text{CK\_flight7}} = \frac{125.0\text{ mm}}{0.150\text{ mm/ps}} = \mathbf{833.333 \text{ Picoseconds}}$$

---

#### Step 2: Calculate $DQS$ Write Strobe Flight Time ($t_{\text{DQS\_flight}}$)

All $DQS$ byte lanes use matched point-to-point trace lengths $L_{\text{DQS}} = 25.0\text{ mm}$:

$$t_{\text{DQS\_flight}} = \frac{25.0\text{ mm}}{0.150\text{ mm/ps}} = \mathbf{166.667 \text{ Picoseconds}} \quad (\text{For All Byte Lanes})$$

---

#### Step 3: Calculate Net Clock-to-Strobe Arrival Skew ($\Delta t_{\text{skew}}$)

The required delay $\Delta t_{\text{skew}}$ that the PHY must add to $DQS$ to align its arrival with $CK$ at Chip $k$ is:

$$\Delta t_{\text{skew\_k}} = t_{\text{CK\_flight\_k}} - t_{\text{DQS\_flight}}$$

##### 1. Byte Lane 0 (Chip 0):

$$\Delta t_{\text{skew0}} = 133.333\text{ ps} - 166.667\text{ ps} = \mathbf{-33.334 \text{ Picoseconds}}$$

*(Note: At Chip 0, $CK$ arrives $33.334\text{ ps}$ BEFORE $DQS$ because $L_0 < L_{\text{DQS}}$. The PHY aligns Byte 0 within the first $DQS$ cycle).*

##### 2. Byte Lane 3 (Chip 3):

$$\Delta t_{\text{skew3}} = 433.333\text{ ps} - 166.667\text{ ps} = \mathbf{266.666 \text{ Picoseconds}}$$

##### 3. Byte Lane 7 (Chip 7):

$$\Delta t_{\text{skew7}} = 833.333\text{ ps} - 166.667\text{ ps} = \mathbf{666.666 \text{ Picoseconds}}$$

At Chip 7, the $DQS$ strobe must be delayed by **$666.666\text{ picoseconds}$**!

---

#### Step 4: Calculate Coarse and Fine DLL Delay Taps

To synthesize required delay $\Delta t$, the PHY calculates integer Coarse Taps ($T_{\text{coarse\_tap}} = 208.333\text{ ps}$) and remaining Fine Taps ($T_{\text{fine\_tap}} = 3.2552\text{ ps}$):

$$\text{Taps}_{\text{coarse}} = \left\lfloor \frac{\Delta t}{T_{\text{coarse\_tap}}} \right\rfloor$$

$$\text{Taps}_{\text{fine}} = \text{ROUND}\left( \frac{\Delta t - (\text{Taps}_{\text{coarse}} \times T_{\text{coarse\_tap}})}{T_{\text{fine\_tap}}} \right)$$

##### 1. Byte Lane 3 Calibration ($\Delta t_{\text{skew3}} = 266.666\text{ ps}$):

$$\text{Taps}_{\text{coarse3}} = \left\lfloor \frac{266.666\text{ ps}}{208.333\text{ ps}} \right\rfloor = \lfloor 1.280 \rfloor = \mathbf{1 \text{ Coarse Tap}} \quad (208.333\text{ ps})$$

$$\text{Remaining Fine Delay} = 266.666\text{ ps} - 208.333\text{ ps} = 58.333\text{ ps}$$

$$\text{Taps}_{\text{fine3}} = \text{ROUND}\left( \frac{58.333\text{ ps}}{3.2552\text{ ps}} \right) = \text{ROUND}(17.919) = \mathbf{18 \text{ Fine Taps}}$$

$$\text{Byte Lane 3 Register Value: } \quad \mathbf{\text{Coarse = 1}, \quad \text{Fine = 18}}$$

##### 2. Byte Lane 7 Calibration ($\Delta t_{\text{skew7}} = 666.666\text{ ps}$):

$$\text{Taps}_{\text{coarse7}} = \left\lfloor \frac{666.666\text{ ps}}{208.333\text{ ps}} \right\rfloor = \lfloor 3.200 \rfloor = \mathbf{3 \text{ Coarse Taps}} \quad (624.999\text{ ps})$$

$$\text{Remaining Fine Delay} = 666.666\text{ ps} - 624.999\text{ ps} = 41.667\text{ ps}$$

$$\text{Taps}_{\text{fine7}} = \text{ROUND}\left( \frac{41.667\text{ ps}}{3.2552\text{ ps}} \right) = \text{ROUND}(12.800) = \mathbf{13 \text{ Fine Taps}}$$

$$\text{Byte Lane 7 Register Value: } \quad \mathbf{\text{Coarse = 3}, \quad \text{Fine = 13}}$$

```text
WRITE LEVELING CALIBRATION RESULTS SUMMARY TABLE

 Byte Lane / Chip │ Clock Trace (CK) │ Skew Delta (ps) │ Coarse Taps (208.33ps)│ Fine Taps (3.255ps)
──────────────────┼──────────────────┼─────────────────┼───────────────────────┼────────────────────
 Byte 0 (Chip 0)  │ 20.0 mm          │ -33.3 ps        │ 0 Coarse Taps         │ 0 Fine Taps (Base)
 Byte 3 (Chip 3)  │ 65.0 mm          │ +266.7 ps       │ 1 Coarse Tap          │ 18 Fine Taps
 Byte 7 (Chip 7)  │ 125.0 mm         │ +666.7 ps       │ 3 Coarse Taps         │ 13 Fine Taps
```

---

#### Step 5: Verify Hardware DLL Bounds

We verify that fine tap values fall within the physical 64-tap hardware range ($0 \le \text{Taps}_{\text{fine}} \le 63$):
* Byte 3 Fine Taps $= 18 \in [0, 63] \quad (\mathbf{\text{VALID!}})$
* Byte 7 Fine Taps $= 13 \in [0, 63] \quad (\mathbf{\text{VALID!}})$

##### Engineering Conclusion:
By programming Coarse Tap $= 3$ and Fine Tap $= 13$ into Byte Lane 7's PHY delay register, the memory controller delays $DQS_7$ by exactly $666.667\text{ picoseconds}$. 

$DQS_7$ and $CK_7$ arrive at Chip 7 at the **exact same picosecond ($t = 833.333\text{ ps}$)**! 

Fly-by trace skew is $100\%$ eliminated across all byte lanes, enabling flawless write operations at $4,800\text{ MT/s}$!

---

### Sanity Check and Verification

Let us verify our mathematical and physical results against signal integrity principles:

1. **Physical Delay Synthesis Check**:
   * Reconstructed Delay for Byte 7:
     $$T_{\text{reconstructed}} = (3 \times 208.333\text{ ps}) + (13 \times 3.2552\text{ ps}) = 624.999 + 42.318 = \mathbf{667.317 \text{ ps}}$$
   * Target skew $= 666.666\text{ ps}$.
   * Quantization error $= 667.317 - 666.666 = \mathbf{0.651 \text{ picoseconds}}$.
   * An error of $0.651\text{ ps}$ is well within the $208.333\text{-ps}$ Unit Interval ($0.31\%$ of 1 UI), verifying $100\%$ timing closure!
2. **Fly-By Trace Linearity Check**:
   * Trace delta from Chip 3 to Chip 7 $= 125.0 - 65.0 = 60.0\text{ mm}$.
   * Delay delta $= 60.0\text{ mm} \times 6.6667\text{ ps/mm} = 400.0\text{ ps}$.
   * Skew delta $= 666.666 - 266.666 = 400.0\text{ ps}$. Linear flight-time relationships match identically!

All FR-4 propagation velocity equations, 2-stage (Coarse/Fine) DLL tap calculations, JEDEC Write Leveling state machine transitions, and $4,800\text{-MT/s}$ signal alignment proofs evaluate with 100% mathematical, physical, and logical precision.

---

## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **Fly-By Topology Alignment**: The physical hardware design requirement on DDR3/DDR4/DDR5 memory modules where clock, address, and command lines are routed in a single continuous daisy-chain to eliminate electrical signal reflections, introducing a predictable physical flight-time skew between clock ($CK$) and data strobes ($DQS$) across DRAM chips.
* **DRAM Write Leveling**: The hardware calibration feedback loop where the memory controller PHY steps through delay-locked loop (DLL) coarse and fine taps on each $DQS$ byte lane while monitoring DRAM $DQ$ sampler feedback ($0 \to 1$ transition), aligning $DQS$ rising edges with $CK$ rising edges at the physical pins of every DRAM chip to enable multi-gigahertz write operations.