---
title: "Glitchless Clock Gating and ICG Fanout Timing Closure"
---

# Glitchless Clock Gating and ICG Fanout Timing Closure

In modern high-performance microprocessors, clock distribution trees are designed to deliver synchronous timing edges to hundreds of thousands of state-storing flip-flops across a silicon die. To prevent these massive clock trees from burning half of the chip's dynamic power budget during idle execution cycles, hardware synthesis tools insert Integrated Clock Gating (ICG) cells. An ICG cell uses a level-sensitive latch paired with an AND gate to halt the clock signal to an idle register block, dropping dynamic switching power to zero.

However, moving from a single isolated ICG cell to a real-world, high-frequency physical floorplan introduces a major engineering challenge: **The ICG Fanout Loading and Timing Closure Bottleneck**.

In a real microprocessor, a single control enable signal rarely manages a tiny $4\text{-bit}$ register. A single enable signal—such as an instruction pipeline stall flag or an execution unit idle signal—often controls the clock trees of **hundreds or thousands of parallel flip-flops** simultaneously (e.g., a $512\text{-bit}$ vector register file or a 64-entry reservation station). 

If a physical design tool connects the output of a single ICG cell to thousands of flip-flop clock pins across a wide physical area, the massive parasitic capacitance of the long wire interconnects ($C_{\text{wire}}$) and input clock pins ($C_{\text{clk\_pin}}$) creates a huge physical load. 

```text
THE HIGH-FANOUT ICG TIMING SKEW BOTTLENECK

 Single High-Fanout ICG Cell (Driving 1,024 Flip-Flops)
 ┌──────────┐      Heavy Parasitic Wire & Gate Load (C_fanout = 3.5 pF)
 │ ICG Cell ├──────┬──────────────┬──────────────┬──────────────┐
 └────┬─────┘      │              │              │              │
      │            ▼              ▼              ▼              ▼
   CLK Input   [FF 0 Pin]     [FF 1 Pin]     ...          [FF 1023 Pin]
 (Massive load causes 180ps Insertion Delay -> Severe Clock Skew!)
```

This heavy capacitive load causes two severe physical failures:
1. **Clock Skew and Timing Violations**: The heavy capacitive load slows down the voltage transition edge of the gated clock signal. The gated clock edge arrives much later than the un-gated master clock edge (**Insertion Delay / Clock Skew**). This clock skew destroys the timing setup ($t_{\text{setup}}$) and hold ($t_{\text{hold}}$) margins on data paths between gated and un-gated flip-flops, corrupting data or causing race conditions.
2. **Enable Path Setup Violations**: The control signal that enables the ICG cell must be calculated by combinational logic and arrive at the ICG latch input *before* the master clock edge arrives. Because an ICG cell drives a large downstream load, any delay in enabling the ICG cell causes the enable setup time to fail, producing truncated **Runt Clock Pulses** or missing clock edges entirely.

We face a critical physical design dilemma:
* If we use **one large ICG cell** to drive thousands of flip-flops, we save silicon area, but the heavy fanout capacitance creates massive clock skew and setup/hold timing failures across the chip.
* If we break the clock tree into **thousands of tiny ICG cells** (one per 2 flip-flops), clock skew is eliminated, but the area and static leakage power of the ICG cells themselves completely destroy the power savings achieved by clock gating!

To achieve multi-gigahertz clock frequencies while maximizing energy efficiency, hardware architects must master **Glitchless Clock Gating Mechanics**, **ICG Fanout Optimization**, and **Multi-Corner Timing Closure**.


### Analogy 2: The Water Valve Interlock and Pressure Shockwave (Glitchless Timing)

Now, let us consider how a high-pressure municipal water valve prevents pipe-bursting shockwaves.

Imagine a high-pressure main water pipe (**The Master Clock Line $CLK$**) running at 100 PSI. You want to install a control valve (**An ICG Enable Latch**) to shut off water to a residential neighborhood (**A Register Array**) when no water is needed.

```text
WATER VALVE INTERLOCK ANALOGY

 Hazardous Mid-Pressure Shutoff (Naive AND Gate):
 High-Pressure Flow ──► Slam Valve Shut Mid-Flow! ──► Shockwave Bursts Pipe!

 Interlocked Shutoff (Level-Sensitive ICG Latch):
 High-Pressure Flow ──► Valve Interlock Engaged!
                    ──► Valve CANNOT move while water is under pressure.
                    ──► Valve closes ONLY when line pressure drops to ZERO!
 (Zero shockwaves! Zero pipe bursts!)
```

If you slam a mechanical valve shut while water is rushing through at full pressure ($CLK = 1$), the sudden momentum interruption generates a violent, high-pressure shockwave known as a **Water Hammer** (**A Runt Clock Pulse / Hazard Glitch**). The shockwave ruptures pipe joints and bursts water meters downstream!

To eliminate water hammers, the water company uses a **Zero-Pressure Interlock Valve (Level-Sensitive Latch ICG)**:
* The valve mechanism contains a pressure-locking pin connected to the main line.
* While water is flowing under high pressure ($CLK = 1$), the locking pin engages, **freezing the valve position completely**. Even if an operator yanks the valve handle, the valve cannot move!
* The valve handle can move *only* during the brief interval when the main line pressure drops to zero ($CLK = 0$).
* When high pressure returns ($CLK = 1$), the valve is already locked in its new position. Water either flows smoothly at $100\%$ volume or is stopped completely at $0\%$.
* **Zero shockwaves! Zero burst pipes!**


### Step-by-Step Mathematical Proof of Glitch Freedom

Let $CLK(t) \in \{0, 1\}$ be the master clock signal, $EN(t) \in \{0, 1\}$ be the functional enable control signal, and $TE(t) \in \{0, 1\}$ be the test enable signal.

The effective enable input $EN_{\text{eff}}(t)$ entering the latch data input $D$ is:

$$EN_{\text{eff}}(t) = EN(t) \ \mathbf{\lor} \ TE(t)$$

The level-sensitive latch operates under two physical states dictated by $CLK(t)$:

#### State 1: Master Clock is LOW ($CLK(t) = 0$) — Latch Transparent Phase
When $CLK(t) = 0$, the latch's active-low clock enable pin ($\overline{G}$) is active ($0$). The latch is **Transparent**:

$$EN_{\text{latched}}(t) = EN_{\text{eff}}(t)$$

Because $CLK(t) = 0$, the output AND gate evaluates:

$$GCLK(t) = CLK(t) \cdot EN_{\text{latched}}(t) = 0 \cdot EN_{\text{latched}}(t) = \mathbf{0.0 \text{ Volts}}$$

Notice that while $CLK(t) = 0$, any transitions, noise spikes, or glitches occurring on $EN(t)$ pass through the transparent latch to $EN_{\text{latched}}$, but **CANNOT propagate to the output $GCLK$** because the second input of the AND gate is held at $0$!

#### State 2: Master Clock Transitions LOW-to-HIGH ($CLK(t) \to 1$) — Rising Edge
On the exact picosecond that $CLK(t)$ rises from $0 \to 1$, the latch's clock pin ($\overline{G}$) becomes inactive ($1$). The latch **instantly becomes Opaque / Frozen**:

$$EN_{\text{latched}}(t) = EN_{\text{eff}}(t_{\text{rising\_edge}} - t_{\text{setup}})$$

The value of $EN_{\text{eff}}$ present immediately before the rising clock edge is captured and locked inside the latch's feedback loop.

Now, evaluate the output AND gate as $CLK(t)$ becomes $1$:
* **If $EN_{\text{latched}} = 1$**: $GCLK(t) = 1 \cdot 1 = 1$. The output $GCLK$ transitions from $0 \to 1$ in perfect, synchronous alignment with the master clock $CLK$!
* **If $EN_{\text{latched}} = 0$**: $GCLK(t) = 1 \cdot 0 = 0$. The output $GCLK$ remains at $0$.

#### State 3: Master Clock is HIGH ($CLK(t) = 1$) — Latch Opaque Phase
While $CLK(t) = 1$, the latch remains strictly **Opaque**.

Suppose the control logic evaluates a new condition and changes $EN(t)$ from $1 \to 0$ or $0 \to 1$ while $CLK(t) = 1$.

```text
GLITCH BLOCKING MECHANISM DURING CLK HIGH PHASE

 Master CLK   : ───┐       ┌───────┐       ┌───────┐       ┌───
               └───┘       └───────┘       └───────┘       └───
 Enable EN    : ───────┐       ┌───────────────────────────────
                       │       │ (Transitions mid-high!)
 EN_latched   : ───────────┐   └───────────┐ (Opaque latch FROZEN!)
                           └───┘           └───
 Gated_CLK    : ───────────────────────────┐       ┌───────────
                                           └───────┘
               ◄─ C1 ─►◄─ C2 ─►◄─── C3 ───►◄─── C4 ───►
```

Because the latch is opaque, **the transition on $EN(t)$ is physically blocked at the latch input**! 

The internal node $EN_{\text{latched}}$ remains completely constant throughout the entire HIGH phase of $CLK(t)$:

$$\frac{d EN_{\text{latched}}}{dt} = 0 \quad (\text{for all } t \text{ where } CLK(t) = 1)$$

Therefore, the AND gate output $GCLK(t)$ simplifies to:

$$GCLK(t) = 1 \cdot \text{Constant} = \text{Constant}$$

#### Mathematical Conclusion:
The output $GCLK(t)$ can **never** experience an intermediate transition or hazard spike while $CLK(t) = 1$. 

The output $GCLK$ can transition $0 \to 1$ **ONLY** on the rising edge of $CLK$, and transition $1 \to 0$ **ONLY** on the falling edge of $CLK$. Runt clock pulses are $100\%$ mathematically eliminated!


### Calculating Total ICG Fanout Load Capacitance ($C_{\text{fanout}}$)

The total capacitive load $C_{\text{fanout}}$ seen by the driving output stage of an ICG cell is the sum of all downstream flip-flop clock pin capacitances plus the parasitic interconnect wire capacitance of the gated clock net ($GCLK$):

$$C_{\text{fanout}} = \left( \sum_{i=1}^{N_{\text{ff}}} C_{\text{clk\_pin,i}} \right) + C_{\text{wire\_net}}$$

Where:
* $C_{\text{fanout}}$ is the total load capacitance driven by the ICG cell in Farads ($\text{F}$).
* $N_{\text{ff}}$ is the total number of flip-flops connected to this gated clock branch (the **Fanout Count**).
* $C_{\text{clk\_pin,i}}$ is the input clock pin parasitic capacitance of flip-flop $i$ in Farads ($\text{F}$) (typically $1.5 \text{ to } 3.5\text{ fF}$ per pin).
* $C_{\text{wire\_net}}$ is the total parasitic copper interconnect wire capacitance of the routed $GCLK$ net in Farads ($\text{F}$).


### Quantifying Clock Skew ($\Delta t_{\text{skew}}$)

**Clock Skew ($\Delta t_{\text{skew}}$)** is the physical difference in clock edge arrival times between two flip-flops on the same chip.

Consider a data path where a launching flip-flop ($\text{FF}_{\text{src}}$) is driven by an **un-gated clock branch** ($CLK_{\text{raw}}$), while the receiving destination flip-flop ($\text{FF}_{\text{dst}}$) is driven by a **gated clock branch** ($GCLK$) driven by a heavy-fanout ICG cell:

```text
CLOCK SKEW BETWEEN UN-GATED AND GATED BRANCHES

 Master Clock Source
   │
   ├─► Un-Gated Branch (Fast: t_ins_ungated = 50ps) ──► FF_src (Launches Data)
   │
   └─► Gated ICG Branch (Slow: t_ins_gated = 220ps) ──► FF_dst (Captures Data)
       ◄───────────── Clock Skew = 170ps ────────────►
```

The clock skew $\Delta t_{\text{skew}}$ between the destination and source flip-flops is:

$$\Delta t_{\text{skew}} = t_{\text{ins\_gated}} - t_{\text{ins\_ungated}}$$

$$\Delta t_{\text{skew}} = 220\text{ ps} - 50\text{ ps} = \mathbf{170 \text{ picoseconds!}}$$

The clock edge arrives at destination flip-flop $\text{FF}_{\text{dst}}$ **$170\text{ picoseconds}$ later** than at launching flip-flop $\text{FF}_{\text{src}}$!


### 2. The Impact of Clock Skew on Hold Time ($t_{\text{hold}}$) — The Fatal Race Condition!

Now look at the opposite, dangerous side of the coin: **The Hold Time Constraint**.

The **Hold Time Constraint** requires data launched by $\text{FF}_{\text{src}}$ on Clock Cycle $N$ to **NOT** reach $\text{FF}_{\text{dst}}$ so fast that it overwrites the data launched on Cycle $N-1$ *before* $\text{FF}_{\text{dst}}$ has finished capturing Cycle $N-1$'s data!

$$t_{\text{C2Q,src\_min}} + t_{\text{logic\_min}} \ge t_{\text{hold,dst}} + \Delta t_{\text{skew}} + t_{\text{margin}}$$

Rearranging the equation to solve for allowable positive clock skew $\Delta t_{\text{skew\_max}}$:

$$\mathbf{\Delta t_{\text{skew\_max}} \le t_{\text{C2Q,src\_min}} + t_{\text{logic\_min}} - t_{\text{hold,dst}} - t_{\text{margin}}}$$

Where:
* $t_{\text{C2Q,src\_min}}$ is the minimum Clock-to-Q delay of $\text{FF}_{\text{src}}$ (fast-corner silicon).
* $t_{\text{logic\_min}}$ is the minimum combinational logic delay along the path (e.g., a direct wire with zero logic gates!).
* $t_{\text{hold,dst}}$ is the required hold time of destination flip-flop $\text{FF}_{\text{dst}}$.

```text
HOLD TIME VIOLATION DUE TO POSITIVE CLOCK SKEW

 Clock at FF_src (Fast) : ───┐       ┌───────
                            └───┘       └───────
 Data Launched by FF_src: ───────[ NEW DATA ]────► (Arrives at FF_dst at t = 40ps!)
                            ◄─ 40ps ─►
 Clock at FF_dst (Slow) : ───────────┐       ┌───
                            ─────────└───┘   └─── (Clock arrives at t = 170ps!)
                                         ▲
                                         └── HOLD VIOLATION! FF_dst captures NEW DATA
                                             instead of OLD DATA! State corrupted!
```

#### The Physical Hold Time Disaster:
Look at the mathematical danger:
Suppose a fast register $\text{FF}_{\text{src}}$ is connected directly to $\text{FF}_{\text{dst}}$ with a short wire ($t_{\text{logic\_min}} = 10\text{ ps}$, $t_{\text{C2Q\_min}} = 30\text{ ps}$). Total minimum data arrival delay $= 40\text{ ps}$.

If $\text{FF}_{\text{dst}}$ is driven by a heavy-fanout ICG cell that introduces a clock skew $\Delta t_{\text{skew}} = 170\text{ ps}$:
* $\text{FF}_{\text{src}}$ launches new data on Cycle $N$. The new data arrives at $\text{FF}_{\text{dst}}$ at $t = 40\text{ ps}$.
* But $\text{FF}_{\text{dst}}$ does not even receive its Cycle $N-1$ clock edge until $t = 170\text{ ps}$!
* When $\text{FF}_{\text{dst}}$'s clock edge finally arrives at $t = 170\text{ ps}$, **the old Cycle $N-1$ data is ALREADY GONE**, replaced by Cycle $N$'s new data!
* $\text{FF}_{\text{dst}}$ captures Cycle $N$'s data **TWICE**, skipping Cycle $N-1$'s data entirely!
* **THIS IS A PERMANENT HOLD TIME VIOLATION!** 

Unlike setup time violations (which can be fixed in production by lowering the clock frequency $f$), **hold time violations CANNOT be fixed by changing the clock frequency**! 

A chip with a hold time violation is permanently defective physical scrap metal!


### Strategy 1: ICG Cloning (Splitting Over-Loaded ICGs)

When Static Timing Analysis (STA) detects that a single high-fanout ICG cell (e.g., driving $N_{\text{ff}} = 1,024$ flip-flops) introduces excessive insertion delay ($t_{\text{ins\_icg}} = 220\text{ ps}$) and triggers hold time violations:

The physical design tool executes **ICG Cloning**:
1. The tool deletes the single $1,024\text{-fanout}$ ICG cell.
2. The tool instantiates **4 parallel cloned ICG cells**, each driving a smaller fanout of $256$ flip-flops.
3. The load capacitance per cloned ICG drops by $75\%$ ($C_{\text{fanout\_clone}} = 0.25 \cdot C_{\text{fanout\_orig}}$).
4. Insertion delay drops from $220\text{ ps}$ down to **$50\text{ ps}$**!
5. Clock skew $\Delta t_{\text{skew}}$ drops to near zero, **eliminating all hold time violations** while maintaining $100\%$ clock gating functionality!


### Strategy 3: Power-Aware Clock Tree Balancing (Dummy Buffer Insertion)

To equalize clock arrival times between gated and un-gated clock branches across a physical floorplan, Clock Tree Synthesis (CTS) engines insert **Dummy Clock Balancing Buffers**:

```text
BALANCED CLOCK TREE WITH DUMMY BALANCING BUFFERS

 Master Clock Source
   │
   ├─► Un-Gated Branch : [ Clock Buffer ]──►[ Clock Buffer ]──► FF_src
   │                     (Delay = 50ps)     (Delay = 50ps)     (Arrival = 100ps)
   │
   └─► Gated Branch    : [ ICG Cell     ]──►[ Clock Buffer ]──► FF_dst
                         (Delay = 50ps)     (Delay = 50ps)     (Arrival = 100ps)
   (Both clock branches arrive at t = 100ps! Skew = 0ps! Perfect Hold Margin!)
```

By inserting an extra clock buffer into the un-gated branch, the CTS engine forces $t_{\text{ins\_ungated}}$ to match $t_{\text{ins\_gated}}$ exactly:

$$t_{\text{ins\_ungated}} = t_{\text{ins\_gated}} = 100\text{ ps}$$

$$\Delta t_{\text{skew}} = 100\text{ ps} - 100\text{ ps} = \mathbf{0.0 \text{ Picoseconds!}}$$

Clock skew drops to zero, guaranteeing that both setup and hold timing constraints close cleanly across all operating conditions!


### Scenario and Parameters

You are a senior physical design sign-off engineer optimizing a 64-bit vector processing pipeline stage operating at a master clock frequency $f = 2.5\text{ GHz}$ ($T_{\text{clk}} = 400.0\text{ ps}$).

The supply voltage is $V_{DD} = 0.95\text{ V}$.

```text
2.5 GHZ PIPELINE STAGE CLOCK GATING MODEL

 Clock & Physical Parameters:
   f                = 2.5 GHz (T_clk = 400.0 ps)
   V_DD             = 0.95 Volts
   t_jitter         = 10.0 ps (Clock Jitter)
   t_ins_ungated    = 50.0 ps (Un-gated master branch insertion delay)

 Un-Cloned High-Fanout ICG Setup (1 ICG driving 512 Flip-Flops):
   N_ff             = 512 Flip-Flops
   C_clk_pin        = 2.5 fF per flip-flop clock pin
   C_wire_per_ff    = 0.5 fF per fanout wire trace
   R_driver_icg     = 120.0 Ohms (ICG driver output channel resistance)
   t_icg_internal   = 35.0 ps (Intrinsic zero-load ICG delay)

 Data Path Parameters (Between Launching FF_src and Receiving FF_dst):
   t_C2Q_src_max    = 60.0 ps  |  t_C2Q_src_min    = 30.0 ps
   t_logic_max      = 180.0 ps |  t_logic_min      = 10.0 ps
   t_setup_dst      = 25.0 ps  |  t_hold_dst       = 20.0 ps
```

#### Circuit & Timing Parameters:
* Master Clock Period: $T_{\text{clk}} = 400.0\text{ ps}$.
* Clock Jitter / Uncertainty: $t_{\text{jitter}} = 10.0\text{ ps}$.
* Un-Gated Source Branch Clock Insertion Delay: $t_{\text{ins\_ungated}} = 50.0\text{ ps}$.
* **Un-Cloned High-Fanout ICG Cell**:
  * Total Fanout Count: $N_{\text{ff}} = 512\text{ flip-flops}$.
  * Flip-Flop Clock Pin Capacitance: $C_{\text{clk\_pin}} = 2.5\text{ fF} = 2.5 \times 10^{-15}\text{ F}$.
  * Wire Capacitance per Fanout: $C_{\text{wire\_per\_ff}} = 0.5\text{ fF} = 0.5 \times 10^{-15}\text{ F}$.
  * Total Capacitance per Fanout Load: $C_{\text{per\_ff}} = 2.5\text{ fF} + 0.5\text{ fF} = \mathbf{3.0 \text{ fF}}$.
  * ICG Internal Output Driver Resistance: $R_{\text{driver\_icg}} = 120.0\ \Omega$.
  * ICG Intrinsic Delay (Zero Load): $t_{\text{icg\_internal}} = 35.0\text{ ps}$.
* **Data Path Parameters**:
  * Launching Flip-Flop $\text{FF}_{\text{src}}$ (Driven by Un-Gated Clock $t_{\text{ins\_ungated}} = 50\text{ ps}$):
    * Max Clock-to-Q Delay: $t_{\text{C2Q\_src\_max}} = 60.0\text{ ps}$.
    * Min Clock-to-Q Delay: $t_{\text{C2Q\_src\_min}} = 30.0\text{ ps}$.
  * Combinational Logic Path to Destination $\text{FF}_{\text{dst}}$ (Driven by Gated Clock $GCLK$):
    * Max Logic Delay: $t_{\text{logic\_max}} = 180.0\text{ ps}$.
    * Min Logic Delay: $t_{\text{logic\_min}} = 10.0\text{ ps}$ (Short fast-path wire!).
  * Destination Flip-Flop $\text{FF}_{\text{dst}}$ Setup and Hold Requirements:
    * Setup Time: $t_{\text{setup\_dst}} = 25.0\text{ ps}$.
    * Hold Time: $t_{\text{hold\_dst}} = 20.0\text{ ps}$.


### Step-by-Step Derivation

#### Step 1: Calculate Total Fanout Load Capacitance ($C_{\text{fanout\_512}}$)

For $N_{\text{ff}} = 512$ flip-flops:

$$C_{\text{fanout\_512}} = N_{\text{ff}} \times (C_{\text{clk\_pin}} + C_{\text{wire\_per\_ff}})$$

$$C_{\text{fanout\_512}} = 512 \times (2.5\text{ fF} + 0.5\text{ fF}) = 512 \times 3.0\text{ fF} = \mathbf{1,536.0 \text{ fF}} = 1.536 \times 10^{-12}\text{ F} \quad (1.536\text{ pF})$$

The 512-fanout ICG cell sees a massive physical load of **$1.536\text{ picoFarads}$**.


#### Step 3: Evaluate Setup Time Slack ($\text{Slack}_{\text{setup\_512}}$)

The Setup Time constraint equation is:

$$t_{\text{C2Q,src\_max}} + t_{\text{logic\_max}} + t_{\text{setup,dst}} \le T_{\text{clk}} + \Delta t_{\text{skew\_512}} - t_{\text{jitter}}$$

Substitute known values:
* Left-Hand Side (Data Arrival Time $T_{\text{arrival\_max}}$):
  $$T_{\text{arrival\_max}} = 60.0\text{ ps} + 180.0\text{ ps} + 25.0\text{ ps} = \mathbf{265.0 \text{ ps}}$$
* Right-Hand Side (Required Clock Target $T_{\text{required\_setup}}$):
  $$T_{\text{required\_setup}} = 400.0\text{ ps} + 169.32\text{ ps} - 10.0\text{ ps} = \mathbf{559.32 \text{ ps}}$$

Calculate Setup Slack:

$$\text{Slack}_{\text{setup\_512}} = T_{\text{required\_setup}} - T_{\text{arrival\_max}} = 559.32\text{ ps} - 265.00\text{ ps} = \mathbf{+294.32 \text{ picoseconds (PASSED!)}}$$

Setup time passes with a large positive margin of $+294.32\text{ ps}$ because positive clock skew delayed the destination clock edge.


#### Step 5: Perform ICG Cloning (Splitting into 4 Parallel 128-Fanout ICGs)

To fix the hold time violation, the physical design tool clones the single 512-fanout ICG into **4 parallel 128-fanout ICG cells** ($N_{\text{ff\_clone}} = 128$).

##### 1. Recalculate Cloned Load Capacitance ($C_{\text{fanout\_128}}$):

$$C_{\text{fanout\_128}} = 128 \times (2.5\text{ fF} + 0.5\text{ fF}) = 128 \times 3.0\text{ fF} = \mathbf{384.0 \text{ fF}} = 0.384 \times 10^{-12}\text{ F}$$

##### 2. Recalculate Cloned Insertion Delay ($t_{\text{ins\_gated\_128}}$):

$$t_{\text{ins\_gated\_128}} = 35.0\text{ ps} + (120.0\ \Omega \times 0.384 \times 10^{-12}\text{ F})$$

$$120.0 \times 0.384 \times 10^{-12}\text{ s} = \mathbf{46.08 \text{ ps}}$$

$$t_{\text{ins\_gated\_128}} = 35.0\text{ ps} + 46.08\text{ ps} = \mathbf{81.08 \text{ picoseconds}}$$

##### 3. Recalculate Cloned Clock Skew ($\Delta t_{\text{skew\_128}}$):

$$\Delta t_{\text{skew\_128}} = t_{\text{ins\_gated\_128}} - t_{\text{ins\_ungated}} = 81.08\text{ ps} - 50.00\text{ ps} = \mathbf{31.08 \text{ picoseconds}}$$

Clock skew dropped from $169.32\text{ ps}$ down to **$31.08\text{ picoseconds}$**!


### Sanity Check and Verification

Let us verify our mathematical and physical derivations:

1. **Load Capacitance Scaling Verification**:
   * $C_{\text{fanout\_512}} = 512 \times 3.0\text{ fF} = 1,536\text{ fF}$.
   * $C_{\text{fanout\_128}} = 128 \times 3.0\text{ fF} = 384\text{ fF}$.
   * Ratio $= 384 / 1,536 = 0.25$ ($75\%$ reduction). Calculation is $100\%$ exact.

2. **$RC$ Driver Delay Verification**:
   * For 512 fanout: $R \cdot C = 120\ \Omega \times 1.536\text{ pF} = 184.32\text{ ps}$.
   * For 128 fanout: $R \cdot C = 120\ \Omega \times 0.384\text{ pF} = 46.08\text{ ps}$.
   * Delta delay $= 184.32 - 46.08 = 138.24\text{ ps}$.
   * Insertion delay difference $= 219.32 - 81.08 = 138.24\text{ ps}$.
   * Skew reduction $= 169.32 - 31.08 = 138.24\text{ ps}$.
   * All three delta calculations match with $100\%$ precision!

3. **Hold Slack Formula Invariant**:
   * $\text{Slack}_{\text{hold}} = (t_{\text{C2Q\_min}} + t_{\text{logic\_min}} + t_{\text{buffer}}) - (t_{\text{hold}} + \Delta t_{\text{skew}} + t_{\text{jitter}})$.
   * $\text{Slack}_{\text{hold}} = (30 + 10 + 25) - (20 + 31.08 + 10) = 65.0 - 61.08 = +3.92\text{ ps}$.
   * Hold timing closure mathematically verified.

