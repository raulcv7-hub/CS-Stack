# Pulse Synchronizer Circuit Design and Toggle-Based Clock Domain Crossing Extension

## Fast-to-Slow Clock Domain Pulse Swallowing and Signal Sub-Sampling

In modern System-on-Chip (SoC) architectures, different functional blocks operate at vastly different clock frequencies. A high-speed PCIe bus interface or graphics processing core might run at a fast clock frequency of $1.0\text{ GHz}$ (clock period $T_{\text{fast}} = 1.0\text{ ns}$), while a system management controller or peripheral bus operates at a slower clock frequency of $100\text{ MHz}$ (clock period $T_{\text{slow}} = 10.0\text{ ns}$).

When the fast clock domain generates a single-clock-cycle control pulse—such as an interrupt strobe, a packet arrival notification, or an event counter tick—and sends that pulse across a Clock Domain Crossing (CDC) boundary to the slower clock domain, a critical physical sampling failure occurs: **Pulse Swallowing** (also known as Sub-Sampling Loss).

A single-cycle control pulse generated in a $1.0\text{ GHz}$ clock domain remains High ($1$) for exactly $1.0\text{ nanosecond}$, and then returns to Low ($0$).

Now, trace what happens when this 1.0-nanosecond pulse arrives at the input of a flip-flop in the $100\text{ MHz}$ receiving clock domain:
* The $100\text{ MHz}$ clock rises once every $10.0\text{ nanoseconds}$.
* If the 1.0-nanosecond pulse arrives at time $t = 12.0\text{ ns}$ and falls back to zero at $t = 13.0\text{ ns}$, the $100\text{ MHz}$ clock is sitting at a steady Low or High level during that entire window.
* The $100\text{ MHz}$ clock's next active rising edge does not arrive until $t = 20.0\text{ ns}$!

```text
THE PULSE SWALLOWING HAZARD (FAST TO SLOW CDC)

 Fast Clock (1.0 GHz)   : 0101010101010101010101010101010101010101
 Fast Control Pulse     : 0000001100000000000000000000000000000000
                         (Rises at 12 ns, Falls at 13 ns! Width = 1 ns)

 Slow Clock (100 MHz)   : 0000000000000000000011111111111111111111
                          ▲                   ▲
                          │ Edge at 10 ns     │ Edge at 20 ns
                          │                   │
 Slow Clock Sampling    : 0000000000000000000000000000000000000000
                          (PULSE SWALLOWED! NEVER SEEN BY SLOW CLOCK!)
```

By the time the receiving clock edge arrives at $t = 20.0\text{ ns}$, the control pulse has already risen, fallen, and vanished. To the receiving clock domain, **the event never happened!**

Even if you place a standard two-flip-flop (2-FF) synchronizer at the interface, the first sampling flip-flop will sample $0$ at $t = 10\text{ ns}$ and sample $0$ at $t = 20\text{ ns}$. The pulse is swallowed completely.

### The Nyquist-Shannon Sampling Constraint in CDC Interfaces

For an edge-triggered flip-flop in a receiving clock domain to sample an incoming control signal deterministically, the signal MUST satisfy the **CDC Nyquist Sampling Constraint**:

> **The CDC Nyquist Sampling Constraint**: An asynchronous control signal crossing a clock boundary MUST remain continuously stable at its active logic level for **at least 1.5 to 2 full clock periods** of the receiving clock domain plus the setup time ($t_{\text{su}}$).

$$
W_{\text{pulse,min}} \ge 1.5 \cdot T_{\text{rx\_clk}} + t_{\text{su}}
$$

Where:
* $W_{\text{pulse,min}}$ is the minimum required active width of the crossing signal (in seconds).
* $T_{\text{rx\_clk}}$ is the clock period of the receiving (destination) clock domain.
* $t_{\text{su}}$ is the setup time requirement of the receiving synchronizer flip-flop.

A 1.0-nanosecond pulse generated in a $1.0\text{ GHz}$ domain trying to cross into a $100\text{ MHz}$ domain ($T_{\text{rx\_clk}} = 10.0\text{ ns}$) violates this constraint by an order of magnitude:

$$1.0\text{ ns} \ll (1.5 \times 10.0\text{ ns} + 0.2\text{ ns}) = 15.2\text{ ns}$$

How do we pass a single-cycle control pulse from a fast clock domain into a slow clock domain without swallowing the pulse, without losing event count accuracy, and without introducing race conditions?

We use **Toggle-Based Pulse Extension** and the **Pulse Synchronizer Circuit Architecture**.

---

## The Camera Flash and the Light Switch: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of pulse extension and pulse reconstruction across clock boundaries, let us picture a photographer trying to document weather events.

Imagine a dark laboratory with two rooms separated by a thick wall: the Outside Storm Deck and the Inside Photo Lab.

```text
THE LIGHTNING CAMERA SAMPLING PROBLEM

 Outside Storm Deck (Fast Transmit Domain)   Inside Photo Lab (Slow Receive Domain)
 ┌──────────────────────────────────────┐   ┌────────────────────────────────────┐
 │ Lightning Flashes!                   │   │ Photographer Shutter Opens         │
 │ (Duration: 0.001 Seconds / 1 ms)     │   │ ONCE EVERY 10 SECONDS!             │
 └──────────────────────────────────────┘   └────────────────────────────────────┘
```

* **Outside Storm Deck**: Lightning strikes occur rapidly. A lightning flash lasts for only **$0.001\text{ seconds}$ (1 millisecond)**.
* **Inside Photo Lab**: A photographer operates a camera whose shutter opens automatically **once every 10 seconds** ($T_{\text{slow}} = 10\text{s}$).

If a lightning bolt flashes for $0.001\text{ seconds}$ while the camera shutter is closed, the camera records total darkness. The photographer misses the lightning strike completely! This is **Pulse Swallowing**.

How can the weather station guarantee that the photographer never misses a single lightning strike, even though the camera shutter opens only once every 10 seconds?

---

### Step 1: The Light Switch Toggle (Pulse-to-Toggle Conversion)

The weather station owner installs a simple mechanical device outside: a wall light switch connected to a bright lantern mounted on top of the building.

Instead of trying to flash the lantern for $0.001\text{ seconds}$, the weather station installs a mechanical robot arm connected to the light switch:
* **Initial State**: The light switch is **OFF** ($0$).
* **Lightning Strike 1**: A lightning bolt strikes ($1\text{-ms}$ pulse). The robot arm flips the light switch to **ON** ($1$). **The lantern stays ON indefinitely!**
* **Lightning Strike 2**: Later, a second lightning bolt strikes. The robot arm flips the light switch back to **OFF** ($0$). **The lantern stays OFF indefinitely!**

```text
LIGHT SWITCH TOGGLE CONVERSION

 Lightning Flash 1 (Pulse 1) ──► Robot Flips Switch OFF -> ON  ──► Lantern STAYS ON!
 Lightning Flash 2 (Pulse 2) ──► Robot Flips Switch ON  -> OFF ──► Lantern STAYS OFF!
```

Look at what the robot arm achieved:
The short $0.001\text{-second}$ lightning flash was converted into a **permanent state level toggle** ($0 \to 1$ or $1 \to 0$). The lantern stays ON for 10, 20, or 100 seconds until the next lightning strike occurs!

Because the lantern stays lit indefinitely, the photographer's camera shutter (opening once every 10 seconds) is **guaranteed to see the new lantern state**! The pulse was converted into a level signal that satisfies the Nyquist sampling constraint.

---

### Step 2: The Photographer's Difference Check (Toggle-to-Pulse Reconstruction)

Now, how does the photographer inside the photo lab know that a new lightning strike occurred?

The photographer looks at the camera photos taken 10 seconds apart:
1. **Photo 1 (taken at 12:00:00)**: Shows the lantern was **OFF** ($0$).
2. **Photo 2 (taken at 12:00:10)**: Shows the lantern is now **ON** ($1$).

The photographer compares Photo 2 with Photo 1:
$$\text{Difference Check} = \text{Photo 2} \neq \text{Photo 1} \implies \text{A LIGHTNING STRIKE OCCURRED!}$$

The photographer writes down a single event tick ("Lightning Detected!") on a notepad (**1-cycle output pulse in the photo lab domain**).

What happens when Lightning Strike 2 occurs later, flipping the lantern from **ON ($1$) back to OFF ($0$)**?
1. **Photo 3 (taken at 12:00:20)**: Shows the lantern is **ON** ($1$).
2. **Photo 4 (taken at 12:00:30)**: Shows the lantern is now **OFF** ($0$).

The photographer compares Photo 4 with Photo 3:
$$\text{Difference Check} = \text{Photo 4} \neq \text{Photo 3} \implies \text{A SECOND LIGHTNING STRIKE OCCURRED!}$$

Both transitions—flipping the light switch from $0 \to 1$ OR flipping it from $1 \to 0$—indicate that a lightning strike happened!

This two-step process is the exact mental model behind a **Pulse Synchronizer**:
* The lightning flash is the **Fast Transmit Pulse (`src_pulse`)**.
* The robot flipping the light switch is the **Pulse-to-Toggle Converter (T Flip-Flop)**.
* The lantern holding its state is the **Extended Level Toggle Signal (`src_toggle`)**.
* The photographer's camera is the **Two-Flip-Flop Synchronizer (`sync_ff1 -> sync_ff2`)**.
* Comparing Photo 2 with Photo 1 is the **XOR Differentiator / Edge Detector (`dest_pulse = sync_ff2 ^ sync_ff3`)**.

---

## Mechanics of Pulse Synchronizer Circuit Architecture

To master Clock Domain Crossing (CDC) pulse synchronization, we must dissect the formal mechanics of its three internal hardware stages:
1. **Stage 1 (Transmit Domain)**: Pulse-to-Toggle Conversion.
2. **Stage 2 (CDC Boundary)**: Two-Flip-Flop (2-FF) Synchronization.
3. **Stage 3 (Receive Domain)**: Toggle-to-Pulse Reconstruction (XOR Edge Differentiation).

```text
PULSE SYNCHRONIZER COMPLETE CIRCUIT SCHEMATIC

 TRANSMIT DOMAIN (clk_src)            RECEIVE DOMAIN (clk_dest)
 ┌────────────────────────┐           ┌──────────────────────────────────────────────┐
 │ Pulse-to-Toggle       │           │ 2-FF Synchronizer     XOR Differentiator     │
 │ (T Flip-Flop / XOR)    │           │ (CDC Boundary)        (Pulse Reconstructor)  │
 └───────────┬────────────┘           └──────┬───────────────────────┬────────────────┘
             │                               │                       │
 src_pulse ──┼─►[ XOR ]                      │                       │
             │     │                         │                       │
             │     ▼                         ▼                       ▼
             │   [ D-FF ] ──► src_toggle ──►[ D-FF1 ]──►[ D-FF2 ]───┬──►[ D-FF3 ]
             └──►[ >CLK ] (Fast Clock)      [ >CLK ]  [ >CLK ]   │   [ >CLK ] (Slow Clock)
                                            (clk_dest) (clk_dest)│   (clk_dest)
                                                                 │       │
                                                                 ▼       ▼
                                                               [ XOR Gate ] ──► dest_pulse
```

Let us analyze each stage in complete mathematical and gate-level detail.

---

### Stage 1: Pulse-to-Toggle Conversion (Transmit Domain `clk_src`)

The objective of Stage 1 is to capture a single-clock-cycle pulse `src_pulse` arriving in the fast transmit clock domain (`clk_src`) and transform it into a level toggle signal `src_toggle`.

#### Gate-Level Implementation:
Stage 1 consists of an edge-triggered D flip-flop whose input is driven by a 2-input Exclusive-OR (XOR) gate feedback loop:
* Input 1 of XOR gate: The incoming 1-cycle control pulse `src_pulse`.
* Input 2 of XOR gate: The current stored output of the flip-flop `src_toggle`.

```text
PULSE-TO-TOGGLE CONVERTER SCHEMATIC

 src_pulse ───────►┌───────┐
                   │ XOR   ├──► D_in ──► [ D Flip-Flop ] ──► Output src_toggle
 src_toggle ──┐    └───────┘             (Clock clk_src)     (Holds level!)
              │                                │
              └────────────────────────────────┘
```

#### Boolean Equation for Stage 1 Input:

$$
D_{\text{toggle}} = \text{src\_pulse} \oplus \text{src\_toggle}
$$

Where:
* $D_{\text{toggle}}$ is the input to the transmit domain toggle flip-flop.
* $\text{src\_pulse}$ is the incoming 1-cycle control pulse in the transmit domain.
* $\text{src\_toggle}$ is the current output state of the toggle flip-flop.
* $\oplus$ represents the logical XOR operation.

#### Operation Trace:
* **When `src_pulse == 0`**:
  $$D_{\text{toggle}} = 0 \oplus \text{src\_toggle} = \text{src\_toggle}$$
  The flip-flop re-loads its own current value on every clock edge. `src_toggle` holds its level steady ($0$ or $1$).
* **When `src_pulse == 1` (1-Cycle Control Pulse Arrives!)**:
  $$D_{\text{toggle}} = 1 \oplus \text{src\_toggle} = \overline{\text{src\_toggle}}$$
  The flip-flop **inverts its stored output state** on the rising clock edge!
  If `src_toggle` was $0$, it becomes $1$. If `src_toggle` was $1$, it becomes $0$.

Because `src_pulse` drops back to $0$ on the next clock cycle, $D_{\text{toggle}}$ returns to $0 \oplus \text{new\_toggle} = \text{new\_toggle}$. 

**`src_toggle` remains frozen at its new logic level indefinitely until the NEXT pulse arrives!**

```text
PULSE-TO-TOGGLE CONVERSION WAVEFORM TRACE

 clk_src    : 0101010101010101010101010101010101010101
              ▲         ▲         ▲         ▲
 src_pulse  : 0000000000111111110000000000000000000000 (1-Cycle Pulse!)
                        ▲
 src_toggle : 0000000000000000001111111111111111111111 (Inverts and HOLDS!)
```

---

### Stage 2: Two-Flip-Flop CDC Synchronization (Receive Domain `clk_dest`)

The extended level signal `src_toggle` crosses the asynchronous boundary into the destination clock domain (`clk_dest`).

To prevent metastability from entering downstream logic, `src_toggle` passes through a standard **Two-Flip-Flop (2-FF) Synchronizer** clocked by `clk_dest`:

* **First Synchronizer Stage (`dest_sync1`)**: Samples `src_toggle` on `clk_dest`. Traps any potential metastability caused by setup/hold violations inside `dest_sync1`.
* **Second Synchronizer Stage (`dest_sync2`)**: Samples `dest_sync1` on the next `clk_dest` edge, emitting a clean, 100% synchronized toggle signal `dest_sync2`.

```systemverilog
// STAGE 2: 2-FF SYNCHRONIZER IN DESTINATION DOMAIN
(* ASYNC_REG = "TRUE" *) logic dest_sync1;
(* ASYNC_REG = "TRUE" *) logic dest_sync2;

always_ff @(posedge clk_dest or negedge rst_dest_n) begin
    if (!rst_dest_n) begin
        dest_sync1 <= 1'b0;
        dest_sync2 <= 1'b0;
    end else begin
        dest_sync1 <= src_toggle; // Stage 1: Traps metastability
        dest_sync2 <= dest_sync1; // Stage 2: Clean synchronized level
    end
end
```

At the output of Stage 2 (`dest_sync2`), we have a clean, stable toggle signal that transitions $0 \to 1$ or $1 \to 0$ whenever a pulse occurred in the fast domain.

---

### Stage 3: Toggle-to-Pulse Reconstruction (XOR Edge Differentiator)

Now we must execute the final step: **converting the level toggle `dest_sync2` back into a single-clock-cycle pulse `dest_pulse` in the destination clock domain.**

How do we detect when a level signal `dest_sync2` has changed state ($0 \to 1$ OR $1 \to 0$)?

We pass `dest_sync2` through a third flip-flop (`dest_sync3`) to create a 1-clock-cycle delayed version of the synchronized toggle signal, and feed both `dest_sync2` and `dest_sync3` into a **2-input XOR gate**:

```text
TOGGLE-TO-PULSE RECONSTRUCTOR SCHEMATIC

 dest_sync2 ──┬─────────────────────────────────►┌───────┐
              │                                  │ XOR   ├──► Output dest_pulse
              └──►[ D Flip-Flop 3 ]──► dest_sync3──►└───────┘    (1-Cycle Pulse!)
                  (Clock clk_dest)
```

#### Boolean Equation for Reconstructed Output Pulse:

$$
\text{dest\_pulse} = \text{dest\_sync2} \oplus \text{dest\_sync3}
$$

Where:
* $\text{dest\_pulse}$ is the reconstructed single-cycle pulse in the destination clock domain.
* $\text{dest\_sync2}$ is the synchronized toggle signal from Stage 2.
* $\text{dest\_sync3}$ is the 1-clock-cycle delayed copy of $\text{dest\_sync2}$.
* $\oplus$ represents the logical XOR operation.

#### Tracing the Edge Detector Mechanics:

Let us trace how the XOR gate evaluates during both $0 \to 1$ and $1 \to 0$ toggle transitions:

##### Case A: `dest_sync2` Transitions $0 \to 1$ (Rising Toggle Edge)
1. **Before Transition**: `dest_sync2 = 0`, `dest_sync3 = 0`.
   $$\text{dest\_pulse} = 0 \oplus 0 = 0$$
2. **Clock Cycle $K$ (`dest_sync2` rises to $1$)**:
   `dest_sync2` becomes $1$. But `dest_sync3` is a flip-flop output, so it still holds $0$ (the old value of `dest_sync2`)!
   $$\text{dest\_pulse} = 1 \oplus 0 = \mathbf{1} \quad (\text{PULSE FIRES!})$$
3. **Clock Cycle $K+1$**:
   `dest_sync3` captures the $1$ from `dest_sync2`. Now `dest_sync2 = 1` and `dest_sync3 = 1`.
   $$\text{dest\_pulse} = 1 \oplus 1 = \mathbf{0} \quad (\text{PULSE CLEARS!})$$

##### Case B: `dest_sync2` Transitions $1 \to 0$ (Falling Toggle Edge)
1. **Before Transition**: `dest_sync2 = 1`, `dest_sync3 = 1`.
   $$\text{dest\_pulse} = 1 \oplus 1 = 0$$
2. **Clock Cycle $M$ (`dest_sync2` drops to $0$)**:
   `dest_sync2` becomes $0$. `dest_sync3` still holds $1$.
   $$\text{dest\_pulse} = 0 \oplus 1 = \mathbf{1} \quad (\text{PULSE FIRES!})$$
3. **Clock Cycle $M+1$**:
   `dest_sync3` captures $0$. Now `dest_sync2 = 0` and `dest_sync3 = 0`.
   $$\text{dest\_pulse} = 0 \oplus 0 = \mathbf{0} \quad (\text{PULSE CLEARS!})$$

```text
XOR DIFFERENTIATOR RECONSTRUCTION TRACE

 clk_dest   : 0101010101010101010101010101010101010101
 dest_sync2 : 0000000000111111111111000000000000000000 (Toggle Level)
 dest_sync3 : 0000000000000011111111111100000000000000 (1-Cycle Delayed Copy)
              ────────────────────────────────────────
 dest_pulse : 0000000000111100000000111100000000000000 (XOR Output!)
                         ▲         ▲
                         │ Pulse 1 │ Pulse 2 (Both toggles create 1-cycle pulses!)
```

Look at the resulting `dest_pulse` waveform!
* Both $0 \to 1$ AND $1 \to 0$ toggle transitions produce an **exact 1-clock-cycle positive pulse (`dest_pulse = 1`)** in the destination clock domain!

The pulse was successfully passed across the asynchronous clock domain boundary without being swallowed!

---

## Complete Synthesizable Pulse Synchronizer SystemVerilog Module

Here is the complete, industrial-grade SystemVerilog module implementing a Pulse Synchronizer:

```systemverilog
`default_nettype none

// PULSE SYNCHRONIZER MODULE (FAST-TO-SLOW CDC CONTROL BUS)
// Converts a 1-cycle pulse in clk_src domain to a 1-cycle pulse in clk_dest domain.
module PulseSynchronizer (
    // Transmit Clock Domain
    input  logic clk_src,
    input  logic rst_src_n,
    input  logic src_pulse,     // 1-cycle input pulse in clk_src domain

    // Receive Clock Domain
    input  logic clk_dest,
    input  logic rst_dest_n,
    output logic dest_pulse     // 1-cycle output pulse in clk_dest domain
);

    // Stage 1: Transmit Domain Pulse-to-Toggle Converter
    logic src_toggle;

    always_ff @(posedge clk_src or negedge rst_src_n) begin
        if (!rst_src_n) begin
            src_toggle <= 1'b0;
        end else if (src_pulse) begin
            src_toggle <= ~src_toggle; // Invert level on incoming pulse
        end
    end

    // Stage 2: CDC 2-FF Synchronizer Array
    (* ASYNC_REG = "TRUE" *) logic dest_sync1;
    (* ASYNC_REG = "TRUE" *) logic dest_sync2;
    logic                  dest_sync3;

    always_ff @(posedge clk_dest or negedge rst_dest_n) begin
        if (!rst_dest_n) begin
            dest_sync1 <= 1'b0;
            dest_sync2 <= 1'b0;
            dest_sync3 <= 1'b0;
        end else begin
            dest_sync1 <= src_toggle; // Stage 1 CDC
            dest_sync2 <= dest_sync1; // Stage 2 CDC (Clean synchronized toggle)
            dest_sync3 <= dest_sync2; // Stage 3 Delay for edge detection
        end
    end

    // Stage 3: Toggle-to-Pulse Reconstruction XOR Differentiator
    assign dest_pulse = dest_sync2 ^ dest_sync3;

endmodule

`default_nettype wire
```

---

## Engineering Reality: Minimum Pulse Spacing and Back-to-Back Collisions

While the Pulse Synchronizer solves the single-pulse CDC crossing problem, physical hardware engineering introduces a critical operational boundary: **The Minimum Pulse Spacing Constraint ($\Delta t_{\text{pulse,min}}$)**.

### The Back-to-Back Pulse Collision Hazard

What happens if the fast transmit clock domain (`clk_src`) generates **two control pulses in rapid succession** (for example, Pulse 1 at $t = 1.0\text{ ns}$ and Pulse 2 at $t = 3.0\text{ ns}$)?

Let us trace the Stage 1 `src_toggle` signal when two pulses arrive rapidly:
1. At $t = 1.0\text{ ns}$, Pulse 1 arrives. `src_toggle` inverts from $0 \to 1$.
2. At $t = 3.0\text{ ns}$, Pulse 2 arrives. `src_toggle` inverts from $1 \to 0$!

Now look at what `src_toggle` did in the fast domain:
`src_toggle` rose to $1$ at $t = 1.0\text{ ns}$ and fell back to $0$ at $t = 3.0\text{ ns}$. It formed a level pulse of width $2.0\text{ nanoseconds}$!

Now, suppose the slow receiving clock domain operates at $100\text{ MHz}$ ($T_{\text{slow}} = 10.0\text{ ns}$).

The slow receiving clock samples `src_toggle` at $t = 0.0\text{ ns}$ (sees $0$) and samples again at $t = 10.0\text{ ns}$ (sees $0$).

```text
BACK-TO-BACK PULSE COLLISION HAZARD

 Fast Transmit Pulses : ──[ Pulse 1 ]──[ Pulse 2 ]─────────────────────
                             │             │
                             ▼             ▼
 Fast Toggle Line    : 00000111111111111000000000000000000000000000000
                       (Rises at 1 ns, Falls at 3 ns! Width = 2 ns)

 Slow Clock (100 MHz): 000000000000000000000000111111111111111111111111
                       ▲                       ▲
                       │ Edge at 0 ns          │ Edge at 10 ns
                       │                       │
 Slow Clock Sampling : 0                       0  (BOTH PULSES LOST!)
```

Because Pulse 2 toggled `src_toggle` back to $0$ *before* the slow clock domain sampled the $1$ level, **BOTH PULSES WERE SWALLOWED AND LOST!**

---

### Mathematical Formula for Minimum Pulse Spacing

To guarantee that every pulse is successfully captured and reconstructed by a basic Pulse Synchronizer, the time spacing $\Delta t_{\text{pulse}}$ between two consecutive transmit pulses MUST satisfy the **Minimum Pulse Spacing Constraint**:

$$
\Delta t_{\text{pulse,min}} > 2 \cdot T_{\text{dest}} + t_{\text{sync\_latency}}
$$

Where:
* $\Delta t_{\text{pulse,min}}$ is the minimum required time between the arrival of two consecutive transmit pulses.
* $T_{\text{dest}}$ is the clock period of the destination (receiving) clock domain.
* $t_{\text{sync\_latency}}$ is the total latency required for the toggle signal to propagate through the 2-FF synchronizer ($t_{\text{sync\_latency}} \approx 2 \cdot T_{\text{dest}}$).

Simplifying the rule of thumb for hardware designers:

$$
\Delta t_{\text{pulse,min}} > 3 \cdot T_{\text{dest}}
$$

> **The 3-Clock-Period Rule**: You must guarantee that incoming control pulses are separated by **at least 3 full clock periods of the destination clock domain**.

```text
MINIMUM PULSE SPACING REQUIREMENT

 Transmit Pulse 1 ──► [ Wait >= 3 * T_dest Cycles ] ──► Transmit Pulse 2
                      (Ensures receive domain fully processes Pulse 1!)
```

---

### What if Pulses Arrive Faster Than $3 \cdot T_{\text{dest}}$? (Handshake vs. Async FIFO)

If your system architecture cannot guarantee that pulses are spaced $3 \cdot T_{\text{dest}}$ apart, you CANNOT use a simple Pulse Synchronizer. You must upgrade to one of two alternative CDC architectures:

1. **Handshake-Gated Pulse Synchronizer**:
   Adds a feedback acknowledge line (`src_ready`). The transmitter sends Pulse 1 and **blocks itself** from sending Pulse 2 until the receiver sends back a $1$-bit acknowledge confirming Pulse 1 was received.
2. **Asynchronous FIFO Buffer (Asynchronous Queue)**:
   Uses a dual-port RAM with Gray-code read and write pointers. Bursty pulses are pushed into the FIFO buffer at $1.0\text{ GHz}$ and popped out at $100\text{ MHz}$ without losing a single event!

---

## Solved Industrial Engineering Exercise: High-Speed PCIe Interrupt Strobe Synchronizer

To consolidate your complete mastery of pulse synchronizer design, pulse-to-toggle conversion, 2-FF CDC synchronization, XOR edge reconstruction, and minimum pulse spacing analysis, we will now walk through a complete, step-by-step aerospace engineering problem.

---

### Scenario and Parameters

An avionics defense firm is engineering the high-speed **PCIe Interrupt Strobe Synchronizer** (`PcieInterruptSync`) for a fighter jet's flight control computer.

The module bridges two clock domains:
1. **PCIe Bus Domain (`clk_pcie`)**: Fast clock domain running at $f_{\text{pcie}} = 500\text{ MHz}$ ($T_{\text{pcie}} = 2.0\text{ ns}$).
2. **Flight Management System Domain (`clk_fms`)**: Slower receiving clock domain running at $f_{\text{fms}} = 125\text{ MHz}$ ($T_{\text{fms}} = 8.0\text{ ns}$).

```text
AVIONICS PCIE INTERRUPT STROBE SYNCHRONIZER

 PCIe Domain (clk_pcie = 500 MHz)         FMS Domain (clk_fms = 125 MHz)
 ┌────────────────────────┐  CDC Boundary  ┌────────────────────────┐
 │ PCIe Interrupt Pulse   ├───────────────►│ FMS Interrupt Strobe   │
 │ (pcie_irq, 2-ns Pulse) │                │ (fms_irq, 8-ns Pulse)  │
 └────────────────────────┘                └────────────────────────┘
```

When a radar target threat is detected, the PCIe controller emits a 1-clock-cycle positive interrupt pulse `pcie_irq` ($2.0\text{ ns}$ wide) in the $500\text{ MHz}$ domain.

The flight management system in the $125\text{ MHz}$ domain requires a clean 1-clock-cycle positive interrupt strobe `fms_irq` ($8.0\text{ ns}$ wide).

#### Physical Library Parameters:
* $f_{\text{pcie}} = 500\text{ MHz} \implies T_{\text{pcie}} = 2.0\text{ ns}$.
* $f_{\text{fms}} = 125\text{ MHz} \implies T_{\text{fms}} = 8.0\text{ ns}$.
* Flip-Flop Clock-to-Q Delay: $t_{\text{C2Q}} = 0.4\text{ ns}$.
* Flip-Flop Setup Time: $t_{\text{su}} = 0.3\text{ ns}$.

#### Your Objective

1. Calculate the minimum active pulse width $W_{\text{pulse,min}}$ required for a level-sensitive signal to cross safely into the $125\text{ MHz}$ domain, proving why direct 2-FF synchronization of `pcie_irq` fails.
2. Write the complete SystemVerilog module `PcieInterruptSync` implementing a toggle-based Pulse Synchronizer with `(* ASYNC_REG = "TRUE" *)` attributes.
3. Calculate the minimum safe pulse spacing $\Delta t_{\text{pulse,min}}$ between two consecutive PCIe interrupts.
4. Simulate the module over a complete pulse crossing event, tracing `pcie_irq`, `pcie_toggle`, `fms_sync1`, `fms_sync2`, `fms_sync3`, and `fms_irq`.
5. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Minimum Active Pulse Width for Direct CDC

Applying the CDC Nyquist Sampling Constraint for destination domain $T_{\text{fms}} = 8.0\text{ ns}$:

$$
W_{\text{pulse,min}} \ge 1.5 \cdot T_{\text{fms}} + t_{\text{su}}
$$

$$
W_{\text{pulse,min}} \ge (1.5 \times 8.0\text{ ns}) + 0.3\text{ ns} = 12.0\text{ ns} + 0.3\text{ ns} = \mathbf{12.3 \text{ ns}}
$$

##### Analysis:
* The PCIe pulse width is $T_{\text{pcie}} = 2.0\text{ ns}$.
* Required minimum width for direct level sampling is $12.3\text{ ns}$.

$$2.0\text{ ns} \ll 12.3\text{ ns} \implies \text{DIRECT SAMPLING FAILS! (Pulse will be swallowed!)}$$

Pulse-to-toggle conversion is **mandatory**.

---

#### Step 2: Calculate Minimum Safe Interrupt Pulse Spacing ($\Delta t_{\text{pulse,min}}$)

Using the 3-clock-period rule for destination domain $T_{\text{fms}} = 8.0\text{ ns}$:

$$
\Delta t_{\text{pulse,min}} > 3 \cdot T_{\text{fms}} = 3 \times 8.0\text{ ns} = \mathbf{24.0 \text{ ns}}
$$

PCIe interrupt pulses must be separated by at least **$24.0\text{ nanoseconds}$** ($12$ clock cycles of `clk_pcie`) to prevent back-to-back pulse collisions.

---

#### Step 3: Write the SystemVerilog Module (`PcieInterruptSync`)

```systemverilog
`default_nettype none

module PcieInterruptSync (
    // PCIe Transmit Domain (500 MHz)
    input  logic clk_pcie,
    input  logic rst_pcie_n,
    input  logic pcie_irq,       // 2-ns pulse in clk_pcie domain

    // FMS Receive Domain (125 MHz)
    input  logic clk_fms,
    input  logic rst_fms_n,
    output logic fms_irq         // 8-ns pulse in clk_fms domain
);

    // Stage 1: Transmit Domain Pulse-to-Toggle Converter
    logic pcie_toggle;

    always_ff @(posedge clk_pcie or negedge rst_pcie_n) begin
        if (!rst_pcie_n) begin
            pcie_toggle <= 1'b0;
        end else if (pcie_irq) begin
            pcie_toggle <= ~pcie_toggle; // Invert level on pcie_irq
        end
    end

    // Stage 2: Receive Domain 2-FF Synchronizer
    (* ASYNC_REG = "TRUE" *) logic fms_sync1;
    (* ASYNC_REG = "TRUE" *) logic fms_sync2;
    logic                  fms_sync3;

    always_ff @(posedge clk_fms or negedge rst_fms_n) begin
        if (!rst_fms_n) begin
            fms_sync1 <= 1'b0;
            fms_sync2 <= 1'b0;
            fms_sync3 <= 1'b0;
        end else begin
            fms_sync1 <= pcie_toggle; // Stage 1 CDC
            fms_sync2 <= fms_sync1;   // Stage 2 CDC (Clean toggle)
            fms_sync3 <= fms_sync2;   // Stage 3 Delay for differentiator
        end
    end

    // Stage 3: Toggle-to-Pulse Reconstruction Differentiator
    assign fms_irq = fms_sync2 ^ fms_sync3;

endmodule

`default_nettype wire
```

---

#### Step 4: Simulate a PCIe Interrupt Crossing Event

Let us trace a PCIe interrupt pulse `pcie_irq` arriving at time $t = 4.0\text{ ns}$ in the `clk_pcie` domain:

* `clk_pcie` edges ($T = 2.0\text{ ns}$): $t = 0, 2, 4, 6, 8, 10, 12, \dots$
* `clk_fms` edges ($T = 8.0\text{ ns}$): $t = 0, 8, 16, 24, 32, 40, \dots$

```text
PCIE INTERRUPT PULSE SYNCHRONIZATION TIMING TRACE

 Clock Event  │ Time (ns) │ pcie_irq │ pcie_toggle │ fms_sync1 │ fms_sync2 │ fms_sync3 │ fms_irq
──────────────┼───────────┼──────────┼─────────────┼───────────┼───────────┼───────────┼─────────
 Initial      │    0.0    │    0     │      0      │     0     │     0     │     0     │    0
 clk_pcie 2   │    4.0    │ 1 (2ns)  │      0      │     0     │     0     │     0     │    0
 clk_pcie 3   │    6.0    │    0     │  1 (TOGGLE) │     0     │     0     │     0     │    0
 clk_fms 1    │    8.0    │    0     │      1      │     1     │     0     │     0     │    0
 clk_fms 2    │   16.0    │    0     │      1      │     1     │     1     │     0     │    1  ◄── PULSE FIRES!
 clk_fms 3    │   24.0    │    0     │      1      │     1     │     1     │     1     │    0  ◄── PULSE CLEARS!
```

```text
PCIE INTERRUPT SYNCHRONIZER WAVEFORMS

 clk_pcie   : 0101010101010101010101010101010101010101 (500 MHz, T=2ns)
 pcie_irq   : 0000110000000000000000000000000000000000 (2-ns Pulse at t=4ns)
              ▲
 pcie_toggle: 0000001111111111111111111111111111111111 (Inverts to 1 and HOLDS!)

 clk_fms    : 0000000000001111111100000000111111110000 (125 MHz, T=8ns)
                          ▲               ▲
                          │ Edge at 8ns   │ Edge at 16ns
                          │               │
 fms_sync1  : 0000000000001111111111111111111111111111 (Captured at 8ns)
 fms_sync2  : 0000000000000000000000000001111111111111 (Captured at 16ns)
 fms_sync3  : 0000000000000000000000000000000000011111 (Captured at 24ns)
              ────────────────────────────────────────
 fms_irq    : 0000000000000000000000000001111000000000 (8-ns Pulse at t=16ns!)
```

##### Detailed Timing Trace Analysis:
1. **$t = 4.0\text{ ns}$ (`clk_pcie` Edge 2)**: Interrupt pulse `pcie_irq = 1` arrives.
2. **$t = 6.0\text{ ns}$ (`clk_pcie` Edge 3)**: `pcie_toggle` inverts from $0 \to 1$ and **HOLDS $1$ indefinitely**. `pcie_irq` drops to $0$.
3. **$t = 8.0\text{ ns}$ (`clk_fms` Edge 1)**: `fms_sync1` captures `pcie_toggle = 1`.
4. **$t = 16.0\text{ ns}$ (`clk_fms` Edge 2)**: `fms_sync2` captures `fms_sync1 = 1`.
   * `fms_sync3` is still $0$.
   * `fms_irq = fms_sync2 ^ fms_sync3 = 1 ^ 0 = 1` $\implies$ **`fms_irq` pulses High ($1$)!**
5. **$t = 24.0\text{ ns}$ (`clk_fms` Edge 3)**: `fms_sync3` captures $1$.
   * `fms_irq = 1 ^ 1 = 0` $\implies$ **`fms_irq` returns to $0$!**

Output `fms_irq` emitted an exact **8.0-nanosecond pulse** ($1$ full clock period of `clk_fms`).

All simulation steps, pulse extension mechanics, edge differentiators, and timing windows evaluate with 100% mathematical, physical, and logical precision. The PCIe Interrupt Pulse Synchronizer is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Toggle-Based Pulse Extension**: The fast-domain conversion mechanism ($Q_{\text{toggle}} \Leftarrow Q_{\text{toggle}} \oplus \text{Pulse}$) that transforms a 1-cycle control pulse into a persistent level toggle signal ($0 \to 1$ or $1 \to 0$), satisfying the CDC Nyquist sampling constraint ($W_{\text{pulse}} \ge 1.5 \cdot T_{\text{slow}}$) across fast-to-slow clock domain boundaries.
* **Pulse Synchronizer**: The complete three-stage CDC circuit (Toggle Generator $\to$ 2-FF Synchronizer $\to$ XOR Differentiator) that safely transfers control pulses between asynchronous clock domains, reconstructing an exact 1-cycle destination pulse ($Y_{\text{pulse}} = Q_{\text{sync2}} \oplus Q_{\text{sync3}}$) without pulse swallowing or metastability corruption.
