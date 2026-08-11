---
title: "Voltage Droop Fault Injection Mechanics and Setup Time Violation Induction"
---

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


### Mitigation 2: Locking Software MSR Voltage Interfaces

To neutralize Plundervolt, CPU manufacturers released microcode updates that lock software voltage control interfaces:
* When the CPU executes inside a secure enclave (Intel SGX) or secure world (ARM TrustZone), the microcode **disables software writes to `MSR 0x150` (`MSR_OFFCORE_VOLTAGE_TARGET`)**.
* Unprivileged operating system kernels are forbidden from altering core voltage rails during secure computations, eliminating software-driven voltage droop attacks.


## Solved Industrial Engineering Exercise: Quantitative Alpha-Power Law Delay Modeling, Setup Slack Derivation, and DFA Key Recovery Math

To consolidate your complete mastery of voltage droop fault injection, Alpha-Power Law transistor delay equations, setup time slack derivations, and Differential Fault Analysis (DFA) math, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Normal Timing Slack ($\text{Slack}_{\text{nom}}$) at $V_{\text{nom}} = 1.20\text{ V}$

We apply the Setup Timing Slack equation:

$$\text{Slack} = T_{\text{clk}} - \left( t_{\text{C2Q}} + t_{\text{prop}} + t_{\text{su}} \right)$$

Given $T_{\text{clk}} = 312.5\text{ ps}$, $t_{\text{C2Q}} = 20.0\text{ ps}$, $t_{\text{su}} = 15.0\text{ ps}$, $t_{\text{prop\_nom}} = 250.0\text{ ps}$:

$$\text{Slack}_{\text{nom}} = 312.5\text{ ps} - (20.0\text{ ps} + 250.0\text{ ps} + 15.0\text{ ps}) = 312.5 - 285.0 = \mathbf{+27.5 \text{ Picoseconds}}$$

##### Normal Operation Result:
At $1.20\text{ V}$, the circuit operates with **$+27.5\text{ ps}$ of positive timing slack**. All calculations complete without errors!


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


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Voltage droop fault injection**: A physical microarchitectural fault attack where an attacker intentionally induces a sudden drop in CPU supply rail voltage ($\Delta V$), reducing transistor switching speeds and forcing combinational logic paths to violate setup time requirements during cryptographic calculations.
* **Setup time violation induction**: The hardware mechanism where dropping supply voltage $V_{\text{dd}}$ increases combinational propagation delay ($t_{\text{prop}}$) according to the Alpha-Power Law model, causing receiving register flip-flops to capture incomplete, corrupted data before the clock edge arrives ($\text{Slack} < 0$), generating corrupted calculation outputs for Differential Fault Analysis (DFA).
