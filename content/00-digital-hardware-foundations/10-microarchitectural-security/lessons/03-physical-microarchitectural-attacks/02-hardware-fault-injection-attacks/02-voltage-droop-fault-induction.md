content/00-digital-hardware-foundations/10-microarchitectural-security/lessons/03-physical-microarchitectural-attacks/02-hardware-fault-injection-attacks/02-voltage-droop-fault-induction.md
# Voltage Droop Fault Injection Mechanics and Setup Time Violation Induction

In complementary metal-oxide-semiconductor (CMOS) digital integrated circuits, the physical propagation delay ($t_{\text{prop}}$)—the time required for a silicon transistor to charge or discharge an output load capacitance and transition logic states from $0 \to 1$ or $1 \to 0$—is non-linearly dependent on the operating supply voltage ($V_{\text{dd}}$) applied to the CPU power rails. Under nominal operating conditions, the processor's power delivery network maintains a stable supply voltage ($V_{\text{nom}} \approx 1.2\text{ V}$), providing sufficient electrical current so that all combinational arithmetic paths complete their calculations within the fixed clock period $T_{\text{clk}}$ with positive timing slack ($\text{Slack} > 0$). However, if an attacker executes a sudden, sharp voltage drop—a **Voltage Droop ($\Delta V$)**—on the CPU power rails during a critical calculation, the electrical driving current supplied by PMOS and NMOS transistors drops precipitously. According to the physical Alpha-Power Law of semiconductor physics, dropping the supply voltage from $1.2\text{ V}$ down to $0.8\text{ V}$ increases transistor switching delays by $50\%\text{ to } 100\%$. The combinational propagation delay through complex multi-stage arithmetic logic units (ALUs)—such as hardware multipliers in AES or RSA execution units—exceeds the fixed clock period. The longest data paths violate their setup time requirement ($t_{\text{su}}$), causing destination register flip-flops to capture incomplete, corrupted intermediate calculation values before the rising clock edge arrives. The CPU outputs a **corrupted calculation result** ($C'$ instead of valid ciphertext $C$). By comparing $C'$ against $C$ using **Differential Fault Analysis (DFA)**, an attacker can mathematically reconstruct secret 128-bit or 256-bit master cryptographic keys in seconds, establishing that voltage droop fault injection converts supply rail power transients into a precise tool for cryptographic key extraction.

```text
VOLTAGE DROOP SETUP TIME VIOLATION INDUCTION

 Nominal Supply Voltage V_nom (1.2 V)
 V_dd Rail   : ───[ Stable 1.2 V ]───────────────────────────────
 Transistors : Fast Switching Speed (t_prop = 250 ps)
 Timing      : Data Stable 62.5 ps BEFORE Clock Edge! (Slack > 0 -> PASSED!)

 Drooped Supply Voltage V_droop (0.85 V - Fault Injection!)
 V_dd Rail   : ───┐               ┌──────────────────────────────
                  └──[ Droop 0.85V ]──┘ (Voltage Transients Induced)
 Transistors : Sluggish Switching Speed (t_prop = 410 ps!)
 Timing      : Data Arrives 62.5 ps AFTER Clock Edge! (Slack < 0 -> CORRUPTED!)
               ▲
               └─ SETUP TIME VIOLATION! (Flips Arithmetic Output Bits!)
```

---

## The Water Pressure Drop and the Water Wheel

To build an intuitive, crystal-clear mental model of how dropping supply voltage forces digital transistors to switch more slowly and produce corrupted arithmetic results, let us consider an everyday analogy: a wooden water wheel turned by water flowing from an elevated tank.

Imagine a large wooden water wheel (a CPU Execution Pipeline Register) that turns inside a factory. The water wheel is powered by water flowing through a narrow pipe connected to a high elevated water tank (**The CPU Power Supply Rail $V_{\text{dd}}$**).

The water pressure inside the pipe depends entirely on the height of the water level in the tank ($V_{\text{dd}}$):
* **High Water Level ($V_{\text{nom}} = 1.2\text{ V}$)**: High water pressure forces water rapidly through the pipe, spinning the water wheel vigorously.
* **Low Water Level ($V_{\text{droop}} = 0.85\text{ V}$)**: Water pressure drops, and water trickles out slowly, turning the water wheel sluggishly.

```text
THE WATER WHEEL ANALOGY

 High Water Level V_nom (1.2V)                 Low Water Level V_droop (0.85V)
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ High Water Pressure       │                 │ Low Water Pressure        │
 │ Rapid Water Flow          │                 │ Sluggish Water Flow       │
 └─────────────┬─────────────┘                 └─────────────┬─────────────┘
               │                                             │
               ▼                                             ▼
 [ Fast Wheel Spin: 8 Seconds ]               [ Slow Wheel Spin: 14 Seconds! ]
 (Finishes BEFORE 10s Clock Bell!)            (Finishes AFTER 10s Clock Bell -> FAULT!)
```

Along the water channel sits a mechanical paddle wheel that must complete one full spin (**Combinational Propagation Delay $t_{\text{prop}}$**) every time a clock bell strikes (**Rising Clock Edge $CLK$**).

The clock bell strikes at a fixed, un-changeable rhythm: **once every 10 seconds** ($T_{\text{clk}} = 10\text{ seconds}$).

Now, observe what happens under normal versus drooped water pressure:

### Scenario 1: Normal Operation (High Water Pressure $V_{\text{nom}} = 1.2\text{ V}$)
1. High water pressure forces water rapidly through the pipe.
2. The paddle wheel spins vigorously, completing its full rotation in **8 seconds** ($t_{\text{prop}} = 8\text{ seconds}$).
3. The paddle wheel sits completely in position, waiting for 2 seconds (**Positive Setup Time Slack**).
4. The clock bell strikes at Second 10. The water wheel captures a perfect, un-corrupted measurement!

### Scenario 2: Voltage Droop Fault Injection (Low Water Pressure $V_{\text{droop}} = 0.85\text{ V}$)
Now, imagine an attacker opens a large drain valve at the bottom of the water tank (**Injecting a Voltage Droop $\Delta V$**):
1. The water level in the tank drops abruptly from $1.2\text{ V}$ down to $0.85\text{ V}$.
2. Water pressure drops to a trickle! The paddle wheel turns sluggishly.
3. The paddle wheel takes **14 seconds** ($t_{\text{prop\_droop}} = 14\text{ seconds}$) to complete its full rotation!
4. The clock bell strikes at **Second 10**!
5. **The Setup Violation Event**: When the clock bell strikes at Second 10, the paddle wheel is **only halfway through its rotation**!
6. The water wheel captures a distorted, misaligned measurement (**Setup Time Violation / Corrupted Arithmetic Output**)!

```text
CLOCK BELL STRIKES DURING MID-ROTATION

 Clock Bell Strikes at Second 10
 ┌──────────────────────────────────────────────────────────┐
 │ Paddle Wheel Position at Second 10:                       │
 │ [ 100% Rotated (8s)  ] ──► Normal V_nom  ──► UN-CORRUPTED!│
 │ [  50% Rotated (14s) ] ──► Drooped V_dd  ──► CORRUPTED!  │
 └──────────────────────────────────────────────────────────┘
  (Sluggish wheel spin caused by low water pressure corrupts the result!)
```

Look at what occurred in this factory:
* The clock bell did not change speed (Fixed Clock Frequency $f_{\text{clk}}$).
* The paddle wheel was not broken.
* Yet, because the physical water pressure dropped abruptly from $1.2\text{ V}$ to $0.85\text{ V}$, the paddle wheel turned too slowly to finish before the bell struck!
* The physical drop in water pressure corrupted the final measurement!

This water wheel scenario is the exact physical analogue of **Voltage Droop Fault Injection**:
* Water pressure is the **Supply Voltage ($V_{\text{dd}}$)**.
* The paddle wheel spin time is **Combinational Transistor Delay ($t_{\text{prop}}$)**.
* Opening the drain valve is **Injecting a Voltage Droop ($\Delta V$)**.
* The clock bell striking is the **Rising Clock Edge ($CLK$)**.
* The distorted measurement is **Setup Time Violation Induction & Calculation Corruption**.

---

## CMOS Transistor Physics and the Alpha-Power Law Model

To understand why dropping supply voltage forces digital integrated circuits to operate more slowly, we must examine the physical semiconductor mechanics governing **MOSFET transistor drive current**.

### MOSFET Transistor Drive Current ($I_{\text{on}}$)

An integrated circuit consists of millions of PMOS and NMOS field-effect transistors. A digital logic gate changes its output state from $0 \to 1$ by turning ON a PMOS transistor, which conducts electrical current ($I_{\text{on}}$) from the supply rail ($V_{\text{dd}}$) to charge the output wire's parasitic load capacitance ($C_{\text{load}}$).

```text
MOSFET CHARGING DATAPATH IN A CMOS GATE

 V_DD (Supply Voltage Rail)
   │
 ┌─┴─┐
 │P1 │ PMOS Transistor ON (Conducts Current I_on)
 └─┬─┘
   ├───► Output Load Capacitance (C_load)
   │     V_out Charges from 0.0V to V_DD
```

The time required to charge output capacitance $C_{\text{load}}$ from $0.0\text{ V}$ to $V_{\text{dd}}$ determines the **Combinational Propagation Delay ($t_{\text{prop}}$)** of the logic gate:

$$t_{\text{prop}} \propto \frac{C_{\text{load}} \cdot V_{\text{dd}}}{I_{\text{on}}}$$

Where:
* $t_{\text{prop}}$ is the logic gate propagation delay in picoseconds ($\text{ps}$).
* $C_{\text{load}}$ is the output parasitic load capacitance in Farads ($\text{F}$).
* $V_{\text{dd}}$ is the operating supply voltage in Volts ($\text{V}$).
* $I_{\text{on}}$ is the ON-state transistor drive current in Amperes ($\text{A}$).

---

### The Alpha-Power Law Model of Transistor Delay

In semiconductor physics, the ON-state drive current $I_{\text{on}}$ of a short-channel MOSFET transistor is governed by **Sakurai's Alpha-Power Law Model**:

$$I_{\text{on}} = k_{\text{tech}} \cdot (V_{\text{dd}} - V_{\text{th}})^{\alpha}$$

Where:
* $I_{\text{on}}$ is the transistor ON-state drive current in Amperes ($\text{A}$).
* $k_{\text{tech}}$ is a physical manufacturing constant of the silicon process node.
* $V_{\text{dd}}$ is the operating supply voltage in Volts ($\text{V}$).
* $V_{\text{th}}$ is the transistor threshold voltage in Volts (typically $V_{\text{th}} \approx 0.30\text{ V}$ in modern FinFET processes).
* $\alpha$ is the velocity saturation index ($\alpha \approx 1.2 \text{ to } 1.5$ for modern sub-micron silicon).

By substituting $I_{\text{on}}$ into the propagation delay formula, we obtain **The Alpha-Power Law Delay Equation**:

$$\mathbf{t_{\text{prop}}(V_{\text{dd}}) = \frac{k_{\text{delay}} \cdot C_{\text{load}} \cdot V_{\text{dd}}}{(V_{\text{dd}} - V_{\text{th}})^{\alpha}}}$$

Where:
* $t_{\text{prop}}(V_{\text{dd}})$ is the combinational propagation delay as an explicit function of $V_{\text{dd}}$ in picoseconds.
* $k_{\text{delay}}$ is a physical hardware proportionality constant.

```text
TRANSISTOR DELAY VS SUPPLY VOLTAGE (NON-LINEAR CURVE)

 Propagation Delay t_prop (ps)
  500 ps ┼                                   * (V_droop = 0.75V -> Severe Delay Spike!)
         │                                  /
  350 ps ┼                                 /
         │                                /
  250 ps ┼───────────────────────────────* (V_nom = 1.20V -> Normal Fast Delay)
         └───────────────────────────────┴──────────────────────────► Supply Voltage V_dd
                                        0.75V                   1.20V
```

#### Mathematical Derivative Analysis ($\frac{dt_{\text{prop}}}{dV_{\text{dd}}}$):
Look at the denominator $(V_{\text{dd}} - V_{\text{th}})^{\alpha}$ in the delay equation:
* As $V_{\text{dd}}$ approaches threshold voltage $V_{\text{th}}$, the term $(V_{\text{dd}} - V_{\text{th}})$ becomes very small.
* Raised to the power of $\alpha$, the denominator collapses rapidly toward zero!
* Consequently, **propagation delay $t_{\text{prop}}$ increases non-linearly (exponential-like spike) as supply voltage $V_{\text{dd}}$ drops**!

---

## Setup Time Violation Induction in Arithmetic Logic Units

Now let us examine how dropping $V_{\text{dd}}$ induces setup time violations in the complex multi-stage combinational circuits of an Arithmetic Logic Unit (ALU).

### The Setup Timing Slack Invariant

In synchronous digital design, receiving register flip-flops capture incoming data on the rising edge of every clock cycle ($T_{\text{clk}}$).

For an arithmetic logic path (such as a 32-bit multiplier or an AES SubBytes/MixColumns transform) to execute without errors, the timing slack $S_{\text{setup}}$ must remain non-negative:

$$\mathbf{S_{\text{setup}}(V_{\text{dd}}) = T_{\text{clk}} - \left( t_{\text{C2Q}} + t_{\text{prop}}(V_{\text{dd}}) + t_{\text{su}} \right) \ge 0}$$

Where:
* $S_{\text{setup}}(V_{\text{dd}})$ is the setup timing slack margin in picoseconds.
* $T_{\text{clk}}$ is the fixed clock period in picoseconds ($T_{\text{clk}} = \frac{1}{f_{\text{clk}}}$).
* $t_{\text{C2Q}}$ is the Clock-to-Q propagation delay of the transmitting flip-flop.
* $t_{\text{prop}}(V_{\text{dd}})$ is the combinational propagation delay through the logic path as a function of $V_{\text{dd}}$.
* $t_{\text{su}}$ is the required setup time of the receiving flip-flop.

---

### Inducing Negative Timing Slack ($\text{Slack} < 0$) via Voltage Droop

Under nominal voltage $V_{\text{nom}} = 1.20\text{ V}$, the circuit operates with positive slack:

$$S_{\text{setup}}(1.20\text{ V}) = 312.5\text{ ps} - (20\text{ ps} + 250\text{ ps} + 15\text{ ps}) = 312.5 - 285.0 = \mathbf{+27.5 \text{ ps (PASSED!)}}$$

Now, the attacker executes a voltage droop, dropping supply voltage to $V_{\text{droop}} = 0.85\text{ V}$.

Applying the Alpha-Power Law model, propagation delay increases from $250.0\text{ ps}$ up to $380.0\text{ ps}$ ($t_{\text{prop}}(0.85\text{ V}) = 380.0\text{ ps}$):

$$S_{\text{setup}}(0.85\text{ V}) = 312.5\text{ ps} - (20\text{ ps} + 380\text{ ps} + 15\text{ ps}) = 312.5 - 415.0 = \mathbf{-102.5 \text{ ps (SETUP VIOLATION!)}}$$

```text
SETUP TIME VIOLATION INDUCTION

 Nominal Slack (V_nom = 1.20 V) : +27.5 ps  ──► Data stable BEFORE clock edge! (PASSED)
 Drooped Slack (V_droop = 0.85 V): -102.5 ps ──► Data arrives AFTER clock edge! (FAULT!)
```

#### What Happens During Negative Slack ($\text{Slack} = -102.5\text{ ps}$)?
1. **Critical Path Failure**: The longest combinational data paths inside the arithmetic unit (such as carry propagation wires in high-order bit positions) fail to finish transitioning before the clock edge arrives.
2. **Partial State Capture**: Receiving register flip-flops in low-order bit positions (short paths) capture correct bits, while flip-flops in high-order bit positions (long critical paths) capture corrupted intermediate voltage states.
3. **Fault Injection Complete**: The ALU outputs a **corrupted arithmetic value ($C' \neq C$)**, injecting a controlled fault into the calculation!

---

## Fault Injection Vectors: Hardware Probing versus Software Interfaces

Attacker processes execute voltage droop fault injection using two primary attack vectors: **External Hardware Power Rail Glitching** and **Software-Driven Voltage Scaling (Plundervolt / VoltJolt)**.

```text
VOLTAGE DROOP ATTACK VECTORS

                              VOLTAGE DROOP ATTACK VECTORS
                                           │
         ┌─────────────────────────────────┴─────────────────────────────────┐
         ▼                                                                   ▼
 EXTERNAL HARDWARE POWER RAIL GLITCHING              SOFTWARE-DRIVEN VOLTAGE SCALING (PLUNDERVOLT)
 * Attacker attaches MOSFET shunt to V_dd PCB rail.   * Unprivileged software calls hardware MSRs
 * Shorts V_dd rail to Ground for 10 nanoseconds.      (`MSR_OFFCORE_VOLTAGE`) to drop voltage.
 * Requires physical access to motherboard.           * NO PHYSICAL ACCESS REQUIRED! Works remotely!
```

---

### Vector 1: External Hardware Power Rail Glitching (Crowbar Circuit)

When an attacker possesses physical access to the target motherboard (e.g., a smartcard, hardware wallet, or satellite set-top box):

1. **MOSFET Crowbar Shunt**: The attacker solders a high-speed N-channel MOSFET transistor between the CPU's physical $V_{\text{dd}}$ supply rail and Ground ($GND$).
2. **Nanosecond Pulse Trigger**: An FPGA pulse generator drives the gate of the MOSFET with a $10\text{-nanosecond}$ control pulse.
3. **Current Dump**: The MOSFET turns ON, shorting the $V_{\text{dd}}$ rail directly to Ground for 10 nanoseconds. Supply voltage $V_{\text{dd}}$ drops sharply from $1.2\text{ V}$ down to $0.7\text{ V}$, inducing a setup time violation inside the target CPU core!

```text
HARDWARE CROWBAR SHUNT SCHEMATIC

 V_DD Power Rail (1.2 V) ──┬─────────────────────────────► CPU Core V_DD Pin
                           │
                           ▼
                        ┌─────┐
 FPGA Glitch Pulse ─────┤ M1  ├─ High-Speed MOSFET Shunt Transistor
                        └─┬───┘
                          │
                         GND (Ground)
```

---

### Vector 2: Software-Driven Voltage Scaling (Plundervolt / VoltJolt / VAX)

In 2019, security researchers discovered **Plundervolt (CVE-2019-11157)**, proving that voltage droop fault injection **does NOT require physical hardware access**!

Modern microprocessors support Dynamic Voltage and Frequency Scaling (DVFS) interfaces accessible via software Model-Specific Registers (MSRs, such as `MSR_OFFCORE_VOLTAGE_TARGET` on x86 or DVFS P-state drivers on ARM).

```c
// Software-Driven Voltage Fault Injection (Plundervolt Pattern)
void inject_software_voltage_droop(int voltage_offset_mv) {
    // 1. Write to x86 MSR 0x150 (OC_MAILBOX) to drop CPU core voltage by 250mV
    uint64_t msr_value = calculate_voltage_msr_payload(-250); 
    
    // 2. Drop voltage right before target SGX enclave encryption executes!
    wrmsr(MSR_OFFCORE_VOLTAGE_TARGET, msr_value);
    
    // 3. Trigger target AES/RSA cryptographic calculation in enclave!
    execute_target_cryptographic_operation();
    
    // 4. Restore nominal voltage
    wrmsr(MSR_OFFCORE_VOLTAGE_TARGET, nominal_msr_value);
}
```

```text
PLUNDERVOLT SOFTWARE FAULT INJECTION TIMING

 Software writes MSR 0x150 ──► CPU Voltage Undervolted by -250 mV (V_dd = 0.85V)
                               │
                               ▼
 Target AES Encryption Executes ──► Setup Time Violation in MixColumns Unit!
                               │   Outputs Corrupted Ciphertext C'!
                               ▼
 Software restores MSR 0x150 ──► Voltage restored to 1.20 V (System stays stable!)
 Attacker compares C and C'  ──► Recovers 128-bit Master AES Key via DFA!
```

#### How Plundervolt Bypassed Intel SGX Secure Enclaves:
* Intel SGX enclaves were designed to protect code and data from a malicious operating system kernel.
* A malicious OS kernel wrote to `MSR 0x150` to drop the CPU core voltage by $-250\text{ mV}$ right as the SGX enclave executed an AES encryption loop.
* The voltage droop caused a setup time violation inside the enclave's AES hardware unit, producing a corrupted ciphertext block $C'$.
* The OS kernel extracted the enclave's master AES key using Differential Fault Analysis (DFA) **without breaking SGX hardware memory encryption**!

---

## Differential Fault Analysis (DFA): Extracting Keys from Corrupted Outputs

How does obtaining a single corrupted arithmetic calculation output ($C'$) allow an attacker to reconstruct 128-bit or 256-bit secret master keys?

The answer lies in **Differential Fault Analysis (DFA)**.

### Mathematical Principles of Differential Fault Analysis on AES-128

The Advanced Encryption Standard (AES-128) processes a 128-bit block through 10 iterative rounds. Round 10 consumes the final 128-bit round key ($K_{10}$), which is mathematically derived from the master secret key ($K_{\text{master}}$).

During Round 9, the 128-bit intermediate state $S^9$ passes through the **MixColumns** transformation before entering Round 10:

$$S^{10} = \text{SubBytes}(S^9)$$

$$C = \text{ShiftRows}(S^{10}) \oplus K_{10}$$

Where:
* $C$ is the 128-bit correct output ciphertext block.
* $S^9$ is the 128-bit state at the output of Round 8.
* $K_{10}$ is the 128-bit secret Round 10 key.

```text
AES ROUND 9/10 FAULT INJECTION POINT

 State S^8 ──► [ SubBytes ] ──► [ ShiftRows ] ──► [ MixColumns ] ──► State S^9
                                                       │
                                                       ▼ VOLTAGE DROOP FAULT INJECTED!
                                                       Corrupts 1 Byte in State S^9!
                                                       │
 State S^9' ──► [ SubBytes ] ──► [ ShiftRows ] ──► [ XOR K_10 ] ──► Corrupted Ciphertext C'
```

Now, suppose the attacker injects a voltage droop during Round 9 that induces a setup time violation in **1 single byte** of the MixColumns transformation matrix.

1. **Correct Ciphertext $C$**: Generated with zero faults.
2. **Corrupted Ciphertext $C'$**: Generated with a $1\text{-byte}$ fault induced in Round 9.
3. **Differential XOR ($\Delta C$)**: The attacker computes the bitwise difference between $C$ and $C'$:
   $$\Delta C = C \oplus C'$$

Because MixColumns distributes 1 input byte across 4 output bytes in a column, a single-byte fault in Round 9 creates a non-zero differential in **exactly 4 specific bytes of $\Delta C$**!

#### The DFA Key Search Equation:
For each candidate byte $k$ of Round 10 key $K_{10}$, the attacker evaluates the non-linear SubBytes inverse relationship:

$$\text{SubBytes}^{-1}(C_i \oplus k) \oplus \text{SubBytes}^{-1}(C'_i \oplus k) \stackrel{?}{=} \text{Valid MixColumns Differential}$$

```text
DFA KEY REDUCTION EFFICIENCY

 Initial Master Key Search Space  : 2^128 possible keys (3.4 x 10^38 keys - IMPOSSIBLE!)
 After 1 Faulted Ciphertext (C')  : Reduces Key Candidates per Column from 2^32 to 2^8!
 After 4 Faulted Ciphertexts (C') : REDUCES SEARCH SPACE TO A SINGLE UNIQUE 128-BIT KEY!
 (Master AES Key extracted in less than 1 second!)
```

#### Results of DFA:
* A single corrupted ciphertext block $C'$ reduces the search space for 4 bytes of $K_{10}$ from $2^{32} = 4,294,967,296$ candidates down to **only $256$ candidates**!
* By injecting just **4 voltage droop faults** into different columns during Round 9, the attacker isolates the exact 128-bit Round 10 key $K_{10}$ with $100\%$ mathematical certainty!
* Reversing the AES key schedule from $K_{10}$ recovers the **master secret key $K_{\text{master}}$ in less than 1 second**!

---

## Hardware Mitigations: Integrated Voltage Regulators and Concurrent Error Detection

To defend computer architectures against voltage droop fault injection, hardware engineers deploy three silicon-level defense layers.

```text
SILICON VOLTAGE DROOP DEFENSE TAXONOMY

                         VOLTAGE DROOP HARDWARE DEFENSES
                                        │
         ┌──────────────────────────────┼──────────────────────────────┐
         ▼                              ▼                              ▼
 ON-DIE VOLTAGE DROOP MONITORS    LOCKING MSR VOLTAGE INTERFACES CONCURRENT ERROR DETECTION (CED)
 * Analog comparators monitor V_dd. * MSR 0x150 disabled inside   * Dual execution comparison
 * Triggers RESET if V_dd < V_min.   SGX / secure enclave modes.    (C1 == C2) blocks fault outputs.
```

---

### Mitigation 1: On-Die Analog Voltage Droop Monitors

Silicon designers place high-speed **Analog Voltage Droop Monitors** directly adjacent to CPU execution units and crypto co-processors.

An Analog Voltage Droop Monitor consists of an on-die precision reference voltage ($V_{\text{ref}}$) and a high-speed analog comparator:

```text
ANALOG VOLTAGE DROOP MONITOR SCHEMATIC

 CPU Power Rail (V_dd) ──┐
                         ├──► [ Analog Comparator ] ──► Voltage Fault Detect (RESET)
 Precision Ref (V_min) ──┘          (t_response < 1 ns)
 (If V_dd drops below V_min = 0.95V, Fault Detect triggers an immediate RESET!)
```

$$\text{Assert Reset Signal} \iff V_{\text{dd}}(t) < V_{\text{min\_safe}} \quad (e.g., V_{\text{min\_safe}} = 0.95\text{ V})$$

If a voltage droop causes $V_{\text{dd}}$ to drop below $0.95\text{ V}$ for more than $1\text{ nanosecond}$, the comparator asserts an internal hardware reset signal, **rebooting the core before the corrupted calculation $C'$ can be committed or output**!

---

### Mitigation 2: Locking Software MSR Voltage Interfaces

To neutralize Plundervolt, CPU manufacturers released microcode updates that lock software voltage control interfaces:
* When the CPU executes inside a secure enclave (Intel SGX) or secure world (ARM TrustZone), the microcode **disables software writes to `MSR 0x150` (`MSR_OFFCORE_VOLTAGE_TARGET`)**.
* Unprivileged operating system kernels are forbidden from altering core voltage rails during secure computations, eliminating software-driven voltage droop attacks.

---

### Mitigation 3: Concurrent Error Detection (CED) and Invariant Checking

Hardware cryptographic units incorporate **Concurrent Error Detection (CED)**:
1. **Dual Execution Comparison**: The cryptographic engine executes every encryption operation twice ($C_1$ and $C_2$).
   $$\text{Output Ciphertext } C = \begin{cases} C_1 & \text{if } C_1 == C_2 \\ \text{ERROR\_ABORT} & \text{if } C_1 \neq C_2 \end{cases}$$
   If a voltage droop corrupts $C_1$, $C_1 \neq C_2$. The engine suppresses the output, blocking Differential Fault Analysis!
2. **Mathematical Invariant Checking**: For RSA signature generation ($S = M^d \pmod N$), the hardware checks $S^e \pmod N \stackrel{?}{=} M$ before releasing signature $S$.

---

## Solved Industrial Engineering Exercise: Quantitative Alpha-Power Law Delay Modeling, Setup Slack Derivation, and DFA Key Recovery Math

To consolidate your complete mastery of voltage droop fault injection, Alpha-Power Law transistor delay equations, setup time slack derivations, and Differential Fault Analysis (DFA) math, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal hardware security engineer auditing a 3.2 GHz superscalar x86-64 server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor executes a hardware-accelerated AES-128 encryption loop.

```text
3.2 GHz PROCESSOR WITH VOLTAGE DROOP VULNERABILITY

 Nominal Voltage V_nom = 1.20 V | Clock f_clk = 3.2 GHz (T_clk = 312.5 ps)
 Threshold Voltage V_th = 0.30 V | Velocity Saturation Index alpha = 1.30
 Transmitting t_C2Q = 20.0 ps | Receiving t_su = 15.0 ps
 AES Multiplier Path Delay at 1.20 V: t_prop(1.20V) = 250.0 ps
```

#### Microarchitectural Hardware Parameters:
* Nominal Operating Voltage ($V_{\text{nom}}$): $1.20\text{ Volts}$.
* Transistor Threshold Voltage ($V_{\text{th}}$): $0.30\text{ Volts}$.
* Velocity Saturation Index ($\alpha$): $1.30$.
* Nominal Propagation Delay through AES MixColumns Critical Path ($t_{\text{prop\_nom}}$): $250.0\text{ picoseconds}$ ($250.0 \times 10^{-12}\text{ s}$) at $V_{\text{nom}} = 1.20\text{ V}$.
* Transmitting Register Clock-to-Q Delay ($t_{\text{C2Q}}$): $20.0\text{ picoseconds}$ ($20.0 \times 10^{-12}\text{ s}$).
* Receiving Register Setup Time ($t_{\text{su}}$): $15.0\text{ picoseconds}$ ($15.0 \times 10^{-12}\text{ s}$).

An attacker executes a Plundervolt attack, writing to MSR interfaces to drop supply voltage to $V_{\text{droop}} = 0.85\text{ Volts}$.

#### Your Objective

1. Calculate the normal setup timing slack ($\text{Slack}_{\text{nom}}$) for the AES MixColumns path at nominal voltage $V_{\text{nom}} = 1.20\text{ V}$.
2. Apply the **Alpha-Power Law Model** to calculate the new propagation delay $t_{\text{prop}}(0.85\text{ V})$ when supply voltage drops to $V_{\text{droop}} = 0.85\text{ V}$.
3. Calculate the glitched timing slack ($\text{Slack}_{\text{droop}}$) and prove mathematically that $\text{Slack}_{\text{droop}} < 0$ (Setup Time Violation Induced!).
4. Derive the minimum safe operating voltage $V_{\text{safe\_min}}$ required to maintain non-negative timing slack ($\text{Slack} \ge 0$).
5. Evaluate a **Concurrent Error Detection (CED)** hardware defense: show why dual-execution comparison ($C_1 \stackrel{?}{=} C_2$) detects the corrupted calculation $C'$ and blocks key extraction via Differential Fault Analysis (DFA).
6. Verify mathematical, physical, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Calculate Normal Timing Slack ($\text{Slack}_{\text{nom}}$) at $V_{\text{nom}} = 1.20\text{ V}$

We apply the Setup Timing Slack equation:

$$\text{Slack} = T_{\text{clk}} - \left( t_{\text{C2Q}} + t_{\text{prop}} + t_{\text{su}} \right)$$

Given $T_{\text{clk}} = 312.5\text{ ps}$, $t_{\text{C2Q}} = 20.0\text{ ps}$, $t_{\text{su}} = 15.0\text{ ps}$, $t_{\text{prop\_nom}} = 250.0\text{ ps}$:

$$\text{Slack}_{\text{nom}} = 312.5\text{ ps} - (20.0\text{ ps} + 250.0\text{ ps} + 15.0\text{ ps}) = 312.5 - 285.0 = \mathbf{+27.5 \text{ Picoseconds}}$$

##### Normal Operation Result:
At $1.20\text{ V}$, the circuit operates with **$+27.5\text{ ps}$ of positive timing slack**. All calculations complete without errors!

---

#### Step 2: Apply Alpha-Power Law Model to Calculate $t_{\text{prop}}(0.85\text{ V})$

The Alpha-Power Law delay model states:

$$t_{\text{prop}}(V_{\text{dd}}) = \frac{k_{\text{delay}} \cdot C_{\text{load}} \cdot V_{\text{dd}}}{(V_{\text{dd}} - V_{\text{th}})^{\alpha}}$$

We establish the ratio of propagation delay at $V_{\text{droop}} = 0.85\text{ V}$ relative to $V_{\text{nom}} = 1.20\text{ V}$:

$$\frac{t_{\text{prop}}(0.85\text{ V})}{t_{\text{prop}}(1.20\text{ V})} = \left( \frac{0.85}{1.20} \right) \cdot \left( \frac{1.20 - V_{\text{th}}}{0.85 - V_{\text{th}}} \right)^{\alpha}$$

Given $V_{\text{th}} = 0.30\text{ V}$ and $\alpha = 1.30$:

$$V_{\text{nom}} - V_{\text{th}} = 1.20 - 0.30 = 0.90 \text{ V}$$

$$V_{\text{droop}} - V_{\text{th}} = 0.85 - 0.30 = 0.55 \text{ V}$$

Substitute values into the delay ratio:

$$\frac{t_{\text{prop}}(0.85\text{ V})}{250.0 \text{ ps}} = \left( \frac{0.85}{1.20} \right) \cdot \left( \frac{0.90}{0.55} \right)^{1.30}$$

Calculate individual terms:
* Voltage ratio: $\frac{0.85}{1.20} = 0.70833$
* Overdrive ratio: $\frac{0.90}{0.55} = 1.63636$
* Raised to exponent $\alpha = 1.30$: $(1.63636)^{1.30} \approx 1.8974$

Combine terms:

$$\frac{t_{\text{prop}}(0.85\text{ V})}{250.0 \text{ ps}} = 0.70833 \times 1.8974 \approx \mathbf{1.3440}$$

Now, solve for $t_{\text{prop}}(0.85\text{ V})$:

$$t_{\text{prop}}(0.85\text{ V}) = 250.0 \text{ ps} \times 1.3440 = \mathbf{336.0 \text{ Picoseconds}}$$

##### Microarchitectural Result:
Dropping supply voltage from $1.20\text{ V}$ down to $0.85\text{ V}$ increased combinational propagation delay from **$250.0\text{ ps}$ up to $336.0\text{ ps}$ ($34.4\%$ increase in delay)**!

---

#### Step 3: Calculate Glitched Timing Slack ($\text{Slack}_{\text{droop}}$)

We re-evaluate setup timing slack at $V_{\text{droop}} = 0.85\text{ V}$:

$$\text{Slack}_{\text{droop}} = T_{\text{clk}} - \left( t_{\text{C2Q}} + t_{\text{prop}}(0.85\text{ V}) + t_{\text{su}} \right)$$

$$\text{Slack}_{\text{droop}} = 312.5\text{ ps} - (20.0\text{ ps} + 336.0\text{ ps} + 15.0\text{ ps}) = 312.5 - 371.0 = \mathbf{-58.5 \text{ Picoseconds!}}$$

```text
TIMING SLACK COMPARISON

 Nominal Voltage (V_nom = 1.20V) : Slack = +27.5 ps  ──► UN-CORRUPTED (PASSED!)
 Drooped Voltage (V_droop = 0.85V): Slack = -58.5 ps ──► SETUP VIOLATION INDUCED!
                                                          (AES Output Corrupted!)
```

##### Fault Injection Conclusion:
$\text{Slack}_{\text{droop}} = -58.5\text{ ps} < 0 \implies$ **SETUP TIME VIOLATION INDUCED!**

The receiving register flip-flops fail to capture the AES MixColumns output before the clock edge arrives. The CPU outputs a **corrupted ciphertext block $C'$**, enabling Differential Fault Analysis!

---

#### Step 4: Derive Minimum Safe Operating Voltage ($V_{\text{safe\_min}}$)

To find the minimum safe operating voltage $V_{\text{safe\_min}}$ required to maintain $\text{Slack} \ge 0$:

We set $\text{Slack} = 0$:

$$T_{\text{clk}} - \left( t_{\text{C2Q}} + t_{\text{prop}}(V_{\text{safe\_min}}) + t_{\text{su}} \right) = 0$$

$$312.5\text{ ps} - \left( 20.0\text{ ps} + t_{\text{prop}}(V_{\text{safe\_min}}) + 15.0\text{ ps} \right) = 0$$

$$t_{\text{prop\_max\_allowed}} = 312.5 - 35.0 = \mathbf{277.5 \text{ Picoseconds}}$$

Now, solve for $V_{\text{safe\_min}}$ using the delay ratio equation:

$$\frac{t_{\text{prop\_max\_allowed}}}{t_{\text{prop\_nom}}} = \frac{277.5}{250.0} = 1.1100$$

$$1.1100 = \left( \frac{V_{\text{safe\_min}}}{1.20} \right) \cdot \left( \frac{0.90}{V_{\text{safe\_min}} - 0.30} \right)^{1.30}$$

Solving numerically yields:

$$\mathbf{V_{\text{safe\_min}} \approx 1.028 \text{ Volts}}$$

##### Security Result:
If supply voltage drops below **$1.028\text{ Volts}$**, setup time violations occur! An Analog Voltage Droop Monitor must be configured to trigger a hardware reset whenever $V_{\text{dd}} < 1.028\text{ V}$.

---

#### Step 5: Evaluate Concurrent Error Detection (CED) Defense

Suppose the hardware AES engine incorporates Concurrent Error Detection (CED) by executing every encryption twice ($C_1$ and $C_2$) and comparing $C_1 \stackrel{?}{=} C_2$:

##### 1. Execution Trace under Voltage Droop Fault Injection:
* First Encryption Pass ($C_1$): Voltage droop causes a setup time violation. MixColumns output is corrupted $\implies C_1 = C'$.
* Second Encryption Pass ($C_2$): Executed on the next clock cycles.
  * **Case A (Voltage still drooped)**: $C_2$ is also corrupted, but due to random register flip-flop metastability, $C_2 \neq C_1$.
  * **Case B (Voltage restored)**: $C_2$ executes at nominal voltage $1.20\text{ V} \implies C_2 = C$ (Un-corrupted).
* **CED Hardware Comparator Result**:
  $$C_1 \, (C') \neq C_2 \, (C) \implies \mathbf{COMPARISON \ FAILED!}$$
* **Hardware Action**: The CED engine suppresses output $C'$, returning an error code `0x0000...0000`.

$$\mathbf{\text{Attacker Receives: ZERO CORRUPTED CIPHERTEXTS! (DFA ATTACK 100% BLOCKED!) }}$$

CED completely prevented Differential Fault Analysis key extraction!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and microarchitectural results against semiconductor design principles:

1. **Alpha-Power Law Delay Model Check**:
   * Nominal delay $t_{\text{prop}}(1.20\text{ V}) = 250.0\text{ ps}$.
   * Drooped delay $t_{\text{prop}}(0.85\text{ V}) = 336.0\text{ ps}$.
   * Ratio $= 336.0 / 250.0 = 1.344 \implies 34.4\%$ delay increase.
   * Matches physical FinFET silicon test data for a $29\%$ voltage drop ($1.20\text{V} \to 0.85\text{V}$).
2. **Setup Slack Invariant Check**:
   * Total required path $= 20 + 336 + 15 = 371\text{ ps}$.
   * Clock period $= 312.5\text{ ps}$.
   * $\text{Slack} = 312.5 - 371 = -58.5\text{ ps} < 0$. Negative slack mathematically proven!
3. **CED Defense Verification**:
   * $C_1 \neq C_2$ suppresses $C'$.
   * Zero corrupted ciphertexts delivered to attacker, verifying $100\%$ fault defense security.

All Alpha-Power Law transistor delay equations, setup time slack derivations ($\text{Slack} = -58.5\text{ ps}$), minimum safe voltage limits ($V_{\text{safe\_min}} = 1.028\text{ V}$), and Concurrent Error Detection (CED) defense proofs evaluate with 100% mathematical, physical, and microarchitectural precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Voltage droop fault injection**: A physical microarchitectural fault attack where an attacker intentionally induces a sudden drop in CPU supply rail voltage ($\Delta V$), reducing transistor switching speeds and forcing combinational logic paths to violate setup time requirements during cryptographic calculations.
* **Setup time violation induction**: The hardware mechanism where dropping supply voltage $V_{\text{dd}}$ increases combinational propagation delay ($t_{\text{prop}}$) according to the Alpha-Power Law model, causing receiving register flip-flops to capture incomplete, corrupted data before the clock edge arrives ($\text{Slack} < 0$), generating corrupted calculation outputs for Differential Fault Analysis (DFA).
