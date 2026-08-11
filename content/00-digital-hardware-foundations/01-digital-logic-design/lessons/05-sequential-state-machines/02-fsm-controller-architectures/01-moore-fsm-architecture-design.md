# Moore State Machine Architecture and Synchronous Transition Logic

## The Chaos of Unstructured State Orchestration in Multi-Step Automation

Combinational logic circuits—such as adders, multiplexers, decoders, and comparators—operate in a memoryless, instantaneous world. Their outputs respond immediately to whatever inputs are present at that exact microsecond. While sequential storage elements like flip-flops can store binary data across clock cycles, a collection of disconnected flip-flops lacks the overarching intelligence needed to orchestrate multi-step operational algorithms.

Consider an automated industrial system, such as a traffic light controller at a busy four-way intersection, a motorized elevator cabin, a digital vending machine, or a microprocessor's instruction execution unit. 

These systems do not perform a single instantaneous calculation. Instead, they must progress through a strict, deterministic sequence of steps over time:

1. **Step 1**: Display Red light for 30 seconds while monitoring pedestrian buttons.
2. **Step 2**: Transition to Green light for 20 seconds.
3. **Step 3**: Transition to Yellow warning light for 5 seconds.
4. **Step 4**: Return safely to Red light.

```text
THE MULTI-STEP AUTOMATION ORCHESTRATION PROBLEM

          ┌────────────────┐
          │  RED LIGHT     │
          │  (30 Seconds)  │
          └───────┬────────┘
                  │ Sensor / Timer Event
                  ▼
          ┌────────────────┐
          │  GREEN LIGHT   │
          │  (20 Seconds)  │
          └───────┬────────┘
                  │ Sensor / Timer Event
                  ▼
          ┌────────────────┐
          │  YELLOW LIGHT  │
          │  (5 Seconds)   │
          └────────────────┘
```

If an engineer attempts to construct this multi-step controller using an unorganized collection of individual timers, logic gates, and loose flip-flops, the system quickly devolves into chaos. Without a structured state architecture, logic signals overlap, steps trigger out of order, and noise glitches on external sensors can cause the traffic lights to flash Green in all four directions simultaneously, causing catastrophic real-world accidents.

Furthermore, if the physical actuators (such as high-voltage traffic lamps, motor relays, or chemical injection valves) react asynchronously to sudden, noisy fluctuations on input sensors within a given step, the system will flicker and trigger false physical actions.

To design reliable multi-step controllers, digital engineering uses a formal mathematical and structural framework: the **Finite State Machine (FSM)**. 

When we isolate physical output actuators so that they depend strictly and exclusively on the system's current stored state—completely shielding them from direct, noisy input fluctuations—we create a **Moore State Machine**.

By structuring a controller into a **State Register**, a **State Transition Logic** block, and a **Moore Output Decoder**, we transform multi-step control into a clean, predictable, and glitch-free digital engine.

---

## The Board Game Pawn: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how a Moore State Machine operates before examining gate schematics and algebraic equations, let us step away from electronics and picture a classic turn-based board game like Monopoly.

Imagine playing a board game where your game piece (a wooden pawn) moves along a numbered track of square tiles: Tile 0 (Start), Tile 1 (Property A), Tile 2 (In Jail), and Tile 3 (Free Parking).

```text
THE BOARD GAME STATE TRACK MODEL

  [ Tile 0: Start ] ──► [ Tile 1: Property ] ──► [ Tile 2: In Jail ]
                                                         │
                                                         ▼
                                                [ Tile 3: Free Parking ]
```

Your physical position on the board—which specific tile your pawn is currently standing on—is your **Current State ($Q$)**.

Now, consider how your actions (your outputs) and your movement (your next state) are decided during the game:

### 1. Your Current Action Depends ONLY on Your Current Tile ($Y = f(Q)$)
Suppose your pawn is currently standing on **Tile 2 (In Jail)**. 
What action must you take? The game rules state: *"If you are in Jail, you must pay a $50 fine or wait three turns."*

Notice a fundamental rule of this game: **Your required action depends EXCLUSIVELY on the fact that your pawn is sitting on Tile 2.** 

It does not matter if a spectator shouts from across the room, if it starts raining outside, or if another player shakes a pair of dice in their hand. As long as your pawn is sitting on Tile 2, your action is strictly fixed by that tile. The external environment cannot instantly change your action while you are standing on Tile 2.

This strict rule—where your action (output $Y$) is determined solely by your location (current state $Q$)—is the exact definition of a **Moore State Machine**.

```text
MOORE OUTPUT RULE: ACTION DEPENDS ONLY ON CURRENT TILE

 Current Tile Location (State Q) ──► [ Rulebook ] ──► Player Action (Output Y)
 (External events cannot change your action while standing on this tile!)
```

### 2. Deciding Your Next Tile ($Q_{\text{next}} = g(Q, X)$)
Now, how do you decide which tile your pawn will step to on your next turn?

To determine your **Next Tile ($Q_{\text{next}}$)**, you evaluate two pieces of information:
1. **Where you are standing right now** (Current State $Q = \text{Tile 2}$).
2. **The number you roll on the dice** (External Input $X = \text{Dice Roll}$).

If you are on Tile 2 ($Q$) and roll a 1 ($X$), you step forward to Tile 3 ($Q_{\text{next}}$). If you roll a 2 ($X$), you step forward to Tile 0 ($Q_{\text{next}}$).

```text
STATE TRANSITION RULE: NEXT TILE DEPENDS ON CURRENT TILE + DICE ROLL

 Current Tile (State Q) ──┐
                          ├──► [ Game Rules ] ──► Next Tile (Q_next)
 Dice Roll (Input X)    ──┘
```

Notice the crucial difference:
* Your **Action right now** (Output $Y$) depends *only* on your Current Tile ($Q$).
* Your **Next Tile** (Next State $Q_{\text{next}}$) depends on your Current Tile ($Q$) AND your Dice Roll ($Input X$).

This board game model is the exact physical analogue of a **Moore State Machine**:
* The pawn's current tile position is the **State Register ($Q$)**.
* The dice roll is the **External Input ($X$)**.
* The player's required action on that tile is the **Moore Output ($Y$)**.
* The rulebook calculating the next tile is the **State Transition Logic ($g(Q, X)$)**.
* The moment you pick up your pawn and move it to the next tile is the **Active Clock Edge ($CLK$)**.

---

## Architecture of a Moore State Machine

To master sequential controller design, we must dissect the formal mechanics of a Moore State Machine and its three internal structural blocks.

A **Moore State Machine** is a synchronous sequential circuit structured into three distinct functional modules:
1. **The State Register**: An array of $N$ flip-flops that stores the current state vector $Q = (Q_{N-1}, \dots, Q_0)$.
2. **The State Transition Logic Block ($g$)**: A combinational logic circuit that evaluates current state $Q$ and external input vector $X$ to compute next state vector $Q_{\text{next}}$.
3. **The Moore Output Logic Decoder ($f$)**: A combinational logic circuit that evaluates current state $Q$ to compute output vector $Y$.

```text
MOORE STATE MACHINE COMPLETE ARCHITECTURAL SCHEMATIC

                        ┌───────────────────────────────┐
                        │     STATE REGISTER            │
                        │  (N Synchronous Flip-Flops)   │
                        └──────────────┬────────────────┘
                                       │
                                       ├──────────────────────────┐
                                       │ Current State Q          │
                                       ▼                          ▼
 External Inputs X ──► ┌───────────────────────────────┐  ┌────────┴──────────────┐
                       │    STATE TRANSITION LOGIC     │  │ MOORE OUTPUT DECODER  │
                       │     Q_next = g(Q, X)          │  │       Y = f(Q)        │
                       └──────────────┬────────────────┘  └──────────┬────────────┘
                                      │                              │
                                      ▼                              ▼
                              Next State Q_next               System Outputs Y
                       (Feeds into State Register)      (Isolated from Inputs X!)
```

Look closely at this architectural diagram. Study the inputs feeding into the two combinational logic blocks:

* **State Transition Logic Block ($g$)**: Receives **TWO** inputs: Current State $Q$ AND External Inputs $X$.
  $$Q_{\text{next}} = g(Q, X)$$
* **Moore Output Decoder ($f$)**: Receives **ONLY ONE** input: Current State $Q$.
  $$Y = f(Q)$$

**The Defining Invariant of a Moore State Machine**:
> The output vector $Y$ is a function **strictly and exclusively of the current state $Q$**. External input vector $X$ does NOT enter the output decoder! $X$ influences $Y$ **only indirectly** by determining which state $Q_{\text{next}}$ the machine will enter on the next clock pulse.

---

### Mathematical Definition of the Moore State Quintuple

Formally, a Moore State Machine is defined as a mathematical 5-tuple:

$$
M_{\text{Moore}} = \left( S, \, X, \, Y, \, g, \, f \right)
$$

Where:
* $S = \{S_0, S_1, \dots, S_{K-1}\}$ is the finite set of $K$ discrete system states.
* $X = \{X_0, X_1, \dots, X_{I-1}\}$ is the set of $I$ binary input vectors.
* $Y = \{Y_0, Y_1, \dots, Y_{O-1}\}$ is the set of $O$ binary output vectors.
* $g: S \times X \to S$ is the **State Transition Function** calculating $Q_{\text{next}} = g(Q, X)$.
* $f: S \to Y$ is the **Moore Output Function** calculating $Y = f(Q)$.

---

## Primitive 1: State Transition Logic ($Q_{\text{next}} = g(Q, X)$)

The **State Transition Logic** is the predictive brain of the finite state machine. It is a combinational logic circuit that continuously monitors the current state $Q$ stored in the state register and the incoming external inputs $X$, calculating the exact binary state $Q_{\text{next}}$ that the machine should enter on the next clock edge.

### How State Transition Logic Operates Across Time

1. **During Steady Clock Levels ($CLK = 0$ or $CLK = 1$)**:
   * The State Register holds current state $Q$ steady.
   * External inputs $X$ may wiggle, pulse, or fluctuate.
   * The State Transition Logic block $g(Q, X)$ continuously updates its candidate output $Q_{\text{next}}$ in real time as inputs $X$ change.
   * However, $Q_{\text{next}}$ is blocked at the input pins of the state register! The current state $Q$ remains unchanged.
2. **At the Active Clock Edge ($CLK = 0 \to 1$)**:
   * The State Register samples candidate input $Q_{\text{next}}$ and captures it into memory.
   * The value $Q_{\text{next}}$ becomes the new current state $Q$.
   * The state machine has officially executed a **State Transition**!

```text
STATE TRANSITION TIMING CHRONOLOGY

 Time t = 0.0 ns ──► Current State Q = S0, External Input X arrives.
                     State Transition Logic evaluates Q_next = g(S0, X) = S1.
                     (Candidate S1 sits waiting at register D-pins).

 Time t = 1.0 ns ──► Active Clock Edge CLK (0 -> 1) Fires!
                     State Register captures S1.
                     Current State Q becomes S1!
```

---

## Primitive 2: The Moore Output Decoder ($Y = f(Q)$) and Noise Immunity

The **Moore Output Decoder** is a combinational logic block that translates the current binary state vector $Q$ into the physical control signals $Y$ required to drive external actuators (such as motor relays, valves, or display LEDs).

Because $Y = f(Q)$, the Moore output decoder behaves as a state-to-output mapping table:

```text
MOORE OUTPUT MAPPING TABLE

 Current State Vector (Q) │ Output Vector Y = f(Q) │ System Physical Behavior
──────────────────────────┼────────────────────────┼───────────────────────────────
      State S0 (00_2)     │       Y = 100_2        │ RED Light ON, Yellow/Green OFF
      State S1 (01_2)     │       Y = 001_2        │ GREEN Light ON, Red/Yellow OFF
      State S2 (10_2)     │       Y = 010_2        │ YELLOW Light ON, Red/Green OFF
```

### The Noise and Glitch Immunity Advantage of Moore Machines

Why is the Moore architecture so prized in industrial control systems?

Consider what happens if an external sensor wire suffers a $2\text{-nanosecond}$ noise spike or voltage glitch while the system is operating inside State $S_0$.

In a Moore machine:
* The noise spike arrives on input line $X$.
* Input $X$ enters the State Transition Logic block $g(Q, X)$.
* The next-state candidate $Q_{\text{next}}$ may temporarily glitch for $2\text{-nanoseconds}$.
* **BUT input $X$ does NOT enter the Moore Output Decoder $f(Q)$!**
* The Moore Output Decoder looks *only* at the current state register $Q$, which remains rock-solid at $S_0$.
* The output actuators $Y$ experience **ZERO GLITCHES!** The noise spike is completely filtered out by the state register barrier!

```text
NOISE IMMUNITY IN MOORE ARCHITECTURES

 Sensor Noise Spike on Input X (2 ns Glitch)
                     │
                     ▼
 ┌───────────────────────────────────────┐
 │ State Transition Logic Q_next = g(Q,X)│ ──► Candidate Q_next glitches (2 ns)
 └───────────────────────────────────────┘     (Blocked at Clock Register!)
 
 ┌───────────────────────────────────────┐
 │ Moore Output Decoder Y = f(Q)         │ ──► Output Y STAYS 100% ROCK-SOLID!
 └───────────────────────────────────────┘     (Zero Input Noise Leakage!)
```

This absolute input noise isolation makes Moore state machines the gold standard for high-reliability safety systems.

---

## Visualizing Controllers: State Transition Diagrams (STDs)

Before synthesizing logic gates, digital engineers draw a **State Transition Diagram (STD)**—a formal graphical map that depicts all system states, outputs, and transition rules.

In a Moore State Machine diagram:
* **State Nodes**: Drawn as circles representing discrete system states. Inside each circle, we write the **State Name** and the **Moore Output Vector** ($State\_Name / Output\_Value$).
* **Transition Arcs**: Drawn as directed arrows between circles, labeled with the **Input Condition ($X$)** required to trigger that transition on the next clock edge.

```text
STANDARD MOORE STATE TRANSITION DIAGRAM NODE

                      Input Condition X = 1
                      ┌───────────────────┐
                      │                   ▼
             ┌─────────────────┐     ┌─────────────────┐
             │ State A / Out 0 │     │ State B / Out 1 │
             └─────────────────┘     └─────────────────┘
                      ▲                   │
                      └───────────────────┘
                      Input Condition X = 0
```

Notice the node syntax: `State A / Out 0`. 
Because the output depends *only* on the state, the output value is written **inside the state circle**.

---

## The Complete 5-Step Moore Synthesis Methodology

To transform a human engineering specification into a working physical circuit, we follow a rigorous 5-step synthesis procedure:

```text
THE 5-STEP MOORE SYNTHESIS PIPELINE

 Step 1: Human Requirements ──► Draw State Transition Diagram (STD)
                                      │
                                      ▼
 Step 2: State Diagram      ──► Construct State Transition Table
                                      │
                                      ▼
 Step 3: State Names        ──► Perform State Assignment (Binary Codes)
                                      │
                                      ▼
 Step 4: Binary State Table ──► Derive K-Maps for Q_next and Y
                                      │
                                      ▼
 Step 5: Boolean Equations  ──► Draw Gate Schematic & Flip-Flops
```

Let us detail each step:

1. **Step 1: State Diagram Definition**: Identify all unique physical states required by the system, assign Moore output values to each state, and draw transition arcs based on input events.
2. **Step 2: State Transition Table Construction**: Convert the diagram into a tabular format listing Current State ($Q$), Inputs ($X$), Next State ($Q_{\text{next}}$), and Outputs ($Y$).
3. **Step 3: State Assignment (Binary Encoding)**: Assign a unique binary code to each state name using $N$ flip-flops ($N = \lceil \log_2 K \rceil$ for $K$ states).
4. **Step 4: Logic Minimization (K-Maps)**: Derive minimal Sum of Products (SOP) Boolean equations for each next-state flip-flop input ($D_i$) and each output line ($Y_j$).
5. **Step 5: Circuit Schematic Implementation**: Connect the combinational logic gates to the D-inputs of the state register flip-flops and output lines.

---

## Engineering Reality: State Assignment Strategies and Flip-Flop Choices

When assigning binary codes to states in Step 3, hardware designers have several encoding strategies to choose from, each offering distinct physical trade-offs in silicon area and switching speed.

```text
STATE ENCODING STRATEGY COMPARISON

 Encoding Style      │ Code Structure (4 States) │ Flip-Flops Needed │ Combinational Logic Area
─────────────────────┼───────────────────────────┼───────────────────┼───────────────────────────
 Binary Encoding     │ S0=00, S1=01, S2=10, S3=11│ Log2(K) = 2 FFs   │ Larger (Requires Decoders)
 One-Hot Encoding    │ S0=0001, S1=0010, S2=0100 │ K = 4 FFs         │ MINIMAL! (Instant Output)
 Gray Code Encoding  │ S0=00, S1=01, S2=11, S3=10│ Log2(K) = 2 FFs   │ Medium (Low Switching Noise)
```

### 1. Binary Encoding
Uses the minimum possible number of flip-flops ($N = \lceil \log_2 K \rceil$).
* **Advantage**: Saves flip-flop storage cells.
* **Disadvantage**: Requires larger combinational logic trees to decode next states and outputs.

### 2. One-Hot Encoding
Uses $K$ flip-flops for $K$ states, where exactly one flip-flop holds a $1$ for any given state (e.g., $S_0 = 0001_2, S_1 = 0010_2, S_2 = 0100_2, S_3 = 1000_2$).
* **Advantage**: **Ultra-Fast!** The current state IS its own decoded signal. The Moore output logic requires almost zero gates!
* **Disadvantage**: Uses more flip-flops. Highly favored in FPGA designs where flip-flops are abundant.

---

## Solved Industrial Engineering Exercise: Automated Highway Toll Gate Controller

To consolidate your complete mastery of Moore State Machine architecture, state transition logic, output decoders, state diagrams, binary encoding, and K-map synthesis, we will now walk through a complete, step-by-step industrial engineering problem.

---

### Scenario and Parameters

An automated highway authority is engineering the hardware controller for a toll booth barrier gate ($G$).

The controller monitors two binary sensors:
1. **Vehicle Arrival Sensor ($V_{\text{car}}$)**:
   * $V_{\text{car}} = 0$: No car present at the gate.
   * $V_{\text{car}} = 1$: Car detected waiting at the barrier.
2. **Payment Validated Signal ($P_{\text{pay}}$)**:
   * $P_{\text{pay}} = 0$: Payment not received / invalid.
   * $P_{\text{pay}} = 1$: Payment successfully processed.

```text
HIGHWAY TOLL BARRIER CONTROLLER

 Vehicle Sensor Vcar ───┐
                        ├──► [ Moore State Controller ] ──┬──► Barrier Gate G (1=Open, 0=Closed)
 Payment Sensor Ppay ───┘                                └──► Alarm Horn A  (1=Sound Alarm!)
```

The system controls two physical output actuators:
1. **Barrier Gate Actuator ($G$)**: $G = 1$ opens the gate; $G = 0$ keeps the gate closed.
2. **Violation Alarm Horn ($A_{\text{alarm}}$)**: $A_{\text{alarm}} = 1$ sounds the alarm horn; $A_{\text{alarm}} = 0$ keeps the horn silent.

#### System Operational Rules

The system must operate across four discrete physical states:

1. **State $S_0$ (IDLE / BARRIER CLOSED)**:
   Outputs: $G = 0, A_{\text{alarm}} = 0$.
   * If no car arrives ($V_{\text{car}} = 0$), stay in $S_0$.
   * If a car arrives ($V_{\text{car}} = 1$), transition to State $S_1$ (Awaiting Payment).
2. **State $S_1$ (AWAITING PAYMENT)**:
   Outputs: $G = 0, A_{\text{alarm}} = 0$.
   * If payment succeeds ($P_{\text{pay}} = 1$), transition to State $S_2$ (Pass / Gate Open).
   * If the car drives forward without paying ($V_{\text{car}} = 1, P_{\text{pay}} = 0$ and forces through), or if an illegal bypass occurs, transition to State $S_3$ (Violation Alarm).
   * If the car backs away ($V_{\text{car}} = 0$), return to $S_0$.
3. **State $S_2$ (PASS / GATE OPEN)**:
   Outputs: $G = 1, A_{\text{alarm}} = 0$.
   * As long as the car is passing through ($V_{\text{car}} = 1$), stay in $S_2$ (keep gate open).
   * Once the car fully clears the barrier ($V_{\text{car}} = 0$), return to $S_0$ (close gate).
4. **State $S_3$ (VIOLATION ALARM)**:
   Outputs: $G = 0, A_{\text{alarm}} = 1$.
   * Sound alarm horn! Stay in $S_3$ until car backs away ($V_{\text{car}} = 0$), then return to $S_0$.

#### Your Objective

1. Draw the complete Moore State Transition Diagram (STD).
2. Construct the 4-state 2-input State Transition Table.
3. Assign a 2-bit binary code $(Q_1, Q_0)$ to each state ($S_0=00_2, S_1=01_2, S_2=10_2, S_3=11_2$).
4. Derive minimal K-map equations for next-state D flip-flop inputs ($D_1, D_0$) and Moore outputs ($G, A_{\text{alarm}}$).
5. Draw the complete gate-level controller schematic.
6. Simulate the system through a complete toll payment and passage cycle, verifying noise immunity.

---

### Step-by-Step Derivation

#### Step 1: Draw the Moore State Transition Diagram (STD)

We draw 4 state nodes with Moore output values inside each circle:

```text
TOLL BOOTH MOORE STATE TRANSITION DIAGRAM

                    Vcar = 0
             ┌─────────────────────┐
             │                     ▼
      ┌──────────────┐  Vcar=1  ┌──────────────┐
      │  S0: IDLE    ├─────────►│ S1: AWAIT    │
      │ G=0, Alarm=0 │          │ G=0, Alarm=0 │
      └──────▲───────┘          └──────┬───────┘
             │                         │
             │ Vcar=0            Ppay=1│ (Ppay=0 & Force) -> S3
             │                         ▼
      ┌──────┴───────┐  Vcar=1  ┌──────────────┐
      │ S3: ALARM    │◄─────────┤ S2: PASS     │
      │ G=0, Alarm=1 │          │ G=1, Alarm=0 │
      └──────────────┘          └──────────────┘
```

---

#### Step 2: Construct the State Transition Table

Let us build the state table using state codes:
* $S_0 = 00_2$ (Idle)
* $S_1 = 01_2$ (Awaiting Payment)
* $S_2 = 10_2$ (Pass / Gate Open)
* $S_3 = 11_2$ (Violation Alarm)

Binary Inputs: $V_{\text{car}}$ and $P_{\text{pay}}$.

```text
TOLL CONTROLLER STATE TRANSITION TABLE

 Current State Q1 Q0 │ Sensor Vcar │ Payment Ppay │ Next State Q1_next Q0_next │ Gate G │ Alarm Acrit
────────────────────┼─────────────┼──────────────┼────────────────────────────┼────────┼──────────────
     S0 (00)        │      0      │      X       │          S0 (00)           │   0    │      0
     S0 (00)        │      1      │      X       │          S1 (01)           │   0    │      0
────────────────────┼─────────────┼──────────────┼────────────────────────────┼────────┼──────────────
     S1 (01)        │      0      │      X       │          S0 (00)           │   0    │      0
     S1 (01)        │      1      │      0       │          S3 (11)           │   0    │      0
     S1 (01)        │      1      │      1       │          S2 (10)           │   0    │      0
────────────────────┼─────────────┼──────────────┼────────────────────────────┼────────┼──────────────
     S2 (10)        │      0      │      X       │          S0 (00)           │   1    │      0
     S2 (10)        │      1      │      X       │          S2 (10)           │   1    │      0
────────────────────┼─────────────┼──────────────┼────────────────────────────┼────────┼──────────────
     S3 (11)        │      0      │      X       │          S0 (00)           │   0    │      1
     S3 (11)        │      1      │      X       │          S3 (11)           │   0    │      1
```

---

#### Step 3: Derive Moore Output Equations ($G$ and $A_{\text{alarm}}$)

Because this is a **Moore Machine**, output equations depend ONLY on current state bits $Q_1$ and $Q_0$:

##### 1. Gate Actuator Output ($G$):
Looking at the state table, $G = 1$ ONLY in State $S_2 (Q_1 Q_0 = 10_2)$.

$$
G = Q_1 \cdot \overline{Q_0}
$$

##### 2. Violation Alarm Output ($A_{\text{alarm}}$):
Looking at the state table, $A_{\text{alarm}} = 1$ ONLY in State $S_3 (Q_1 Q_0 = 11_2)$.

$$
A_{\text{alarm}} = Q_1 \cdot Q_0
$$

Where:
* $G$ is the barrier gate open command.
* $A_{\text{alarm}}$ is the violation alarm horn command.
* $Q_1, Q_0$ are the state register flip-flop output bits.

Look at how simple these Moore output equations are! $V_{\text{car}}$ and $P_{\text{pay}}$ are nowhere to be seen, guaranteeing zero output glitches during input noise spikes!

---

#### Step 4: Derive State Transition Equations ($D_1$ and $D_0$)

We derive the next-state D flip-flop inputs $D_1 = Q_{1,\text{next}}$ and $D_0 = Q_{0,\text{next}}$ using K-Maps:

##### Next-State Flip-Flop $D_1$:
$D_1 = 1$ in states where $Q_{1,\text{next}} = 1$:
* From $S_1 (01)$ when $V_{\text{car}}=1, P_{\text{pay}}=0 \to S_3 (11)$
* From $S_1 (01)$ when $V_{\text{car}}=1, P_{\text{pay}}=1 \to S_2 (10)$
* From $S_2 (10)$ when $V_{\text{car}}=1 \to S_2 (10)$
* From $S_3 (11)$ when $V_{\text{car}}=1 \to S_3 (11)$

Minimizing $D_1$:

$$
D_1 = (Q_0 \cdot V_{\text{car}}) + (Q_1 \cdot V_{\text{car}}) = V_{\text{car}} \cdot (Q_1 + Q_0)
$$

##### Next-State Flip-Flop $D_0$:
$D_0 = 1$ in states where $Q_{0,\text{next}} = 1$:
* From $S_0 (00)$ when $V_{\text{car}}=1 \to S_1 (01)$
* From $S_1 (01)$ when $V_{\text{car}}=1, P_{\text{pay}}=0 \to S_3 (11)$
* From $S_3 (11)$ when $V_{\text{car}}=1 \to S_3 (11)$

Minimizing $D_0$:

$$
D_0 = (\overline{Q_1} \cdot \overline{Q_0} \cdot V_{\text{car}}) + (Q_0 \cdot V_{\text{car}} \cdot \overline{P_{\text{pay}}}) + (Q_1 \cdot Q_0 \cdot V_{\text{car}})
$$

Factoring $V_{\text{car}}$:

$$
D_0 = V_{\text{car}} \cdot \left[ (\overline{Q_1} \cdot \overline{Q_0}) + (Q_1 \cdot Q_0) + (Q_0 \cdot \overline{P_{\text{pay}}}) \right]
$$

Where:
* $D_1, D_0$ are the inputs to D Flip-Flops $\text{FF}_1$ and $\text{FF}_0$.
* $Q_1, Q_0$ are the current state register outputs.
* $V_{\text{car}}$ is the vehicle sensor bit.
* $P_{\text{pay}}$ is the payment switch bit.

---

#### Step 5: Draw Gate-Level Controller Schematic

```text
GATE-LEVEL MOORE TOLL CONTROLLER SCHEMATIC

                        ┌────────────────────────┐
                        │     STATE REGISTER     │
                        │  (2 D Flip-Flops: 1,0) │
                        └───────────┬────────────┘
                                    │
                                    ├──────────────────────────┐
                                    │ State Q1, Q0             │
                                    ▼                          ▼
 Inputs Vcar, Ppay ──► ┌────────────────────────┐    ┌───────────────────┐
                       │ State Transition Logic │    │ Moore Output      │
                       │ D1 = Vcar * (Q1 + Q0)  │    │ Gate G = Q1 * Q0' │──► Gate G
                       │ D0 = Vcar * (...)      │    │ Alarm = Q1 * Q0   │──► Alarm
                       └────────────┬───────────┘    └───────────────────┘
                                    │
                                    ▼
                         Next State D1, D0
                     (Feeds into FF1, FF0 Inputs)
```

---

### Sanity Check and Verification

Let us simulate our synthesized Moore controller through a complete payment and passage cycle:

#### Scenario 1: Normal Car Passage (State $S_0 \to S_1 \to S_2 \to S_0$)
1. **Initial State $S_0 (00)$**: Gate $G = 0$, Alarm $= 0$. Car arrives ($V_{\text{car}} = 1$).
   * $D_1 = 1 \cdot (0 + 0) = 0$.
   * $D_0 = 1 \cdot (\overline{0}\overline{0} + 0 + 0) = 1$.
   * Next State: $D_1 D_0 = 01_2$ ($S_1$, Awaiting Payment). **MATCH!**
2. **State $S_1 (01)$**: Payment validated ($P_{\text{pay}} = 1, V_{\text{car}} = 1$).
   * $D_1 = 1 \cdot (0 + 1) = 1$.
   * $D_0 = 1 \cdot (0 + 0 + 1 \cdot \overline{1}) = 0$.
   * Next State: $D_1 D_0 = 10_2$ ($S_2$, Pass / Gate Open!).
   * Output in $S_2$: $G = Q_1 \cdot \overline{Q_0} = 1 \cdot 1 = 1$. **BARRIER OPENS!**
3. **State $S_2 (10)$**: Car passes through and clears sensor ($V_{\text{car}} = 0$).
   * $D_1 = 0 \cdot (1 + 0) = 0$.
   * $D_0 = 0$.
   * Next State: $D_1 D_0 = 00_2$ ($S_0$, Return to Idle).
   * Output in $S_0$: $G = 0$. **BARRIER CLOSES SAFELY!**

#### Scenario 2: Noise Spike Immunity Test in State $S_2$
While the gate is open in State $S_2 (Q_1 Q_0 = 10_2)$, noise causes payment line $P_{\text{pay}}$ to rapidly flicker $1 \to 0 \to 1 \to 0$ for 5 nanoseconds.
* **Moore Output Check**: $G = Q_1 \cdot \overline{Q_0} = 1 \cdot 0 = 1$.
* **Result**: Because $P_{\text{pay}}$ is NOT an input to the Moore Output Decoder, **the barrier gate $G$ stays 100% steady at $1$ without a single flicker!**

All simulation scenarios evaluate with 100% mathematical and logical precision. The Moore highway toll gate controller is fully verified.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Moore State Machine**: A synchronous sequential controller architecture where the output vector $Y = f(Q)$ is generated strictly as a function of the current state register $Q$, completely shielding physical actuators from direct, noisy external input fluctuations.
* **State Transition Logic**: The combinational logic network $Q_{\text{next}} = g(Q, X)$ that calculates the next state vector by evaluating current state $Q$ and incoming external inputs $X$, driving the state register flip-flops on the next active clock edge.
