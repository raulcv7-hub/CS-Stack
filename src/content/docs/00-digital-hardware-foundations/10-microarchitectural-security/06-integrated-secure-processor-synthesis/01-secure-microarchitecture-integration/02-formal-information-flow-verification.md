---
title: "Formal Information Flow Verification and Microarchitectural Non-Interference Proofs"
---

# Formal Information Flow Verification and Microarchitectural Non-Interference Proofs

As modern microprocessor architectures grow increasingly complex—integrating superscalar out-of-order execution pipelines, multi-level speculative branch predictors, shared cache hierarchies, and dynamic power control units—auditing Register-Transfer Level (RTL) Verilog or VHDL logic netlists for microarchitectural security leaks using manual inspection or empirical hardware testing becomes impossible. A single un-noticed logic gate connection or physical wire trace between a secret register (such as an AES key register or a kernel page table privilege bit) and a publicly observable microarchitectural component (such as an ALU early-out multiplier multiplexer, a cache set indexer, or a bus performance counter) can create a subtle, nanosecond-level timing leak that bypasses all standard functional unit tests. Empirical hardware testing can only demonstrate the presence of known security bugs under specific test cases; it can never prove the complete absence of hidden microarchitectural leakage paths across all possible execution states. To guarantee that a microprocessor silicon design contains zero microarchitectural side channels, hardware security engineers apply **Formal Information Flow Verification**. By annotating digital signals with security labels ($\text{Low}$ for public data, $\text{High}$ for secret data) and tracking the propagation of information through gate-level logic netlists using **Hardware Information Flow Tracking (IFT / SecVerilog / GLIFT)**, automated formal verification engines construct mathematical **Microarchitectural Non-Interference Proofs**. These formal proofs mathematically demonstrate that secret data can never influence publicly observable execution timing, cache state transitions, or pipeline bus signals under any possible input combination, providing absolute mathematical certainty that the processor design is physically leak-free in silicon.

```text
FORMAL INFORMATION FLOW TRACKING (IFT) NETLIST AUDIT

 Register-Transfer Level (RTL) Logic Netlist
 ┌─────────────────────────────────────────────────────────────┐
 │ Secret Register [Key_High] ──► [ Hardware Multiplier Unit ] │
 │ Public Input    [Data_Low] ──► [ Execution Scheduler     ] │
 └─────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼ Explicit Flow                 ▼ Microarchitectural Flow
 ┌─────────────────────────────┐   ┌───────────────────────────┐
 │ Shadow Logic Tag Propagation│   │ Timing Pipeline Collector │
 └─────────────┬───────────────┘   └───────────┬───────────────┘
               │                               │
               ▼                               ▼
       Does High-Security Label leak into Low-Security Output?
       [ SMT Solver (Z3 / CVC4) evaluates Non-Interference ]
                       │
             ┌─────────┴─────────┐
             │ UNSAT             │ SAT (Counterexample Found!)
             ▼                   ▼
      100% PROVEN SECURE!   TIMING LEAK IDENTIFIED IN RTL!
```


### Approach B: The Fluorescent Dye Tracker (Formal Information Flow Verification)

Instead of sampling glasses of water, factory engineers apply **Formal Information Flow Tracking (IFT)**:

1. **Injecting Fluorescent Tracking Tags (Security Labels)**: The engineers attach a fluorescent tracking property ($\tau = \text{High}$) to every molecule of liquid inside the Secret Chemical Tank. Public tap water receives a clean property ($\tau = \text{Low}$).
2. **Propagating Tags Through Logic Gates**: As liquid flows through every valve, T-junction, and mixing tank, the hardware physics enforced by the pipes automatically propagates the tracking tags:
   * If clean water ($\text{Low}$) mixes with red dye ($\text{High}$), the resulting mixture becomes **Tainted ($\text{High}$)**!
3. **Tracing All Information Flow Paths**:
   * **Explicit Leak Check**: Do any physical pipes connect the secret tank directly to the public fountain?
   * **Implicit Leak Check**: Does the control handle of the secret valve physically nudge a lever that adjusts the public fountain's valve?
   * **Microarchitectural Timing Leak Check**: Does the fluid pressure in the secret tank expand adjacent pipes, creating a pressure drop that alters the water flow velocity at the public fountain?

```text
FLUORESCENT TAG TRACKING ACROSS VALVES

 Clean Water (Low) ──┐
                     ├──► [ Mixing Valve ] ──► Tainted Mixture (HIGH!)
 Red Dye (High)    ──┘
 (Any liquid touching High data becomes Tainted High!)
```

4. **Constructing the Non-Interference Proof**:
   The engineers write a mathematical equation representing the water flow velocity at the public fountain ($V_{\text{fountain}}$) as an explicit function of public inputs ($I_{\text{Low}}$) and secret red dye inputs ($I_{\text{High}}$):

$$V_{\text{fountain}} = f(I_{\text{Low}}, I_{\text{High}})$$

Using formal mathematical solvers, the engineers prove that the partial derivative of public water velocity with respect to secret red dye input is **identically zero across all operational states**:

$$\mathbf{\frac{\partial V_{\text{fountain}}}{\partial I_{\text{High}}} \equiv 0.0000}$$

#### The Mathematical Proof Result:
The public water fountain's flow velocity and water composition are **$100\%$ mathematically independent of the secret chemical tank**!

The factory engineers have constructed a **Microarchitectural Non-Interference Proof**!

This chemical factory scenario is the exact physical analogue of **Formal Information Flow Verification**:
* The chemical factory is the **RTL CPU Logic Netlist (Verilog/VHDL)**.
* The Public Tap Water is **Public Input Data ($I_{\text{Low}}$)**.
* The Secret Red Dye is **Confidential Key Data ($I_{\text{High}}$)**.
* The Public Drinking Fountain is **Publicly Observable State / Execution Timing ($O_{\text{Low}}$)**.
* The fluorescent tracking tag is a **Hardware Security Label ($\tau \in \{\text{Low}, \text{High}\}$)**.
* Tainting liquid at mixing valves is **Information Flow Propagation through Logic Gates**.
* Proving $\frac{\partial V_{\text{fountain}}}{\partial I_{\text{High}}} \equiv 0$ is a **Formal Microarchitectural Non-Interference Proof**.


### The Three Classes of Information Flow in Hardware

When digital logic gates execute instructions, information moves through three distinct microarchitectural flow channels:

```text
THE THREE INFORMATION FLOW CLASSES IN SILICON

 1. Explicit Flow (Direct Data Assignment)
    wire_Y <= wire_X;  (Data copies directly through logic gates)

 2. Implicit Flow (Control-Flow Dependency)
    if (secret_bit_High) public_Y <= 1;  (Control logic leaks secret_bit!)

 3. Microarchitectural Flow (Timing & Resource Contention)
    ALU_Latency = f(secret_operand_High);  (Timing duration leaks operand!)
```


#### Class 2: Implicit Information Flow (Control-Flow Dependency)
An **Implicit Flow** occurs when secret data determines the execution path of a conditional control structure, altering the value of a public variable without a direct data assignment:

```verilog
// Implicit Flow Example in Verilog
always @(posedge clk) begin
    if (secret_bit_High == 1'b1) begin
        public_register_Low <= 1'b1; // Value assigned depends on secret_bit!
    end else begin
        public_register_Low <= 1'b0;
    end
end
```

* Even though `secret_bit_High` is never directly assigned to `public_register_Low`, observing `public_register_Low == 1` reveals with $100\%$ certainty that `secret_bit_High == 1`!


## Gate-Level Information Flow Tracking (GLIFT) and SecVerilog

To detect explicit, implicit, and microarchitectural information flows automatically in silicon netlists, hardware security researchers developed two primary hardware IFT paradigms: **Gate-Level Information Flow Tracking (GLIFT)** and **Language-Based Hardware IFT (SecVerilog)**.

### Gate-Level Information Flow Tracking (GLIFT)

In **Gate-Level Information Flow Tracking (GLIFT)**, every standard digital logic gate in a synthesizable netlist is augmented with a corresponding **Shadow Tracking Gate** that computes the security label propagation in parallel with the data computation.

```text
GLIFT AUGMENTED LOGIC GATE STRUCTURE

 Standard Data Computation         Shadow Label Tracking Logic
 ┌─────────────────────────┐       ┌─────────────────────────┐
 │ Data Inputs: A, B       │       │ Security Labels: A_t,B_t│
 │ Standard AND Gate       │       │ GLIFT Shadow Gate       │
 │ Output: Y = A AND B     │       │ Shadow Output: Y_t      │
 └─────────────────────────┘       └─────────────────────────┘
  (Data computes Y = A * B)         (Shadow computes Y_t = A*B_t + B*A_t + A_t*B_t)
```

Let us derive the exact Boolean logic equation for a GLIFT Shadow AND Gate:

Let $A$ and $B$ be standard 1-bit logic inputs, and let $Y = A \cdot B$ be the primary data output.

Let $A_{\tau}, B_{\tau} \in \{0, 1\}$ be the 1-bit shadow tracking labels for inputs $A$ and $B$:
* $A_{\tau} = 0 \implies \text{Input } A \text{ is } \mathbf{\text{Low (Clean / Public)}}$.
* $A_{\tau} = 1 \implies \text{Input } A \text{ is } \mathbf{\text{High (Tainted / Secret)}}$.

The shadow tracking output $Y_{\tau}$ must indicate whether output $Y$ is tainted ($Y_{\tau} = 1$):

$$\mathbf{Y_{\tau} = (A \cdot B_{\tau}) + (B \cdot A_{\tau}) + (A_{\tau} \cdot B_{\tau})}$$

Where:
* $+$ denotes the Boolean OR operator.
* $\cdot$ denotes the Boolean AND operator.

#### Let us verify the GLIFT Shadow AND Gate logic across all cases:
1. **Both Inputs Clean ($A_{\tau} = 0, B_{\tau} = 0$)**:
   $$Y_{\tau} = (A \cdot 0) + (B \cdot 0) + (0 \cdot 0) = \mathbf{0 \quad (\text{Output } Y \text{ is Clean!})}$$
2. **Input $A$ Tainted ($A_{\tau} = 1$), Input $B$ Clean ($B_{\tau} = 0$), $B = 1$**:
   $$Y_{\tau} = (A \cdot 0) + (1 \cdot 1) + (1 \cdot 0) = 0 + 1 + 0 = \mathbf{1 \quad (\text{Output } Y \text{ is Tainted!})}$$
3. **Input $A$ Tainted ($A_{\tau} = 1$), Input $B$ Clean ($B_{\tau} = 0$), BUT $B = 0$**:
   $$Y_{\tau} = (A \cdot 0) + (0 \cdot 1) + (1 \cdot 0) = 0 + 0 + 0 = \mathbf{0 \quad (\text{Output } Y \text{ is Clean!})}$$
   *(Note: If $B = 0$, $Y = A \cdot 0 \equiv 0$ regardless of $A$. The secret value $A$ cannot affect output $Y$, so GLIFT correctly evaluates $Y_{\tau} = 0$!)*


## Mathematical Definition of Microarchitectural Non-Interference

The ultimate gold standard for hardware security verification is constructing a formal mathematical proof of **Microarchitectural Non-Interference**.

### The Formal Non-Interference Theorem

Let a microprocessor core be modeled as a deterministic Finite State Machine (FSM):

$$M = (\mathcal{S}, I, O, \delta, \lambda)$$

Where:
* $\mathcal{S}$ is the set of all microarchitectural hardware states (including registers, pipeline stages, L1/L2/L3 cache line arrays, Fill Buffers, BTB tables, and GHR registers).
* $I = I_{\text{Low}} \times I_{\text{High}}$ is the input space, split into public inputs ($I_{\text{Low}}$) and secret inputs ($I_{\text{High}}$).
* $O = O_{\text{Low}} \times O_{\text{High}}$ is the output space, split into public outputs ($O_{\text{Low}}$) and secret outputs ($O_{\text{High}}$).
* $\delta: \mathcal{S} \times I \to \mathcal{S}$ is the state transition function (representing one clock cycle step of the hardware execution pipeline).
* $\lambda: \mathcal{S} \to O$ is the output observation function.

```text
FINITE STATE MACHINE EXECUTION TRACES

 Trace 1 (Secret Input High_A):
 Initial State s1 ──► [ Step 1 ] ──► [ Step 2 ] ──► Output Trace O_Low,1

 Trace 2 (Secret Input High_B):
 Initial State s2 ──► [ Step 1 ] ──► [ Step 2 ] ──► Output Trace O_Low,2
                      (s1 Low-Equivalent to s2)
```

#### Low-Equivalence Relation ($\stackrel{\text{Low}}{\equiv}$):
Two microarchitectural states $s_1, s_2 \in \mathcal{S}$ are **Low-Equivalent** ($s_1 \stackrel{\text{Low}}{\equiv} s_2$) if and only if all publicly observable components (public registers, public cache lines, execution timer states) are $100\%$ identical in both states.


### SMT/SAT Solver Verification via Counterexample Search

To prove this theorem on an actual Verilog or VHDL netlist, hardware verification engines use **Satisfiability Modulo Theories (SMT)** solvers (such as Z3, CVC4, or Yices) or Hardware Model Checkers.

The verification engine sets up a **Dual-Run Miter Circuit**:

```text
SMT SOLVER MITER VERIFICATION CIRCUIT

 Run 1: Netlist M1 (Inputs: Low_Data, High_Key_A) ──► Public Output 1
                                                             │
                                                             ▼
                                                    [ Comparator XOR ] ──► Bug Found?
                                                             ▲
 Run 2: Netlist M2 (Inputs: Low_Data, High_Key_B) ──► Public Output 2
```

1. **Dual Netlist Instantiation**: The model checker creates two identical copies of the hardware netlist ($M_1$ and $M_2$).
2. **Constraining Inputs**:
   * Set $M_1.\text{Low\_Input} = M_2.\text{Low\_Input}$ (Identical public data).
   * Set $M_1.\text{High\_Secret} \neq M_2.\text{High\_Secret}$ (Different secret keys).
3. **Asserting Non-Interference**:
   $$\text{Assert}\left( \mathbf{M_1.\text{Public\_Output} == M_2.\text{Public\_Output}} \right)$$
4. **Solving the Assertion**:
   The SMT solver searches through all $2^N$ possible physical state combinations:
   * **If SMT Solver Returns `UNSAT` (Unsatisfiable)**: No combination of secret keys can ever cause $M_1$ and $M_2$ outputs or timing to differ. **The hardware design is $100\%$ formally proven secure!**
   * **If SMT Solver Returns `SAT` (Satisfiable)**: The solver outputs a **Counterexample** showing the exact clock cycle, instruction opcode, and register value that caused a secret leak!

```text
SMT VERIFICATION OUTCOMES

 SMT Solver Result
 ┌─────────────────────────────────────────────────────────────┐
 │ UNSAT (Unsatisfiable) ──► NO LEAKS EXIST IN SILICON!        │
 │                           100% Formal Non-Interference Proof!│
 ├─────────────────────────────────────────────────────────────┤
 │ SAT   (Satisfiable)   ──► TIMING LEAK DETECTED!             │
 │                           Outputs Exact Waveform Counterex! │
 └─────────────────────────────────────────────────────────────┘
```


### The Modular Bounded Verification Solution

To verify production CPU cores (such as Open-Source RISC-V CVA6, Ibex, or BOOM cores), hardware security teams apply **Modular Bounded Verification**:

```text
MODULAR BOUNDED FORMAL VERIFICATION

 Complete CPU Core Netlist (500,000 Flip-Flops)
 ┌─────────────────────────────────────────────────────────────┐
 │ MODULAR DECOMPOSITION                                       │
 ├──────────────────────────┬──────────────────────────────────┤
 │ Module 1: ALU & Multiplier│ Verified independently with GLIFT│
 │ Module 2: Load-Store Queue│ Verified independently with IFT  │
 │ Module 3: Cache Controller│ Verified independently with SMT  │
 └──────────────────────────┴──────────────────────────────────┘
  (Verifying 3 small 1,000-state modules completes in minutes!)
```

1. **Decomposition into Security Modules**: The CPU netlist is decomposed into smaller, self-contained hardware modules (e.g., the Multiplier Module, the LSQ Module, the Cache Controller Module).
2. **Bounded Cycle Verification ($K_{\text{steps}}$)**: Instead of proving non-interference for infinite execution time, model checkers prove non-interference over a bounded window of $K$ clock cycles (e.g., $K = 50\text{ cycles}$):
   $$\mathbf{\forall t \in [0, K], \quad \lambda(s_1(t)) \downarrow_{\text{Low}} \ \equiv \ \lambda(s_2(t)) \downarrow_{\text{Low}}}$$
3. **Inductive Invariants**: The engineer proves that if the module is non-interfering for $K$ cycles, an inductive invariant guarantees non-interference for all $t > K$.

By verifying small hardware modules independently in $K$-step windows, formal verification tools complete proof evaluation in **a few minutes on standard engineering workstations**!


### Scenario and Parameters

You are a principal hardware security verification engineer auditing a 64-bit RISC-V ALU execution unit written in SecVerilog.

The ALU contains a multiplexer logic gate that selects between a Public Data Stream ($D_{\text{public\_Low}}$) and a Secret Cryptographic Key ($K_{\text{secret\_High}}$) based on a Control Signal ($S_{\text{ctrl\_Low}}$).

```text
ALU MULTIPLEXER DATA & SHADOW LOGIC CIRCUIT

 Public Data D_Low   (Label = Low  / 0) ──┐
 Secret Key  K_High  (Label = High / 1) ──┼──► [ MUX 2-to-1 Gate ] ──► Output Y
 Control Sel S_Low   (Label = Low  / 0) ──┘
```

#### Hardware Logic Equation for the 2-to-1 Multiplexer:

$$Y = (\neg S_{\text{ctrl}} \cdot D_{\text{public}}) + (S_{\text{ctrl}} \cdot K_{\text{secret}})$$

Where:
* $Y$ is the 1-bit multiplexer data output.
* $D_{\text{public}}$ is the 1-bit public data input (Security Label $\tau_D = 0 / \text{Low}$).
* $K_{\text{secret}}$ is the 1-bit secret key input (Security Label $\tau_K = 1 / \text{High}$).
* $S_{\text{ctrl}}$ is the 1-bit select signal (Security Label $\tau_S = 0 / \text{Low}$).
* $\cdot$ denotes Boolean AND, $+$ denotes Boolean OR, $\neg$ denotes Boolean NOT.

#### Your Objective

1. Derive the complete Gate-Level Information Flow Tracking (GLIFT) shadow logic equation for output security label $Y_{\tau}$ as a function of data inputs ($D, K, S$) and shadow labels ($\tau_D, \tau_K, \tau_S$).
2. Evaluate $Y_{\tau}$ under two operational states:
   * **State 1 ($S_{\text{ctrl}} = 0$)**: The multiplexer selects public data $D_{\text{public}}$. Prove mathematically that $Y_{\tau} = 0$ ($\text{Low}$).
   * **State 2 ($S_{\text{ctrl}} = 1$)**: The multiplexer selects secret key $K_{\text{secret}}$. Prove mathematically that $Y_{\tau} = 1$ ($\text{High}$).
3. Evaluate a SecVerilog assignment: Suppose a junior engineer writes `assign public_port_Low = Y;`. Show why the SecVerilog compiler raises a type error when $S_{\text{ctrl}} = 1$.
4. Formulate the SMT solver non-interference assertion query for this circuit in first-order logic. Show that when $S_{\text{ctrl}} = 1$, the SMT solver returns **`SAT` (Timing/Data Leak Detected)**, and show how setting $S_{\text{ctrl}} = 0$ returns **`UNSAT` (Proven Secure)**.
5. Verify mathematical, structural, and logical correctness.


#### Step 2: Evaluate $Y_{\tau}$ under Operational States

##### State 1: Multiplexer selects Public Data ($S_{\text{ctrl}} = 0$)
Substitute $S_{\text{ctrl}} = 0$ and $\tau_K = 1$:

$$Y_{\tau} = 0 \cdot 1 = \mathbf{0 \quad (\text{Output Label } Y_{\tau} = \text{Low / Clean!})}$$

When $S_{\text{ctrl}} = 0$, $Y = D_{\text{public}}$. The secret key $K_{\text{secret}}$ has zero influence on $Y$. Output $Y$ is **clean ($\text{Low}$)**!

##### State 2: Multiplexer selects Secret Key ($S_{\text{ctrl}} = 1$)
Substitute $S_{\text{ctrl}} = 1$ and $\tau_K = 1$:

$$Y_{\tau} = 1 \cdot 1 = \mathbf{1 \quad (\text{Output Label } Y_{\tau} = \text{High / Tainted!})}$$

When $S_{\text{ctrl}} = 1$, $Y = K_{\text{secret}}$. Output $Y$ is **tainted ($\text{High}$)**!


#### Step 4: Formulate SMT Solver Non-Interference Query

We set up a dual-run Miter circuit for the SMT solver (Z3):

* **Run 1 ($M_1$)**: Inputs $D_{\text{public}}, K_A, S_{\text{ctrl}}$. Output $Y_1 = (\neg S_{\text{ctrl}} \cdot D_{\text{public}}) + (S_{\text{ctrl}} \cdot K_A)$.
* **Run 2 ($M_2$)**: Inputs $D_{\text{public}}, K_B, S_{\text{ctrl}}$. Output $Y_2 = (\neg S_{\text{ctrl}} \cdot D_{\text{public}}) + (S_{\text{ctrl}} \cdot K_B)$.

We assert that public data is identical ($D_{\text{public}} = D_{\text{public}}$) and secret keys differ ($K_A \neq K_B$, e.g. $K_A = 0, K_B = 1$).

The SMT solver evaluates the negated non-interference assertion:

$$\text{Query: } \quad \exists D_{\text{public}}, K_A, K_B, S_{\text{ctrl}} \quad \text{such that} \quad (K_A \neq K_B) \ \mathbf{\&\&} \ (Y_1 \neq Y_2)$$

$$(\neg S_{\text{ctrl}} \cdot D + S_{\text{ctrl}} \cdot 0) \ \neq \ (\neg S_{\text{ctrl}} \cdot D + S_{\text{ctrl}} \cdot 1)$$

##### Test Case A: Force $S_{\text{ctrl}} = 1$ (Selecting Secret Key)
Substitute $S_{\text{ctrl}} = 1$:

$$(0 + 0) \ \neq \ (0 + 1) \implies 0 \neq 1 \quad (\mathbf{\text{TRUE!}})$$

The SMT solver finds a satisfying assignment ($K_A=0, K_B=1, S_{\text{ctrl}}=1 \implies Y_1=0, Y_2=1$).

$$\mathbf{\text{SMT Result: SAT (Satisfiable) \quad \implies \ SECURITY LEAK DETECTED!}}$$

##### Test Case B: Force $S_{\text{ctrl}} = 0$ (Selecting Public Data)
Substitute $S_{\text{ctrl}} = 0$:

$$(1 \cdot D + 0) \ \neq \ (1 \cdot D + 0) \implies D \neq D \quad (\mathbf{\text{FALSE! CONTRADICTION!}})$$

The SMT solver finds zero satisfying assignments ($D \neq D$ is impossible!).

$$\mathbf{\text{SMT Result: UNSAT (Unsatisfiable) \quad \implies \ 100\% FORMALLY PROVEN SECURE!}}$$

```text
SMT SOLVER VERIFICATION SUMMARY

 Test Configuration            │ SMT Query Evaluation  │ SMT Solver Result │ Hardware Security Status
───────────────────────────────┼───────────────────────┼───────────────────┼───────────────────────────
 Test Case A (S_ctrl = 1 - Key)│ 0 != 1 (Satisfiable)  │ SAT               │ LEAK DETECTED!
 Test Case B (S_ctrl = 0 - Data) D != D (Contradiction)│ UNSAT             │ 100% PROVEN SECURE!
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Information Flow Tracking (IFT / SecVerilog)**: A formal hardware verification technique that attaches security labels ($\text{Low}/\text{High}$) to digital signals in Register-Transfer Level (RTL) netlists and tracks information propagation through logic gates at compile time (SecVerilog) or gate synthesis level (GLIFT) to catch explicit, implicit, and microarchitectural security leaks.
* **Microarchitectural non-interference proof**: A mathematical proof constructed by formal SMT/SAT solvers demonstrating that two execution traces with identical public inputs ($I_{\text{Low}}$) but arbitrary secret inputs ($I_{\text{High}}$) produce $100\%$ identical publicly observable outputs and cycle-accurate execution timing ($\lambda(s_1(t)) \downarrow_{\text{Low}} \equiv \lambda(s_2(t)) \downarrow_{\text{Low}}$), proving absolute side-channel immunity in silicon.

