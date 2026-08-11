---
title: "Bus Arbitration Architectures: Fixed Priority, Round-Robin, Weighted Round-Robin, and Starvation Prevention"
---

# Bus Arbitration Architectures: Fixed Priority, Round-Robin, Weighted Round-Robin, and Starvation Prevention

In modern System-on-Chip (SoC) architectures, multiple independent processing engines—such as four CPU cores, a 3D graphics rendering GPU, a high-speed PCI Express DMA controller, and a 4K camera video interface—share a single, high-bandwidth physical interconnect bus to access main System DRAM or High-Bandwidth Memory (HBM).

Each of these processing engines operates as a **Bus Master**, capable of initiating read and write transactions.

When two or more bus masters assert their request signals ($R_0, R_1, R_2, R_3$) on the exact same clock cycle to access the shared memory controller, the interconnect faces a critical physical conflict:

```text
WITHOUT ARBITER (Bus Contention & Data Corruption)
 Master 0 (Req) ──┐
 Master 1 (Req) ──┼──► [ Shared Memory Bus ] ──► SHORT CIRCUIT / DATA COLLISION!
 Master 2 (Req) ──┘

WITH ARBITER (Single Grant Allocation)
 Master 0 (Req) ──┐
 Master 1 (Req) ──┼──► [ Bus Arbiter ] ──► Grant 1 ──► [ Shared Bus ]
 Master 2 (Req) ──┘    (Grants ONLY 1 Master per Clock Cycle!)
```

If the interconnect allows multiple masters to drive the shared data bus wires simultaneously without coordination, **Electrical Bus Contention** occurs. Driver transistors from Master 0 attempt to pull a wire to $V_{DD}$ ($1$), while driver transistors from Master 1 attempt to pull the same wire to Ground ($0$). This creates a high-current short circuit across the silicon die that distorts signal voltages, corrupts data words, and causes high thermal dissipation that degrades the chip.

To prevent bus contention, the interconnect must place a dedicated hardware controller at the shared resource boundary: a **Bus Arbiter**.

A Bus Arbiter evaluates incoming requests ($R_0 \dots R_{N-1}$) from $N$ competing masters on every clock cycle and emits an $N$-bit One-Hot **Grant Vector** ($G_0 \dots G_{N-1}$), guaranteeing that **EXACTLY ONE master** is granted permission to drive the shared bus on any given cycle.

However, designing a bus arbiter introduces a severe architectural hazard: **Resource Starvation**.

If an inexperienced hardware engineer designs a naive **Fixed-Priority Arbiter** where Master 0 always has higher priority than Masters 1, 2, and 3, a high-throughput master (such as a 4K camera DMA engine at Master 0) that continuously requests the bus will permanently block lower-priority masters. Masters 1, 2, and 3 never receive a grant. Background processing tasks freeze indefinitely, and the system suffers a catastrophic **Starvation Lockup**.

To allocate shared bus bandwidth fairly, prevent resource starvation, and support high-frequency pipelined execution, digital hardware engineering relies on **Round-Robin (RR) Arbiters**, **Single-Cycle $2N$-Bit Double-Width Masked Priority Trees**, and **Weighted Round-Robin (WRR) Credit Engines**.


### Part A: The Four-Way Stop vs. The Revolving Roundabout (Fixed Priority vs. Round-Robin)

Imagine a busy 4-way road intersection where four roads—North, East, South, and West—merge into a single narrow bridge that can fit only one car at a time.

```text
FIXED PRIORITY INTERSECTION (North Always Goes First)
 North Car (Priority 1) ──► Drives immediately!
 South Car (Priority 4) ──► Waits forever if North cars keep coming!
                            (STARVATION!)

ROUND-ROBIN REVOLVING TURNTABLE (Dynamic Priority Rotation)
 North Car goes ──► Turntable rotates ──► East Car goes next!
 (Every car gets a guaranteed turn; zero starvation!)
```

A traffic police officer sits at the intersection to decide which car gets to cross the bridge first.

Let us compare two different traffic control policies enforced by the police officer:

#### Policy 1: Fixed Priority (North > East > South > West)
The officer enforces a strict static rule: *"North cars always go first. East cars go second. South cars go third. West cars go last."*

* **The Scenario**: It is Monday morning rush hour, and a continuous bumper-to-bumper line of cars arrives from the North road.
* **The Result**: The officer allows North car #1 to cross, then North car #2, then North car #3...
* The cars waiting on the West road **NEVER get to cross the bridge**! They sit idling for hours, running out of gas. 
* This is the exact physical analogue of **Fixed-Priority Resource Starvation**. High-priority channels hog the bus, completely starving lower-priority channels.

#### Policy 2: The Revolving Priority Roundabout (Fair Round-Robin)
The officer replaces the fixed rule with a **Revolving Priority Pointer**:
1. The officer lets North car #1 cross the bridge.
2. The officer immediately turns their body to face East. **East now has the highest priority!**
3. The officer lets East car #1 cross. The officer turns to face South. **South now has the highest priority!**
4. The officer lets South car #1 cross, then West car #1, and then loops back to North!

* **The Result**: Even if 10,000 cars arrive from the North road, North must wait its turn after crossing once. Every road is guaranteed a turn in sequential order ($N \to E \to S \to W \to N$).
* No car ever starves! This is the exact physical analogue of **Fair Round-Robin Arbitration**.


## Mechanics of Fixed-Priority Arbiters & The Starvation Hazard

To master arbiter design, we must dissect the formal mechanics, gate schematics, and Boolean equations of both Fixed-Priority and Round-Robin hardware architectures.


### The Physical Starvation Failure Mechanism

Let us analyze what happens in a 4-channel Fixed-Priority Arbiter when Channel 0 streams continuous requests ($R_0 = 1$ on every single clock cycle):

Substitute $R_0 = 1$ into the grant equations for Channels 1, 2, and 3:

$$G_0 = 1$$

$$G_1 = R_1 \cdot \overline{1} = R_1 \cdot 0 = 0$$

$$G_2 = R_2 \cdot \overline{1} \cdot \overline{R_1} = 0$$

$$G_3 = R_3 \cdot \overline{1} \cdot \overline{R_1} \cdot \overline{R_2} = 0$$

Look at the mathematical result:
> **As long as $R_0 = 1$, the grant signals $G_1, G_2, G_3$ evaluate to STROLOGIC $0$ on every single clock cycle, regardless of the values of $R_1, R_2, R_3$!**

```text
FIXED-PRIORITY STARVATION TIMING TRACE

 Clock Cycle │ R0 R1 R2 R3 │ G0 G1 G2 G3 │ Arbiter Status
─────────────┼─────────────┼─────────────┼──────────────────────────────────────────────
   Cycle 1   │  1  1  1  1 │  1  0  0  0 │ Channel 0 Granted
   Cycle 2   │  1  1  1  1 │  1  0  0  0 │ Channel 0 Granted (Channels 1,2,3 Blocked)
   Cycle 3   │  1  1  1  1 │  1  0  0  0 │ Channel 0 Granted (Channels 1,2,3 Blocked)
   Cycle 4   │  1  1  1  1 │  1  0  0  0 │ 100% RESOURCE STARVATION FOR CHANNELS 1, 2, 3!
```

Channels 1, 2, and 3 suffer **$100\%$ Resource Starvation**. Their processing pipelines freeze permanently.

#### Where Fixed-Priority Arbiters ARE Acceptable in Hardware:
Fixed-Priority arbitration is appropriate ONLY for **Emergency Signal Channels** where higher-level safety rules dictate that emergency events MUST interrupt normal processing:
* Power-Fail Warnings (e.g., Voltage drop detector requesting immediate state save).
* Thermal Over-Temperature Emergency Alarms.
* Hardware Reset Requests.

For general data buses (CPU, GPU, DMA, Ethernet), Fixed-Priority arbitration is strictly forbidden.


### Primitive 2: Round-Robin Priority Rotation Rules

The core principle of Round-Robin arbitration is **Dynamic Priority Pointer Rotation**:

1. Maintain an $N$-bit One-Hot **Priority Pointer Vector** $\mathbf{P} = (P_{N-1}, \dots, P_0)$, where $P_k = 1$ indicates that Channel $k$ currently has the highest priority.
2. When a channel $k$ is granted access to the bus ($G_k = 1$), the priority pointer **rotates on the next clock cycle** to give highest priority to the next adjacent channel:

$$\mathbf{P}_{\text{next}} = \text{Rotate\_Left\_1}(\mathbf{G}) \implies P_{k+1 \pmod N} = 1$$

```text
ROUND-ROBIN PRIORITY POINTER ROTATION CYCLE (4 CHANNELS)

 Current Grant: G = 4'b0001 (Channel 0 Granted)
                 │
                 ▼ Pointer rotates left by 1 position on posedge clk!
 Next Priority: P = 4'b0010 (Channel 1 becomes HIGHEST priority!)
```

#### The Round-Robin Evaluation Sequence:
Suppose priority pointer $\mathbf{P}$ currently points to Channel 2 ($P_2 = 1$). The priority hierarchy for the current cycle becomes:

$$\text{Priority Order: } \text{Channel 2} > \text{Channel 3} > \text{Channel 0} > \text{Channel 1}$$

* If Channel 2 requests ($R_2 = 1$), $G_2 = 1$. Next priority becomes Channel 3 ($P_3 = 1$).
* If Channel 2 does NOT request ($R_2 = 0$), but Channel 3 requests ($R_3 = 1$), $G_3 = 1$. Next priority becomes Channel 0 ($P_0 = 1$).
* If neither 2 nor 3 requests, check Channel 0, then Channel 1.


#### Step-by-Step Derivation of the $2N$-Bit Masked Arbiter Algorithm

Let $N$ be the number of request channels (e.g., $N = 4$).

##### Step 1: Generate the Priority Mask Vector ($\mathbf{M}$)
From the $N$-bit One-Hot priority pointer $\mathbf{P} = (P_{N-1} \dots P_0)$, generate an $N$-bit Thermo-Mask vector $\mathbf{M} = (M_{N-1} \dots M_0)$ where all bits at or above the priority pointer are set to $1$, and all bits below are set to $0$:

$$M_k = \sum_{j=0}^{k} P_j \quad \text{for } 0 \le k < N$$

For example, if Priority Pointer $\mathbf{P} = 4\text{'b}0100$ (Channel 2 is highest priority):

$$\mathbf{M} = 4\text{'b}1100 \quad (\text{Bits 3 and 2 are 1; Bits 1 and 0 are 0})$$

##### Step 2: Form the $2N$-Bit Doubled Request Vector ($\mathbf{R}_{\text{double}}$)
Concatenate the $N$-bit request vector $\mathbf{R}$ with itself to duplicate the channels across a 2-lap span:

$$\mathbf{R}_{\text{double}} = \{\mathbf{R}, \, \mathbf{R}\}$$

For example, if $\mathbf{R} = 4\text{'b}1011$ (Channels 3, 1, and 0 requesting):

$$\mathbf{R}_{\text{double}} = \{4\text{'b}1011, \, 4\text{'b}1011\} = 8\text{'b}1011\_1011_2$$

##### Step 3: Apply the Priority Mask ($\mathbf{R}_{\text{masked}}$)
Mask the lower $N$ bits of $\mathbf{R}_{\text{double}}$ using the Thermo-Mask $\mathbf{M}$ padded with zeros:

$$\mathbf{R}_{\text{masked}} = \mathbf{R}_{\text{double}} \,\, \& \,\, \{\mathbf{M}, \, \mathbf{0}_N\}$$

$$\mathbf{R}_{\text{masked}} = 8\text{'b}1011\_1011 \,\, \& \,\, \{4\text{'b}1100, \, 4\text{'b}0000\} = 8\text{'b}1000\_0000_2$$

##### Step 4: Pass Through a $2N$-Bit Fixed-Priority Encoder
Pass $8\text{'b}1000\_0000$ through a standard $2N$-bit Fixed-Priority Encoder (where lowest bit index has highest priority):

$$\mathbf{G}_{\text{double}} = \text{FixedPriority}_{2N}(\mathbf{R}_{\text{masked}})$$

If $\mathbf{R}_{\text{masked}}$ contains no active requests (meaning all active requests fell below the priority mask), fall back to passing the raw unmasked doubled vector $\mathbf{R}_{\text{double}}$ through the encoder!

##### Step 5: Fold the $2N$-Bit Grant Vector Back to $N$ Bits
Bitwise OR the upper $N$ bits of $\mathbf{G}_{\text{double}}$ with its lower $N$ bits to produce the final $N$-bit One-Hot grant vector $\mathbf{G}$:

$$\mathbf{G} = \mathbf{G}_{\text{double}}[2N-1 : N] \,\, \mid \,\, \mathbf{G}_{\text{double}}[N-1 : 0]$$

```text
2N-BIT MASKED ARBITER EVALUATION TRACE (4 CHANNELS)

 Priority Pointer P : 4'b0100 (Channel 2 Highest) ──► Mask M = 4'b1100
 Request Vector R   : 4'b1011 (Channels 3, 1, 0 Requesting)

 Doubled Request    : 8'b1011_1011
 Mask Extension     : 8'b1100_0000
                      ──────────── (Bitwise AND)
 Masked Request     : 8'b1000_0000 (Channel 3 is the ONLY request above mask!)

 2N Fixed Priority  : 8'b1000_0000
 Fold Upper/Lower   : 4'b1000 | 4'b0000 = 4'b1000 (Grant G = Channel 3!)
```

Look at this mathematical elegance!
In a **single combinational pass**, the double-width mask vector evaluated Round-Robin priority across all channels without executing a single `while` loop or multi-cycle state machine!


### Primitive 4: Weighted Round-Robin Credit Counter Engine

A **Weighted Round-Robin (WRR) Arbiter** assigns an integer **Weight Credit Parameter ($W_k$)** to each channel $k$.

$$\mathbf{W} = (W_{N-1}, \, W_{N-2}, \dots, W_0)$$

Where $W_k \ge 1$ represents the maximum number of consecutive bus access grants Channel $k$ is permitted to consume during a single rotation cycle.

```text
WEIGHTED ROUND-ROBIN CREDIT COUNTER STATE MACHINE

 Channel k Granted Access
           │
           ▼
 Decrement Credit Counter: credit_cnt[k] <= credit_cnt[k] - 1
           │
           ├──► Is credit_cnt[k] > 0 AND req[k] == 1? ──► KEEP PRIORITY AT CHANNEL k!
           │                                              (Channel k gets consecutive grants!)
           │
           └──► Is credit_cnt[k] == 0 OR req[k] == 0? ──► ROTATE PRIORITY TO NEXT CHANNEL!
                                                          Re-load credit_cnt[k] <= Weight W_k!
```


## Engineering Reality: Burst Grant Locks and AXI Interconnect Integration

In commercial SoC design, integrating arbiters into physical memory buses introduces real-world interconnect constraints that hardware engineers must manage.


### 2. AXI4 Interconnect Channel-Independent Arbitration

In an ARM AXI4 interconnect, the bus is divided into **five independent channels**:
1. Read Address Channel (`AR`)
2. Read Data Channel (`R`)
3. Write Address Channel (`AW`)
4. Write Data Channel (`W`)
5. Write Response Channel (`B`)

A high-performance AXI interconnect does NOT use a single monolithic arbiter. It instantiates **independent arbiters for each channel**:
* An `AW` Arbiter allocates Write Address channels.
* An `AR` Arbiter allocates Read Address channels.
* A `W` Arbiter allocates Write Data channels.

This channel-decoupled arbitration allows an AXI interconnect to process a Write Address for Master 0 while simultaneously streaming Read Data for Master 1 on the exact same clock cycle!


### Scenario and Parameters

An integrated circuit firm is designing a synthesizable **4-Channel Weighted Round-Robin (WRR) Bus Arbiter** (`WeightedRoundRobinArbiter`) for a multi-core satellite payload computer.

The arbiter coordinates four competing bus masters attempting to access a single 32-bit shared memory bus:
* **Master 0 (Radar DMA Engine)**: Configured Weight $W_0 = 3$ credits.
* **Master 1 (CPU Core 0)**: Configured Weight $W_1 = 2$ credits.
* **Master 2 (CPU Core 1)**: Configured Weight $W_2 = 1$ credit.
* **Master 3 (UART Telemetry)**: Configured Weight $W_3 = 1$ credit.

Total weight sum $= 3 + 2 + 1 + 1 = 7$ credits.

```text
4-CHANNEL WEIGHTED ROUND-ROBIN ARBITER BLOCK

 Request Bus req_bus[3:0] ──► [ 4-Channel WRR Arbiter ] ──┬──► Grant Bus grant_bus[3:0]
 Master Weights W0=3, W1=2    │ (Single-Cycle 2N-Mask)   ├──► Valid Flag grant_valid
                W2=1, W3=1    │                          └──► Granted ID granted_id[1:0]
 Control Input burst_last ────┘
```

#### System Operating Requirements:

1. **Request Vector (`req_bus[3:0]`)**: Active-high request lines from Masters 0, 1, 2, 3.
2. **Grant Vector (`grant_bus[3:0]`)**: 4-bit One-Hot grant vector ($G_k = 1$ indicates Master $k$ is granted access).
3. **Burst Lock Logic**: If `burst_last = 0`, the current granted master retains its grant across clock cycles regardless of other requests, until `burst_last = 1` arrives on its final word.
4. **WRR Rotation Logic**:
   * A master consumes 1 credit on every granted clock cycle.
   * When a master exhausts its credits ($cnt = 0$) or drops its request ($req_k = 0$), the priority pointer rotates to the next requesting channel, and the master's credit counter is re-loaded to $W_k$.
5. **Outputs**:
   * `grant_bus[3:0]`: 4-bit One-Hot grant vector.
   * `grant_valid`: $1$ if a master is granted; $0$ if all requests are $0$.
   * `granted_id[1:0]`: 2-bit binary index of the granted master.

#### Your Objective

1. Calculate the theoretical percentage memory bandwidth allocated to each master under heavy contention.
2. Write the complete, synthesizable SystemVerilog module `WeightedRoundRobinArbiter`.
3. Implement single-cycle $2N$-bit double-width masked priority logic ($N = 4, 2N = 8$).
4. Simulate 10 consecutive clock cycles under heavy contention (`req_bus = 4'b1111`, `burst_last = 1`), tracing pointer updates, credit counter decrements, and grant outputs.
5. Verify that Master 0 receives 3 grants, Master 1 receives 2 grants, Master 2 receives 1 grant, and Master 3 receives 1 grant in a fair $3:2:1:1$ rotation, proving zero starvation.


#### Step 2: Write the Synthesizable SystemVerilog Module

We construct `WeightedRoundRobinArbiter` using single-cycle double-width mask logic and credit counter registers:

```systemverilog
`default_nettype none

// 4-CHANNEL WEIGHTED ROUND-ROBIN (WRR) BUS ARBITER
module WeightedRoundRobinArbiter (
    input  logic       clk,
    input  logic       reset_n,
    input  logic [3:0] req_bus,      // Requests from Masters [3:0]
    input  logic       burst_last,   // 1 = Final burst word
    output logic [3:0] grant_bus,    // One-Hot grant output
    output logic       grant_valid,  // 1 = Bus granted
    output logic [1:0] granted_id    // Binary index [1:0]
);

    // Channel Credit Weights
    localparam logic [2:0] W0 = 3'd3; // Master 0 Weight = 3
    localparam logic [2:0] W1 = 3'd2; // Master 1 Weight = 2
    localparam logic [2:0] W2 = 3'd1; // Master 2 Weight = 1
    localparam logic [2:0] W3 = 3'd1; // Master 3 Weight = 1

    // Credit Counter Registers
    logic [2:0] credit_cnt [0:3];

    // Priority Pointer & Lock Registers
    logic [3:0] ptr_reg;
    logic       lock_reg;
    logic [3:0] locked_grant_reg;

    // Internal Single-Cycle Masked Priority Signals
    logic [3:0]  mask_vec;
    logic [7:0]  req_double;
    logic [7:0]  req_masked;
    logic [7:0]  grant_double;
    logic [3:0]  combo_grant;

    // -----------------------------------------------------------------
    // 1. SINGLE-CYCLE 2N-BIT MASKED ROUND-ROBIN LOGIC (N = 4)
    // -----------------------------------------------------------------
    always_comb begin
        // Construct Thermo-Mask from One-Hot Priority Pointer ptr_reg
        mask_vec[0] = ptr_reg[0];
        mask_vec[1] = ptr_reg[0] | ptr_reg[1];
        mask_vec[2] = ptr_reg[0] | ptr_reg[1] | ptr_reg[2];
        mask_vec[3] = 1'b1;

        // Duplicate request vector across 8 bits
        req_double = {req_bus, req_bus};

        // Mask lower 4 bits
        req_masked = req_double & {mask_vec, 4'b0000};

        // 8-Bit Fixed Priority Encoder on Masked Vector
        if (req_masked != 8'h00) begin
            grant_double = req_masked & (-req_masked); // Isolated LSB bit!
        end else begin
            grant_double = req_double & (-req_double); // Fallback to raw
        end

        // Fold 8-bit grant back to 4 bits
        combo_grant = grant_double[7:4] | grant_double[3:0];
    end

    // Active Grant Selection (Respects Burst Lock!)
    assign grant_bus = (lock_reg) ? locked_grant_reg : combo_grant;
    assign grant_valid = |req_bus || lock_reg;

    // Binary Index Encoder
    always_comb begin
        case (grant_bus)
            4'b0001:  granted_id = 2'd0;
            4'b0010:  granted_id = 2'd1;
            4 meb0100:  granted_id = 2'd2;
            4'b1000:  granted_id = 2'd3;
            default:  granted_id = 2'd0;
        endcase
    end

    // -----------------------------------------------------------------
    // 2. CREDIT COUNTER & PRIORITY POINTER ROTATION (always_ff)
    // -----------------------------------------------------------------
    always_ff @(posedge clk or negedge reset_n) begin
        if (!reset_n) begin
            ptr_reg          <= 4'b0001; // Master 0 Highest Priority
            lock_reg         <= 1'b0;
            locked_grant_reg <= 4'b0000;

            credit_cnt[0]    <= W0;
            credit_cnt[1]    <= W1;
            credit_cnt[2]    <= W2;
            credit_cnt[3]    <= W3;
        end else begin

            // Burst Lock Management
            if (grant_valid && !burst_last) begin
                lock_reg         <= 1'b1;
                locked_grant_reg <= grant_bus;
            end else if (burst_last) begin
                lock_reg         <= 1'b0;
            end

            // Credit Decrement & Priority Rotation
            if (grant_valid && burst_last) begin
                int m;
                m = granted_id;

                if (credit_cnt[m] > 3'd1 && req_bus[m]) begin
                    // Consume 1 credit; retain priority at current master!
                    credit_cnt[m] <= credit_cnt[m] - 3'd1;
                end else begin
                    // Credits exhausted OR request dropped! Re-load weight and rotate!
                    case (m)
                        0: credit_cnt[0] <= W0;
                        1: credit_cnt[1] <= W1;
                        2: credit_cnt[2] <= W2;
                        3: credit_cnt[3] <= W3;
                    endcase

                    // Rotate Priority Pointer to Next Channel (m + 1 mod 4)
                    case (m)
                        0: ptr_reg <= 4'b0010; // Next highest = Master 1
                        1: ptr_reg <= 4'b0100; // Next highest = Master 2
                        2: ptr_reg <= 4'b1000; // Next highest = Master 3
                        3: ptr_reg <= 4'b0001; // Next highest = Master 0
                    endcase
                end
            end

        end
    end

endmodule

`default_nettype wire
```


## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Fixed-Priority vs. Round-Robin Bus Arbitration**: The fundamental interconnect control distinction where Fixed-Priority assigns static hierarchies ($G_k = R_k \cdot \prod \overline{R_j}$) causing resource starvation for low-priority channels, whereas Round-Robin dynamically rotates priority pointers after every grant to guarantee 100% fair access and zero starvation.
* **Single-Cycle $2N$-Bit Double-Width Masked Arbiter Architecture**: The high-speed combinational hardware pattern that concatenates and masks the request vector ($\mathbf{R}_{\text{masked}} = \{\mathbf{R}, \mathbf{R}\} \,\,\&\,\, \{\mathbf{M}, \mathbf{0}\}$) to evaluate Round-Robin priority grants across $N$ channels in a single clock cycle without multi-cycle FSM state delays.
* **Weighted Round-Robin (WRR) & Credit Counters**: The bandwidth allocation scheme that assigns credit weight registers ($W_k$) to channels, allowing high-throughput masters to receive $W_k$ consecutive grants per rotation cycle while guaranteeing that low-weight channels are never starved.
* **Burst Grant Locking**: The interconnect protection mechanism (`grant_lock`) that freezes the active grant vector during multi-word burst memory transfers (`BURST16`), preventing packet slicing and data corruption.
