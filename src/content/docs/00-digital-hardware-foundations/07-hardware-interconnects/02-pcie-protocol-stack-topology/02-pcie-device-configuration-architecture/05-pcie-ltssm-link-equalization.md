---
title: "Link Training and Status State Machine (LTSSM) Architecture and Hardware Link Equalization"
---

# Link Training and Status State Machine (LTSSM) Architecture and Hardware Link Equalization

## The High-Frequency Interconnect Attenuation Collapse and Un-Trained Link Failure

In high-performance computer engineering, PCI Express (PCIe) point-to-point serial links transmit billions of binary bits per second across copper motherboard traces. As data rate requirements have expanded, PCIe transfer speeds have accelerated dramatically across generations—from $2.5\text{ Gigatransfers per second (GT/s)}$ in Gen1, to $8.0\text{ GT/s}$ in Gen3, $16.0\text{ GT/s}$ in Gen4, $32.0\text{ GT/s}$ in Gen5, and $64.0\text{ GT/s}$ in Gen6.

At $32.0\text{ GT/s}$ (PCIe Gen5), a single unit interval ($\text{UI}$)—the physical time window available to transmit one data bit—lasts a mere **$31.25\text{ picoseconds}$** ($0.03125\text{ nanoseconds}$).

However, when high-frequency differential voltage signals travel across copper circuit board traces (FR-4 dielectric materials), they encounter a severe physical obstacle: **Frequency-Dependent Electrical Attenuation**.

In copper motherboard traces, higher frequency electrical signals suffer much greater attenuation (energy absorption) than lower frequency signals:
* **Low-Frequency Signals (Long $000$ or $111$ bit streams)**: Travel through copper wires with minimal energy loss.
* **High-Frequency Signals (Rapid $010101$ bit transitions at $16\text{ GHz}$)**: Lose over **$30\text{ to } 40\text{ decibels (dB)}$ of signal amplitude** across just a few inches of motherboard traces!

```text
HIGH-FREQUENCY ATTENUATION AND INTER-SYMBOL INTERFERENCE (ISI)

 Transmitted Waveform (Clean Square Wave)
 ┌──────────┐          ┌──────────┐
 │ 11111111 │ 00000000 │ 10101010 │ (High-frequency 101010 sequence)
 └──────────┴──────────┴──────────┘
                       │
                       ▼ (30 dB High-Frequency Attenuation in Copper Trace!)
 Received Waveform (Attenuated and Blurred)
 ┌──────────┐          ┌──┐  ┌──┐
 │ 11111111 │ 00000000 │  └──┘  └─── (High-frequency 1010 bits COLLAPSE!)
 └──────────┴──────────┴──────────── (Data Eye Closed! 100% Bit Error Rate!)
```

Trace the physical hardware breakdown that occurs at the receiver:
1. When a transmitter sends a rapid $101010$ bit sequence at $32.0\text{ GT/s}$, the copper trace absorbs the high-frequency energy.
2. The voltage amplitude of the high-frequency $101010$ bits collapses toward the central reference voltage ($0.60\text{ V}$).
3. Meanwhile, long strings of identical bits ($11111111$) retain their full voltage amplitude ($1.20\text{ V}$).
4. When a $101010$ sequence follows a $11111111$ sequence, the electrical tail of the previous $11111111$ bits bleeds into the following $101010$ bits (**Inter-Symbol Interference / ISI**).
5. The physical **Data Eye Window closes completely** both vertically and horizontally. 
6. The receiver's input flip-flops sample electrical noise, resulting in a **$100\%$ Bit Error Rate ($BER$)**!

Furthermore, when a computer powers on, how do two complex silicon transceiver chips sitting on opposite ends of a motherboard—manufactured by different vendors—discover each other's presence, negotiate active lane widths ($\times 1, \times 4, \times 8, \times 16$), align their clocks, and calibrate their equalizers without crashing?

If two chips attempt to stream data at $32.0\text{ GT/s}$ without training their receivers or calibrating their electrical drivers, communication fails instantly.

To train physical links, negotiate speed step-ups, and dynamically tune electrical equalizers to open the Data Eye window, PCI Express relies on **The Link Training and Status State Machine (LTSSM)** and **Hardware Link Equalization**.


### Phase 1: The Pre-Concert Soundcheck Protocol (LTSSM State Machine)

Before the audience enters, the singer and sound engineer perform a structured **Soundcheck Protocol (The LTSSM State Machine)**:

1. **Presence Discovery (`Detect` State)**: The singer taps the microphone (*"Is this plugged in?"*). The sound engineer checks if the line is connected.
2. **Clock & Cadence Sync (`Polling` State)**: The singer sings a simple, repetitive scale (*"Do-Re-Mi-Fa-Sol..."*). The sound engineer adjusts the mixing board clock until their headphones are synchronized with the singer's tempo.
3. **Channel Width Negotiation (`Configuration` State)**: The singer and engineer agree on how many audio channels to use (Mono, Stereo, or 16-channel Surround Sound = $\times 1, \times 4, \times 16$ Lanes!).
4. **Equalizer Tuning Phase (`Recovery.Equalization` State)**: The singer and engineer adjust their tone controls until high treble notes and low bass notes arrive at the back of the hall at **the exact same volume level**!

```text
THE SOUNDCHECK PROTOCOL SEQUENCE (LTSSM)

 1. Detect        ──► Tap Mic ("Is line connected?")
 2. Polling       ──► Sing Test Scale ("Sync tempo!")
 3. Configuration ──► Agree on 16 Audio Channels (x16 Link Width)
 4. Equalization  ──► Adjust Treble/Bass Knobs until sound is crystal clear!
 5. L0 State      ──► START THE LIVE CONCERT AT FULL VOLUME!
```


## Primitive 1: The Link Training and Status State Machine (LTSSM) Architecture

Now that we possess an intuitive mental model of the concert soundcheck protocol, let us examine the formal, rigorous engineering mechanics of **The Link Training and Status State Machine (LTSSM)**.

The **LTSSM** is an 11-state master hardware state machine embedded within the Physical Layer of every PCI Express transceiver chip.

```text
LTSSM TOP-LEVEL STATE TRANSITION TOPOLOGY

                 Power-On Reset / Cold Boot
                             │
                             ▼
                      ┌──────────────┐
                      │    DETECT    │
                      └──────┬───────┘
                             │ Receiver Detected
                             ▼
                      ┌──────────────┐
                      │   POLLING    │
                      └──────┬───────┘
                             │ Clock Sync Confirmed
                             ▼
                      ┌──────────────┐
                      │CONFIGURATN   │
                      └──────┬───────┘
                             │ Link Width & Polarity Set
                             ▼
                      ┌──────────────┐
            ┌─────────┤      L0      ├─────────┐
            │         │   (Active)   │         │
            │         └──────▲───────┘         │
            │ Speed-Up       │ Re-Sync         │ Idle Power-Down
            ▼                │                 ▼
     ┌──────────────┐        │          ┌──────────────┐
     │   RECOVERY   ├────────┘          │ LOW POWER    │
     │(Equalization)│                   │ (L0s/L1/L2)  │
     └──────────────┘                   └──────────────┘
```


## Primitive 2: Hardware Link Equalization Mechanics

Now let us examine the second core primitive: **Hardware Link Equalization**.

At transfer speeds of $8.0\text{ GT/s}$ (Gen3), $16.0\text{ GT/s}$ (Gen4), $32.0\text{ GT/s}$ (Gen5), and $64.0\text{ GT/s}$ (Gen6), raw copper trace attenuation closes the physical Data Eye.

To open the Data Eye, PCIe hardware applies a three-stage equalization pipeline spanning both the transmitter and receiver:

```text
THREE-STAGE LINK EQUALIZATION PIPELINE

 TRANSMITTER SIDE (Tx)                 RECEIVER SIDE (Rx)
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │ 3-Tap FIR Equalizer       ├─ Copper ├─► CTLE Analog High-Pass   │
 │ (Pre-Cursor, Main, Post)  │  Trace  │   (Boosts High Frequencies)│
 └───────────────────────────┘         └─────────────┬─────────────┘
                                                     │
                                                     ▼
                                       ┌───────────────────────────┐
                                       │ DFE Digital Feedback      │
                                       │ (Subtracts ISI Echoes!)   │
                                       └───────────────────────────┘
```


### Standardized PCIe Transmitter Presets (P0 through P10)

To simplify negotiation, PCI-SIG defines **11 Standardized Tx Presets (P0 to P10)** with fixed $c_{-1}, c_0, c_{+1}$ values:

```text
STANDARD PCIE TX EQUALIZATION PRESETS MATRIX

 Preset Name │ Pre-Cursor c_-1 (dB) │ Post-Cursor c_+1 (dB) │ Primary Hardware Purpose
─────────────┼──────────────────────┼───────────────────────┼─────────────────────────────────────────
     P0      │       0.0 dB         │       -6.0 dB         │ High De-emphasis for long PCB traces
     P1      │       0.0 dB         │       -3.5 dB         │ Medium De-emphasis
     P4      │       0.0 dB         │        0.0 dB         │ Flat Un-equalized (Short traces)
     P5      │      2.0 dB          │       -6.0 dB         │ Pre-Shoot + High De-emphasis
     P7      │      2.0 dB          │       -6.0 dB         │ Optimal Preset for Gen4/Gen5
     P10     │     -1.5 dB          │        0.0 dB         │ Pre-Shoot Only
```


### The 4-Phase Hardware Equalization Protocol

To determine the optimal Tx Preset and Rx DFE weights for a specific motherboard trace, the LTSSM executes the **4-Phase Hardware Equalization Protocol** in the `Recovery.Equalization` state:

```text
4-PHASE EQUALIZATION HANDSHAKE PROTOCOL

 Phase 0 (Transmitter Preset Drive) ──► Host applies conservative default preset.
 Phase 1 (Link Stability Check)     ──► Endpoint verifies BER < 10^-4 at Gen4/5 speed.
 Phase 2 (Endpoint Tuning Host)     ──► Endpoint measures Data Eye, requests Tx Preset changes!
 Phase 3 (Host Tuning Endpoint)     ──► Host measures Data Eye, requests Tx Preset changes!
 (Both sides achieve optimal 10^-12 BER Data Eye opening!)
```

* **Phase 0**: Host Root Complex sets initial Tx presets on downstream lanes and notifies Endpoint.
* **Phase 1**: Endpoint verifies link stability at base speed, confirming BER $< 10^{-4}$.
* **Phase 2 (Endpoint Tunes Host)**: The Endpoint acts as the master! It measures its internal Data Eye opening, evaluates different Host Tx Presets, and commands the Host to change its $c_{-1}, c_0, c_{+1}$ coefficients until the Data Eye is fully open!
* **Phase 3 (Host Tunes Endpoint)**: The Host measures its Data Eye and commands the Endpoint to adjust its Tx Presets.

Both devices transition back to **`L0` State** at full $32.0\text{ GT/s}$ speed with a crystal-clear Data Eye!


### Scenario and Parameters

You are a senior signal integrity architect evaluating a PCIe Gen5 $\times 4$ link operating at a raw transfer rate of **$32.0\text{ GT/s}$ per lane** ($\text{UI} = 31.25\text{ ps}$).

The transmitter differential output driver operates at a peak-to-peak voltage swing $V_{\text{swing}} = 800.0\text{ mV}$ ($+400.0\text{ mV}$ to $-400.0\text{ mV}$).

```text
3.2 GHz HOST WITH PCIe GEN5 x4 LINK (32.0 GT/s)

 Host Transmitter (Gen5 3-Tap FIR) ──► 10-Inch FR-4 PCB Trace ──► Endpoint Receiver (CTLE + DFE)
 Clock T = 312.5 ps                    Nyquist Loss = -28 dB       Target BER <= 10^-12
```

#### Transmitter 3-Tap FIR Filter Coefficient Constraint:
The transmitter operates under **Preset P7**:
* Pre-Cursor Tap Coefficient: $c_{-1} = -0.0833$
* Main Cursor Tap Coefficient: $c_0 = +0.7500$
* Post-Cursor Tap Coefficient: $c_{+1} = -0.1667$

Note that $|c_{-1}| + |c_0| + |c_{+1}| = |-0.0833| + |+0.7500| + |-0.1667| = 1.0000$ (normalized).

#### Channel Loss Parameters:
* Motherboard trace Nyquist attenuation at $16\text{ GHz} = -28.0\text{ dB}$.
* Un-equalized Data Eye Height at Receiver input $= 0.0\text{ mV}$ (**Data Eye completely closed / $100\%$ BER failure**).

#### Your Objective

1. Calculate the peak transition voltage $V_{\text{trans}}$ ($0 \to 1$ transition) and the de-emphasized steady-state voltage $V_{\text{steady}}$ ($1 \to 1 \to 1$ repeated bits) generated by the 3-tap FIR filter under Preset P7.
2. Calculate the exact **De-Emphasis Ratio ($\text{DE}_{\text{dB}}$)** and **Pre-Shoot Ratio ($\text{PS}_{\text{dB}}$)** in decibels ($\text{dB}$) for Preset P7.
3. Trace the step-by-step LTSSM state transitions during cold boot-up:
   `Detect` $\to$ `Polling` $\to$ `Configuration` $\to$ `L0 (2.5 GT/s)` $\to$ `Recovery` $\to$ `Recovery.Equalization` (Phases 0–3) $\to$ `L0 (32.0 GT/s)`.
4. The receiver applies CTLE (+12.0 dB high-pass boost) and an 8-tap DFE filter ($w_1 = 45\text{ mV}, w_2 = 20\text{ mV}$). Calculate the final restored Data Eye Height $V_{\text{eye\_restored}}$ at the receiver sampler, confirming timing closure ($\ge 50.0\text{ mV}$).
5. Verify mathematical, structural, and timing correctness.


##### 4. Calculate De-Emphasis Ratio ($\text{DE}_{\text{dB}}$):

$$\text{DE}_{\text{dB}} = 20 \cdot \log_{10}\left( \frac{V_{\text{steady}}}{V_{\text{trans}}} \right) = 20 \cdot \log_{10}\left( \frac{400.0\text{ mV}}{800.0\text{ mV}} \right) = 20 \cdot \log_{10}(0.5000)$$

$$\text{DE}_{\text{dB}} = 20 \times (-0.30103) = \mathbf{-6.02 \text{ dB De-Emphasis}}$$

##### 5. Calculate Pre-Shoot Ratio ($\text{PS}_{\text{dB}}$):

$$\text{PS}_{\text{dB}} = 20 \cdot \log_{10}\left( \frac{V_{\text{preshoot}}}{V_{\text{steady}}} \right) = 20 \cdot \log_{10}\left( \frac{666.72\text{ mV}}{400.0\text{ mV}} \right) = 20 \cdot \log_{10}(1.6668)$$

$$\text{PS}_{\text{dB}} = 20 \times (+0.22188) = \mathbf{+4.44 \text{ dB Pre-Shoot}}$$

```text
PRESET P7 VOLTAGE WAVEFORM SUMMARY

 Transition Voltage V_trans   : 800.0 mV  (Full peak swing on 0 -> 1)
 Steady-State Voltage V_steady: 400.0 mV  (De-emphasized by -6.02 dB)
 Pre-Shoot Voltage V_preshoot : 666.7 mV  (Pre-shoot boost +4.44 dB)
```


#### Step 3: Calculate Restored Data Eye Height at Receiver Sampler

* Channel Nyquist Loss $= -28.0\text{ dB}$.
* Tx Preset P7 High-Frequency Boost $= +6.02\text{ dB}$.
* Rx CTLE High-Pass Gain $= +12.00\text{ dB}$.
* Net High-Frequency Attenuation = $-28.0 + 6.02 + 12.00 = \mathbf{-9.98 \text{ dB}}$.

Calculate raw voltage reaching the receiver input before DFE:

$$V_{\text{rx\_input}} = V_{\text{swing}} \cdot 10^{\frac{-9.98}{20}} = 800\text{ mV} \cdot 10^{-0.499} = 800\text{ mV} \cdot 0.3169 \approx \mathbf{253.5 \text{ mV}}$$

Now, subtract Inter-Symbol Interference (ISI) echo voltages using the 2-tap DFE filter ($w_1 = 45.0\text{ mV}, w_2 = 20.0\text{ mV}$):

$$\text{Total DFE ISI Cancellation} = 2 \times (w_1 + w_2) = 2 \times (45.0 + 20.0) = \mathbf{130.0 \text{ mV}}$$

Calculate final restored vertical Data Eye Height $V_{\text{eye\_restored}}$:

$$V_{\text{eye\_restored}} = V_{\text{rx\_input}} - \text{Remaining Un-cancelled ISI}$$

Assuming DFE cancels $130.0\text{ mV}$ of ISI distortion, the restored Data Eye opening is:

$$V_{\text{eye\_restored}} \approx \mathbf{123.5 \text{ Millivolts}}$$

```text
DATA EYE RESTORATION SUMMARY

 Un-Equalized Data Eye Height :   0.0 mV  (Data Eye 100% CLOSED -> BER = 100%)
 After Tx Preset P7 + CTLE    : 253.5 mV  (High-frequency boost applied)
 After Rx DFE ISI Cancellation: 123.5 mV  (DATA EYE FULLY OPENED!)
 Target Threshold             : >= 50.0 mV (PASSED WITH +73.5 mV MARGIN!)
```

##### Conclusion:
Combining **Tx Preset P7 (-6.02 dB De-Emphasis)**, **Rx CTLE (+12.0 dB Boost)**, and **2-tap DFE ($130\text{ mV}$ ISI cancellation)** opened the physical Data Eye from $0\text{ mV}$ (total failure) to **$123.5\text{ Millivolts}$**, achieving timing closure with a $10^{-12}\text{ BER}$ at $32.0\text{ GT/s}$!


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Link Training and Status State Machine (LTSSM)**: The 11-state physical layer hardware state machine (`Detect` $\to$ `Polling` $\to$ `Configuration` $\to$ `L0` $\to$ `Recovery`) that manages receiver discovery, clock locking, lane width negotiation, polarity inversion correction, and multi-phase equalization handshakes.
* **Link Equalization**: The three-stage signal-shaping pipeline—3-tap Transmitter FIR filtering (Pre-shoot $c_{-1}$, De-emphasis $c_{+1}$), Receiver CTLE high-pass boosting, and Rx Decision Feedback Equalization (DFE)—that flattens high-frequency copper trace attenuation to open the physical Data Eye at transfer speeds of $16.0\text{ GT/s} +$.
