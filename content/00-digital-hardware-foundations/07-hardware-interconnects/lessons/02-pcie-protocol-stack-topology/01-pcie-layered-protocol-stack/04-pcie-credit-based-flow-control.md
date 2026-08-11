content/00-digital-hardware-foundations/07-hardware-interconnects/lessons/02-pcie-protocol-stack-topology/01-pcie-layered-protocol-stack/04-pcie-credit-based-flow-control.md
# Credit-Based Flow Control Architecture and Buffer Credit Update Mechanics

## The Receiver Buffer Overflow Crisis and the Failure of Reactive Flow Control

In modern high-speed point-to-point interconnect architectures, such as PCI Express (PCIe), memory communication takes place across high-frequency differential serial links. On a PCIe Gen4 or Gen5 interconnect, physical serial lanes operate at transfer rates of $16.0\text{ to } 32.0\text{ Gigatransfers per second (GT/s)}$. Across a 16-lane ($\times 16$) link, a high-performance host central processing unit (CPU) or graphics processing unit (GPU) can stream Transaction Layer Packets (TLPs) at an aggregate bandwidth exceeding **$64.0\text{ Gigabytes per second}$**!

However, on the receiving end of this high-speed serial link sits an endpoint peripheral device—such as an NVMe solid-state drive, an audio controller, or a network interface card (NIC). 

While the transmitting host CPU possesses massive processing power and large memory buffers, the receiving peripheral device is built with limited hardware resources. It contains small, fixed-size Static RAM (SRAM) input queue buffers to store incoming TLPs before processing them.

Consider what occurs at the physical hardware level if a high-speed host transmitter streams TLPs continuously at $64.0\text{ GB/s}$ toward an endpoint peripheral whose internal input buffer can hold only **8 packets ($512\text{ bytes}$ total data capacity)**:

```text
THE RECEIVER BUFFER OVERFLOW CRISIS

 Host Transmitter (Streaming @ 64.0 GB/s)      Endpoint Receiver (Small 512B SRAM Buffer)
 ┌──────────────────────────────────┐        ┌──────────────────────────┐
 │ Dispatches TLP 1, 2, 3 ... 100   ├───────►│ Holds max 8 TLPs!        │
 └──────────────────────────────────┘        └────────────┬─────────────┘
                                                          │
                                             Buffer 100% FULL at TLP 8!
                                                          │
                                                          ▼
                                             TLPs 9, 10, 11 ... 100 CRASH!
                                             (Data dropped on the floor!)
```

Look at the physical hardware breakdown:
1. The host transmitter dispatches TLPs 1 through 8. The receiving endpoint captures these 8 packets into its internal SRAM buffer. The buffer is now **$100\%$ full**!
2. The endpoint's internal processing pipeline requires time to process and drain these 8 packets from its buffer.
3. Meanwhile, the host transmitter continues streaming TLPs 9, 10, 11, ..., 100 across the physical link at $64.0\text{ GB/s}$.
4. **The Receiver Buffer Overflows**: Because the endpoint's input buffer has no open slots, **TLPs 9 through 100 cannot be stored**! The receiving hardware is forced to drop the incoming electrical packets on the floor.

Why can we not solve this buffer overflow problem using traditional, reactive "STOP" signals (such as classic XON/XOFF software flow control or RTS/CTS hardware wire handshakes)?

Because of **Physical Interconnect Flight Time Delay ($t_{\text{flight}}$)**!

In high-speed multi-gigahertz serial links, electrical signals travel down motherboard copper traces at a speed of approximately $15\text{ centimeters per nanosecond}$ ($6.67\text{ picoseconds per millimeter}$). 

Suppose a host transmitter and an endpoint peripheral are separated by 30 centimeters of circuit board traces. The round-trip propagation delay across the link and receiving logic is approximately **$100\text{ nanoseconds}$**:

```text
REACTIVE "STOP" SIGNAL FLIGHT-TIME FAILURE

 1. Receiver Buffer becomes 100% Full at t = 0 ns!
 2. Receiver asserts "STOP TRANSMITTING" Signal ──► [ 50 ns Flight Time across PCB ]
 3. Host Transmitter receives "STOP" Signal at t = 50 ns!
                                                    │
                                                    ▼
    Host ALREADY transmitted 50 nanoseconds' worth of TLPs (3,200 Bytes!)
    3,200 Bytes of TLPs crash into the full receiver buffer and get DESTROYED!
```

Trace the failure of the reactive "STOP" signal:
1. At $t = 0\text{ ns}$, the endpoint's input buffer becomes $100\%$ full. The endpoint asserts a "STOP" signal.
2. The "STOP" signal takes $50\text{ nanoseconds}$ to travel across the motherboard traces to the host transmitter.
3. By the time the host transmitter receives the "STOP" signal at $t = 50\text{ ns}$, **the host has ALREADY dispatched 50 nanoseconds' worth of additional TLPs ($3,200\text{ bytes}$ of data) onto the wires!**
4. Those $3,200\text{ bytes}$ of in-flight TLPs crash into the full receiver buffer and are completely destroyed!

If the receiver drops those packets, the Data Link Layer's Link CRC (LCRC) check will fail or sequence numbers will gap, triggering continuous `NAK` retransmissions. The memory interconnect enters an endless loop of packet drops and retries, collapsing system throughput.

How can a transmitter know **IN ADVANCES**, with $100\%$ mathematical certainty, whether a remote receiver has enough open buffer space to store an incoming TLP *before* dispatching a single byte across the wire?

To eliminate receiver buffer overflows with $100\%$ zero packet loss and zero link-idle stalls, PCI Express employs **Credit-Based Flow Control** and **Flow Control Buffer Credit Updates**.

---

## The Arcade Game Machine and the Pre-Allocated Tokens: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of credit-based flow control, credit accounting registers, and credit update packets before inspecting bitwise packet layouts, 12-bit modulo-4096 counters, and transmitter gating equations, let us consider an everyday analogy: **The Amusement Park Arcade Machine**.

Imagine an arcade player (**The Transmitter / Requestor**) who wants to play an arcade game machine (**The Receiver / Completer Device**) as fast as possible.

```text
THE AMUSEMENT PARK ARCADE METAPHOR

 Arcade Player (Transmitter / Host)            Arcade Game Machine (Receiver)
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ Holds Tokens in Hand      │                 │ Input Coin Slot Container │
 │ (Credit Accounting)       │                 │ Holds Max 8 Tokens        │
 └───────────────────────────┘                 └───────────────────────────┘
   (Pre-Allocated Tokens)                        (SRAM Input Buffer Queue)
```

The arcade game machine has a small coin slot container (**The Receiver Input Buffer Queue**) that can hold a maximum of **8 play tokens** ($8\text{ buffer slots}$).

The arcade player stands on a balcony 50 feet away from the machine. To play a game, the player throws tokens across the room into the machine's coin slot. Throwing a token across the room takes 5 seconds flight time.

Let us observe two different operational strategies for managing the coin slot:

---

### Strategy 1: The Reactive Shouting Manager (Reactive Flow Control Failure)

The arcade manager stands next to the machine and enforces a reactive rule: *"Throw tokens as fast as you want! When the coin slot container reaches 8 tokens, I will shout 'STOP THROWING TOKENS!' across the room."*

Look at what happens:
1. The player throws 8 tokens in rapid succession. The coin container reaches 8 tokens ($100\%$ full).
2. The manager shouts: *"STOP THROWING TOKENS!"*
3. The manager's voice takes 5 seconds to travel across the noisy room to the balcony.
4. Meanwhile, the player has **already thrown 5 more tokens** that were in mid-air!
5. The 5 mid-air tokens crash into the full coin container, bounce off the machine, fall onto the floor, and are lost forever!

This is the **Reactive Flow Control Failure**.

---

### Strategy 2: The Pre-Allocated Token System (Credit-Based Flow Control)

To prevent tokens from bouncing off the machine and getting lost, the arcade manager switches to **Credit-Based Flow Control**:

Before the player throws a single token, the arcade manager hands the player **8 physical Play Tokens** (**Flow Control Credit Initialization — `InitFC`**).

The player keeps these 8 tokens in their hand (**Transmitter Credit Accounting Register**).

```text
PRE-ALLOCATED TOKEN SYSTEM (CREDIT-BASED)

 1. Initialization (InitFC) ──► Manager hands Player 8 Tokens (InitFC = 8).
 2. Throwing a Token       ──► Player MUST deduct 1 Token from hand FIRST!
 3. Credit Verification    ──► IF Tokens in Hand == 0 ──► STOP THROWING IMMEDIATELY!
                               (Player stops locally without waiting for manager to shout!)
```

Now, trace how the player operates:

1. **Rule 1 (Pay Before Throwing)**: To throw a token toward the machine, the player MUST first deduct 1 token from their hand (`Tokens_In_Hand = Tokens_In_Hand - 1`).
2. **Rule 2 (Zero-Token Local Gating)**: If the player looks at their hand and sees **Zero Tokens Left** (`Tokens_In_Hand == 0`), the player **STOPS THROWING TOKENS IMMEDIATELY**!
   * The player does not wait for the manager to shout across the room.
   * The player knows mathematically that if they have 0 tokens in their hand, all 8 tokens are currently sitting inside the machine's coin container!
   * **Zero tokens bounce off the machine! Zero tokens are lost!**
3. **Rule 3 (Token Return Postcards — `UpdateFC`)**: When the machine processes a game and drops a token into the internal vault below (**Buffer Slot Freed**), the manager mails a postcard to the player: **`UpdateFC = +1 Token`**!
4. The player receives the postcard, adds 1 token back to their hand (`Tokens_In_Hand = Tokens_In_Hand + 1`), and immediately resumes throwing tokens!

```text
TOKEN RETURN POSTCARD (FLOW CONTROL UPDATE)

 Machine processes 1 game ──► Coin drops to vault ──► Manager mails "UpdateFC = +1"
                                                      │
                                                      ▼
 Player receives postcard ──► Adds 1 Token to hand ──► Resumes throwing tokens!
 (Player never threw a token without 100% mathematical proof of open buffer space!)
```

Notice what this pre-allocated token system achieved:
* **Zero Overflow Loss**: The player NEVER threw a token unless they possessed $100\%$ mathematical proof that the machine had an open slot!
* **Zero Flight-Time Collisions**: The player stopped themselves locally in $0\text{ seconds}$ without waiting for a "STOP" signal to travel across the room.
* **Continuous High-Speed Play**: As long as the manager mailed token postcards periodically, the player played at maximum speed without stopping!

This arcade token system is the exact physical analogue of **PCIe Credit-Based Flow Control**:
* The arcade machine coin container is the **Receiver Input Buffer Queue (SRAM)**.
* The player throwing tokens is the **Transmitter / Requestor (CPU Host / GPU)**.
* The play tokens are **Flow Control Credits**.
* Handing 8 tokens at startup is **Flow Control Initialization (`InitFC1` / `InitFC2`)**.
* Checking tokens in hand before sending is **Transmitter Credit Verification**.
* Mailing token postcards when space opens is **Flow Control Credit Updates (`UpdateFC` DLLPs)**.

---

## Primitive 1: Credit-Based Flow Control Architecture

Now that we possess a clear intuitive mental model of the arcade token system, let us examine the formal, rigorous engineering mechanics of **Credit-Based Flow Control**.

> **Credit-Based Flow Control** is a hardware buffer management protocol where a PCIe receiver advertises its available input buffer space to a transmitter as a set of numeric **Flow Control Credits**. The transmitter tracks consumed credits locally and is strictly forbidden from dispatching a Transaction Layer Packet (TLP) unless it possesses sufficient pre-allocated credits to cover the packet's header and data payload.

```text
CREDIT-BASED FLOW CONTROL HARDWARE TOPOLOGY

 Transmitter (Host / Master)                          Receiver (Endpoint / Slave)
 ┌───────────────────────────┐                        ┌───────────────────────────┐
 │ Credit Accounting         │                        │ Input SRAM Buffer Queue   │
 │ CREDITS_CONSUMED  = 8     │                        │ Holds max 8 TLP Headers   │
 │ CREDITS_ALLOCATED = 12    │                        │ Holds max 32 Data Credits │
 ├───────────────────────────┤                        └─────────────┬─────────────┘
 │ Credit Check Equation     │                                      │
 │ (ALLOCATED - CONSUMED) >= │                                      │ Buffer Slot Freed!
 │ Requested TLP Size?       │                                      ▼
 └─────────────┬─────────────┘                        ┌───────────────────────────┐
               │                                      │ Data Link Layer           │
               ▼ Dispatches TLP                       │ Generates UpdateFC DLLP   │
 ══════════════╧══════════════════════════════════════╡ (Carries CREDITS_ALLOCATED)│
                     PCIe Physical Serial Link        └───────────────────────────┘
```

---

### The Dual Accounting Metric: Headers vs. Data Payloads

In PCI Express, a Transaction Layer Packet (TLP) consists of two distinct components:
1. **TLP Header**: A fixed-size control header ($12 \text{ or } 16\text{ bytes}$ / 3 or 4 Double Words).
2. **Data Payload**: A variable-length user data payload ($0 \text{ to } 4,096\text{ bytes}$ / 0 to 1,024 Double Words).

Inside a receiving device, incoming TLP headers and data payloads are stored in **separate hardware SRAM buffers**:
* A **Header Buffer Queue** that stores TLP headers.
* A **Data Buffer Queue** that stores data payload bytes.

Why does PCIe use two separate credit metrics for flow control?
Consider two extreme TLP packets:
* **Packet A**: A $4\text{-byte}$ Memory Read TLP. It consumes 1 Header slot ($16\text{ bytes}$), but only 4 bytes of Data space.
* **Packet B**: A $4,096\text{-byte}$ Memory Write TLP. It consumes 1 Header slot ($16\text{ bytes}$), but a massive 4,096 bytes of Data space!

If the receiver tracked flow control using a single combined packet count, a packet with a $4,096\text{-byte}$ payload would consume the exact same "1 credit" as a $4\text{-byte}$ packet, completely overflowing the Data Buffer!

To prevent both Header Buffer and Data Buffer overflows, PCIe enforces **Dual Credit Accounting**:

```text
DUAL CREDIT ACCOUNTING METRICS

 1. Header Credits (H-Credits)
    1 Header Credit = 1 TLP Header (12 or 16 Bytes).
    Every TLP consumes EXACTLY 1 Header Credit (H-Credit = 1).

 2. Data Credits (D-Credits)
    1 Data Credit = 16 Bytes (4 Double Words / DWs) of Data Payload.
    A TLP with a 64-byte payload consumes 64 / 16 = 4 Data Credits (D-Credits = 4).
    A TLP with 0-byte payload (like a Read Request) consumes 0 Data Credits.
```

$$\text{Data Credits Required } (C_{\text{data}}) = \left\lceil \frac{\text{Payload Size in Bytes}}{16\text{ Bytes}} \right\rceil = \left\lceil \frac{\text{Payload Size in DWs}}{4\text{ DWs}} \right\rceil$$

---

### The Six Independent Flow Control Credit Pools

To prevent a slow memory transaction from blocking unrelated traffic (**Head-of-Line Blocking**), PCIe hardware partitions its buffers into **Six Independent Flow Control Credit Pools**:

```text
THE SIX INDEPENDENT FLOW CONTROL CREDIT POOLS

 1. Posted Header Credits (PH)     ──► For Memory Write & Message TLP Headers
 2. Posted Data Credits (PD)       ──► For Memory Write Data Payloads (16B / credit)

 3. Non-Posted Header Credits(NPH) ──► For Memory Read, I/O & Config TLP Headers
 4. Non-Posted Data Credits (NPD)  ──► For I/O & Config Write Data Payloads

 5. Completion Header Credits(CPLH)──► For Read/Config Completion TLP Headers
 6. Completion Data Credits (CPLD) ──► For Read Completion Data Payloads
```

Every PCIe device maintains separate credit tracking counters for all six pools simultaneously:
* **Posted Traffic (`PH`, `PD`)**: Used for "fire-and-forget" Memory Writes (`MWr`) and System Messages (`Msg`).
* **Non-Posted Traffic (`NPH`, `NPD`)**: Used for transactions that require a completion response, such as Memory Reads (`MRd`), I/O Reads/Writes, and Configuration Reads/Writes (`CfgRd`/`CfgWr`).
* **Completion Traffic (`CPLH`, `CPLD`)**: Used for returned Completion Packets (`Cpl`, `CplD`).

By maintaining six independent credit pools, if the Non-Posted Read queue becomes full ($NPH = 0$), Posted Memory Writes (`PH` / `PD`) can continue streaming across the link at full speed without stalling!

---

### The Infinite Credit Feature (`InitFC = 0`)

In certain high-performance devices (such as a host CPU Root Complex), the internal receiver buffers are connected to large system memory or are so large that they can never overflow under normal operating conditions.

To save power and eliminate unnecessary credit update traffic, the PCIe specification defines a special credit value:

$$\text{If } \text{InitFC} == 12'b0000\_0000\_0000_2 \quad (0\text{ Credits}) \implies \mathbf{\text{INFINITE CREDITS!}}$$

> **The Infinite Credit Rule**: If a receiver reports $0$ credits during initialization (`InitFC = 0`), the transmitter interprets this as **Infinite Buffer Capacity**. The transmitter disables credit tracking for that specific pool and is permitted to send an unlimited number of TLPs without waiting for `UpdateFC` credit updates!

---

## Primitive 2: Flow Control Credit Updates (`InitFC` and `UpdateFC` DLLPs)

Now let us examine the second core primitive: **Flow Control Buffer Credit Updates**.

Credit-based flow control operates across three distinct operational phases:
1. **Phase 1: Flow Control Initialization (`InitFC1` and `InitFC2` DLLPs)**
2. **Phase 2: Transmitter Credit Check & Gating Logic**
3. **Phase 3: Receiver Credit Return (`UpdateFC` DLLPs)**

```text
THREE-PHASE FLOW CONTROL LIFECYCLE

 Phase 1: Initialization ──► Exchanged during link boot-up (InitFC1 / InitFC2 DLLPs)
                             Sets initial CREDITS_ALLOCATED baseline.
                             │
                             ▼
 Phase 2: Credit Check   ──► Evaluated by Transmitter BEFORE sending every TLP:
                             Is (ALLOCATED - CONSUMED) >= TLP Required Credits?
                             YES ──► Send TLP & increment CREDITS_CONSUMED!
                             NO  ──► STALL TRANSMITTER!
                             │
                             ▼
 Phase 3: Credit Return  ──► Receiver processes TLP, frees SRAM buffer slot.
                             Sends UpdateFC DLLP carrying new CREDITS_ALLOCATED!
```

---

### Phase 1: Flow Control Initialization (`InitFC1` / `InitFC2`)

During physical link training (when a PCIe link transitions to the active `L0` state), the Data Link Layer on both ends of the link executes the **Flow Control Initialization Protocol**:

1. Device A sends **`InitFC1_P`**, **`InitFC1_NP`**, and **`InitFC1_Cpl`** Data Link Layer Packets (DLLPs) to Device B, reporting its initial hardware SRAM buffer capacity for all six credit pools.
2. Device A sends **`InitFC2`** DLLPs to re-confirm the values.
3. Simultaneously, Device B sends its own `InitFC1` and `InitFC2` DLLPs to Device A.

Once initialization completes, both devices set their initial **`CREDITS_ALLOCATED`** registers equal to the values received during `InitFC`:

$$\text{CREDITS\_ALLOCATED}_{\text{initial}} = \text{Value Received in InitFC DLLP}$$

$$\text{CREDITS\_CONSUMED}_{\text{initial}} = 0$$

---

### Phase 2: Transmitter Credit Accounting Registers and Modulo-4096 Math

Inside the transmitter's Data Link Layer, the hardware maintains two 12-bit counters for each of the six credit pools:

1. **`CREDITS_CONSUMED` (12-Bit Counter)**: A cumulative counter tracking the total number of credits consumed by the transmitter since link initialization.
   * Incremented by the transmitter every time a TLP is dispatched.
2. **`CREDITS_ALLOCATED` (12-Bit Register)**: A cumulative register tracking the total number of credits allocated by the remote receiver since link initialization.
   * Updated whenever an `UpdateFC` DLLP arrives from the receiver.

#### The Modulo-4096 Arithmetic Invariant:
Because `CREDITS_CONSUMED` and `CREDITS_ALLOCATED` are 12-bit counters, they count from $0$ up to $4,095$ and then **wrap around to zero** ($4095 + 1 = 0 \pmod{4096}$).

To calculate how many credits are currently available without being confused by counter wraparound, the transmitter evaluates the **Signed Modulo-4096 Credit Check Equation**:

$$\mathbf{\text{Credits\_Available} = (\text{CREDITS\_ALLOCATED} - \text{CREDITS\_CONSUMED}) \pmod{4096}}$$

Where:
* $\text{Credits\_Available}$ is the net number of available credits in the specified pool.
* $\text{CREDITS\_ALLOCATED}$ is the cumulative 12-bit allocated credit register value.
* $\text{CREDITS\_CONSUMED}$ is the cumulative 12-bit consumed credit counter value.

```text
MODULO-4096 COUNTER WRAPAROUND EXAMPLE

 Case A: Normal Operation (No Wraparound)
 CREDITS_ALLOCATED = 100, CREDITS_CONSUMED = 85
 Credits_Available = (100 - 85) mod 4096 = 15 Credits Available!

 Case B: Counter Wraparound Event
 CREDITS_CONSUMED wrapped to 5 (after reaching 4095).
 CREDITS_ALLOCATED wrapped to 20.
 Credits_Available = (20 - 5) mod 4096 = 15 Credits Available!
 (Modulo-4096 subtraction handles 12-bit counter wraparound flawlessly!)
```

---

### Phase 2 Gating Rule: The Transmitter Gating Invariant

Before a transmitter is permitted to dispatch a TLP requiring $H_{\text{req}}$ Header Credits and $D_{\text{req}}$ Data Credits, it MUST evaluate the **Transmitter Gating Invariant**:

$$\text{Can Dispatched TLP} \iff \mathbf{(\text{Credits\_Available}_{\text{Header}} \ge H_{\text{req}}) \quad \mathbf{\text{AND}} \quad (\text{Credits\_Available}_{\text{Data}} \ge D_{\text{req}})}$$

* **If True ($\text{Credits\_Available} \ge \text{Requested}$)**: The transmitter dispatches the TLP across the physical link and immediately increments its consumed counters:
  $$\text{CREDITS\_CONSUMED}_{\text{Header}} \Leftarrow (\text{CREDITS\_CONSUMED}_{\text{Header}} + H_{\text{req}}) \pmod{4096}$$
  $$\text{CREDITS\_CONSUMED}_{\text{Data}} \Leftarrow (\text{CREDITS\_CONSUMED}_{\text{Data}} + D_{\text{req}}) \pmod{4096}$$
* **If False ($\text{Credits\_Available} < \text{Requested}$)**: The transmitter **STALLS THE TRANSACTION LAYER IMMEDIATELY**! The TLP is held in the transmitter's outbound buffer, and zero bytes are sent across the physical link!

---

### Phase 3: Receiver Credit Return (`UpdateFC` DLLPs)

As the receiver's Transaction Layer processes incoming TLPs and frees SRAM buffer space:

1. The receiver's Data Link Layer constructs a **Flow Control Update DLLP (`UpdateFC`)**.
2. The `UpdateFC` DLLP carries the new **cumulative total `CREDITS_ALLOCATED` value**:
   $$\text{UpdateFC Payload} = \text{Total Buffer Space Freed Since Initialization} \pmod{4096}$$
3. The `UpdateFC` DLLP is transmitted across the physical link back to the transmitter.
4. When the transmitter receives `UpdateFC`, it updates its local `CREDITS_ALLOCATED` register.
5. The subtraction $(\text{CREDITS\_ALLOCATED} - \text{CREDITS\_CONSUMED}) \pmod{4096}$ yields a larger positive number, **unlocking the credit gate and un-stalling the transmitter!**

```text
UPDATEFC CREDIT RETURN TIMELINE

 Receiver frees 4 SRAM buffer slots ──► Generates UpdateFC DLLP (CREDITS_ALLOCATED = 20)
                                        │
                                        ▼ (Transmitted across physical link)
 Transmitter receives UpdateFC(20)   ──► Updates CREDITS_ALLOCATED <= 20
                                        Credits_Available = (20 - 16) = 4 Credits!
                                        Transmitter UN-STALLS and resumes sending TLPs!
```

---

## Real-World Silicon Engineering: UpdateFC Transmission Frequency and Credit Starvation

In commercial PCIe semiconductor design, optimizing credit-based flow control requires balancing `UpdateFC` transmission frequency against link bandwidth overhead.

### 1. The `UpdateFC` Frequency Trade-Off

How often should a receiving device transmit `UpdateFC` DLLPs back to the transmitter?

```text
UPDATEFC TRANSMISSION FREQUENCY TRADE-OFF

 Strategy A: Eager UpdateFC (Send UpdateFC after EVERY freed TLP)
 ─────────► Pro: Transmitter never runs out of credits; zero credit stalls.
 ─────────► Con: Floods reverse link with DLLPs, consuming 15%+ of reverse link bandwidth!

 Strategy B: Lazy UpdateFC (Send UpdateFC only when buffer is 90% full)
 ─────────► Pro: Saves reverse link bandwidth (minimal DLLP traffic).
 ─────────► Con: Transmitter experiences frequent CREDIT EXHAUSTION STALLS!
```

#### The JEDEC Recommended Standard ($30\%$ Buffer Threshold or $30\text{ }\mu\text{s}$ Timer):
To optimize link efficiency, modern PCIe receivers trigger an `UpdateFC` DLLP under two specific hardware conditions:
1. **Credit Threshold Trigger**: Transmit an `UpdateFC` whenever the receiver has freed at least **$30\%$ of its maximum credit capacity** since the last `UpdateFC` was sent.
2. **Maximum Latency Timer Trigger**: If less than $30\%$ of capacity has been freed, but **$30\text{ microseconds}$** have elapsed since the last `UpdateFC`, transmit an `UpdateFC` to ensure the transmitter's tracking registers remain fresh!

---

### 2. Credit Starvation and Out-of-Order Queue Blockade

Consider a scenario where an endpoint receiver's Non-Posted Data Buffer (`NPD`) becomes $100\%$ full because a slow software driver is taking a long time to process I/O Read transactions.

The host transmitter runs out of `NPD` credits ($\text{Credits\_Available}_{\text{NPD}} = 0$).

What happens if the host transmitter needs to execute a **Posted Memory Write (`MWr`)**?

Because Posted traffic (`PH`, `PD`) uses **completely independent credit accounting registers** from Non-Posted traffic (`NPH`, `NPD`):
* The zero-credit status of `NPD` has **ZERO EFFECT on `PH` and `PD` credits**!
* The host transmitter continues streaming Memory Write TLPs (`MWr`) at full $64.0\text{ GB/s}$ speed!
* The credit pool separation completely prevents Non-Posted queue blockades from stalling Posted memory traffic!

---

## Solved Industrial Engineering Exercise: Quantitative Flow Control Credit Calculation, Buffer Tracking, and Throughput Saturation Analysis

To consolidate your complete mastery of credit-based flow control, dual-credit metrics (Headers vs Data), 12-bit modulo-4096 credit check equations, and `UpdateFC` DLLP interactions, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a principal interconnect verification architect auditing a $3.2\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The processor connects to an NVMe Solid-State Storage Controller Endpoint over a **PCIe Gen4 $\times 4$ Link** ($16.0\text{ GT/s}$ per lane, $T_{\text{bus}} = 0.50\text{ ns}$, aggregate raw link payload bandwidth $= \mathbf{7.877 \text{ GB/sec}}$).

```text
3.2 GHz SERVER PROCESSOR WITH PCIe GEN4 x4 LINK (7.877 GB/s)

 CPU Host (Transmitter) ──► [ Credit Gating Logic ] ──► PCIe Gen4 x4 ──► NVMe Endpoint (Receiver)
 Clock T = 312.5 ps         12-Bit Modulo-4096 Counters  7.877 GB/s      NPH Buffer = 8 Credits
```

#### Hardware Flow Control Buffer Allocations (NVMe Endpoint Receiver during `InitFC`):
* Non-Posted Header Credits (`NPH`): **8 Header Credits** ($8\text{ TLP Headers}$).
* Non-Posted Data Credits (`NPD`): **16 Data Credits** ($16 \times 16\text{ Bytes} = 256\text{ Bytes}$ payload capacity).

#### Memory Interconnect & Link Timing Parameters:
* Round-Trip `UpdateFC` DLLP Transmission Delay ($T_{\text{round\_trip}}$): $120.0\text{ nanoseconds}$ ($384\text{ CPU clock cycles}$).
* Memory Read Request TLP (`MRd`): Consumes **$1\text{ NPH Credit}$** and **$0\text{ NPD Credits}$** (read requests carry no write data payload).

#### The Workload Test Sequence:
The CPU Host executes an intensive loop that dispatches **12 consecutive Memory Read TLPs (`MRd` #1 through #12)** to the NVMe drive in rapid succession on consecutive clock cycles ($t = 1 \dots 12$).

#### Your Objective

1. Calculate the initial `CREDITS_ALLOCATED` and `CREDITS_CONSUMED` values at the CPU Host transmitter for the `NPH` credit pool.
2. Trace the CPU Host's credit accounting registers (`CREDITS_CONSUMED`, `CREDITS_ALLOCATED`, `Credits_Available`) as it dispatches `MRd` TLPs #1 through #8.
3. Show why TLP #9 triggers a **Credit Exhaustion Stall** on Cycle 9, freezing the CPU host's outbound TLP dispatch logic.
4. The NVMe Endpoint processes `MRd` TLPs #1 through #4, freeing 4 buffer slots, and dispatches an `UpdateFC_NPH` DLLP with `CREDITS_ALLOCATED = 12`.
   * Calculate the exact physical time (in nanoseconds) when `UpdateFC_NPH(12)` arrives at the CPU Host.
   * Trace the CPU Host receiving `UpdateFC_NPH(12)`, calculating the new $\text{Credits\_Available}_{\text{NPH}}$, and un-stalling to dispatch TLPs #9, #10, #11, #12!
5. Calculate the total execution time (in nanoseconds and CPU clock cycles) and net throughput reduction during the credit stall event.
6. Verify mathematical, structural, and timing correctness.

---

### Step-by-Step Derivation

#### Step 1: Initialize Credit Accounting Registers

During link initialization (`InitFC`):
* NVMe Endpoint advertises initial `NPH` capacity $= 8\text{ Credits}$.
* CPU Host sets its initial accounting registers:

$$\text{CREDITS\_ALLOCATED}_{\text{initial}} = \mathbf{8 \text{ Credits}}$$

$$\text{CREDITS\_CONSUMED}_{\text{initial}} = \mathbf{0 \text{ Credits}}$$

$$\text{Credits\_Available}_{\text{initial}} = (8 - 0) \pmod{4096} = \mathbf{8 \text{ Credits Available}}$$

---

#### Step 2: Trace TLP Dispatches #1 through #8 (Cycles 1 to 8)

The CPU Host dispatches $128\text{-byte}$ `MRd` TLPs on consecutive clock cycles ($1\text{ cycle per TLP}$, $T_{\text{clk}} = 0.3125\text{ ns}$). Each `MRd` TLP consumes $1\text{ NPH Credit}$.

* **TLP #1 (Cycle 1, $t = 0.3125\text{ ns}$)**:
  * Check: $\text{Credits\_Available} = 8 \ge 1 \implies \mathbf{\text{DISPATCHED!}}$
  * Update: $\text{CREDITS\_CONSUMED} \Leftarrow 1$. $\text{Credits\_Available} = 8 - 1 = \mathbf{7}$.
* **TLP #2 (Cycle 2, $t = 0.6250\text{ ns}$)**:
  * Check: $\text{Credits\_Available} = 7 \ge 1 \implies \mathbf{\text{DISPATCHED!}}$
  * Update: $\text{CREDITS\_CONSUMED} \Leftarrow 2$. $\text{Credits\_Available} = 8 - 2 = \mathbf{6}$.
* **TLP #3 (Cycle 3)**: $\text{CONSUMED} = 3 \implies \text{Available} = \mathbf{5}$.
* **TLP #4 (Cycle 4)**: $\text{CONSUMED} = 4 \implies \text{Available} = \mathbf{4}$.
* **TLP #5 (Cycle 5)**: $\text{CONSUMED} = 5 \implies \text{Available} = \mathbf{3}$.
* **TLP #6 (Cycle 6)**: $\text{CONSUMED} = 6 \implies \text{Available} = \mathbf{2}$.
* **TLP #7 (Cycle 7)**: $\text{CONSUMED} = 7 \implies \text{Available} = \mathbf{1}$.
* **TLP #8 (Cycle 8, $t = 2.5000\text{ ns}$)**:
  * Check: $\text{Credits\_Available} = 1 \ge 1 \implies \mathbf{\text{DISPATCHED!}}$
  * Update: $\text{CREDITS\_CONSUMED} \Leftarrow 8$. $\text{Credits\_Available} = 8 - 8 = \mathbf{0 \text{ CREDITS LEFT!}}$

```text
CREDIT CONSUMPTION TRACE (TLPs #1 TO #8)

 Cycle │ TLP Dispatched │ CREDITS_CONSUMED │ CREDITS_ALLOCATED │ Credits_Available
───────┼────────────────┼──────────────────┼───────────────────┼───────────────────
   0   :    (Init)      │        0         │         8         │         8
   1   :    TLP #1      │        1         │         8         │         7
   2   :    TLP #2      │        2         │         8         │         6
   :   :     ...        │       ...        │        ...        │        ...
   8   :    TLP #8      │        8         │         8         │   0 (EXHAUSTED!)
```

---

#### Step 3: Credit Exhaustion Stall on TLP #9 (Cycle 9)

##### Cycle 9 ($t = 2.8125\text{ ns}$ — TLP #9 Attempt):
* CPU Host attempts to dispatch `MRd` TLP #9 (requires $1\text{ NPH Credit}$).
* CPU Host evaluates the Gating Invariant:

$$\text{Credits\_Available}_{\text{NPH}} = (\text{CREDITS\_ALLOCATED} - \text{CREDITS\_CONSUMED}) \pmod{4096}$$

$$\text{Credits\_Available}_{\text{NPH}} = (8 - 8) \pmod{4096} = \mathbf{0 \text{ Credits}}$$

$$\text{Gating Check: } \text{Credits\_Available } (0) \ge \text{Requested } (1) \quad (\mathbf{\text{FALSE!}})$$

##### Result:
**CREDIT EXHAUSTION STALL FIRED!** 

The CPU Host's outbound TLP dispatch logic is frozen! TLP #9 is held in the host's outbound buffer, and zero bytes are sent across the link!

---

#### Step 4: Trace NVMe Endpoint Processing & `UpdateFC` Arrival

1. **NVMe Buffer Processing**: The NVMe Endpoint receives and processes `MRd` TLPs #1 through #4, freeing 4 buffer slots in its internal SRAM queue at $t = 15.0\text{ ns}$.
2. **`UpdateFC` Generation ($t = 15.0\text{ ns}$)**:
   * The NVMe Endpoint constructs an `UpdateFC_NPH` DLLP carrying the new cumulative allocated total:
     $$\text{CREDITS\_ALLOCATED}_{\text{new}} = 8 + 4 = \mathbf{12 \text{ Credits}}$$
3. **`UpdateFC` Link Transit ($120.0\text{ ns}$ Round-Trip Delay)**:
   * The `UpdateFC_NPH(12)` DLLP travels across the physical serial link to the CPU Host.
   * Arrival Time at CPU Host = $15.0\text{ ns} + 120.0\text{ ns} = \mathbf{135.00 \text{ nanoseconds}}$ (Cycle 432!).

##### Cycle 432 ($t = 135.00\text{ ns}$ — CPU Host Receives `UpdateFC_NPH(12)`):
* CPU Host updates its register: $\text{CREDITS\_ALLOCATED} \Leftarrow 12$.
* CPU Host recalculates Available Credits:

$$\text{Credits\_Available}_{\text{NPH}} = (12 - 8) \pmod{4096} = \mathbf{4 \text{ Credits Available!}}$$

$$\text{Gating Check: } \text{Credits\_Available } (4) \ge \text{Requested } (1) \quad (\mathbf{\text{TRUE!}})$$

* **CREDIT GATING UNLOCKED!** The CPU Host un-stalls immediately and dispatches TLPs #9, #10, #11, and #12 on Cycles 432, 433, 434, and 435!

```text
CREDIT UN-STALL AND DISPATCH CHRONOLOGY

 Time (ns) │ Bus Cycle │ Host Action                      │ Credits_Available
───────────┼───────────┼──────────────────────────────────┼───────────────────
    2.8125 │ Cycle 9   │ TLP #9 Attempted -> STALLED!     │        0
   15.0000 │    -      │ NVMe frees 4 slots, sends Update │        -
  135.0000 │ Cycle 432 │ Receives UpdateFC(12) -> UN-STALL│ 4 (12 - 8 = 4!)
  135.3125 │ Cycle 433 │ Dispatches TLP #9                │ 3 (12 - 9 = 3)
  135.6250 │ Cycle 434 │ Dispatches TLP #10               │ 2 (12 - 10 = 2)
  135.9375 │ Cycle 435 │ Dispatches TLP #11               │ 1 (12 - 11 = 1)
  136.2500 │ Cycle 436 │ Dispatches TLP #12               │ 0 (12 - 12 = 0)
```

---

#### Step 5: Calculate Total Execution Time and Throughput Degradation

Let us calculate the performance impact of the credit exhaustion stall:

##### 1. Total Stall Delay Duration ($T_{\text{stall}}$):
The host was stalled on TLP #9 from Cycle 9 ($2.8125\text{ ns}$) to Cycle 432 ($135.0000\text{ ns}$):

$$T_{\text{stall}} = 135.0000\text{ ns} - 2.8125\text{ ns} = \mathbf{132.1875 \text{ nanoseconds}}$$

In CPU clock cycles ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$\text{Stall Cycles} = \frac{132.1875\text{ ns}}{0.3125\text{ ns/cycle}} = \mathbf{423 \text{ CPU Clock Cycles}}$$

##### 2. Total Execution Time for All 12 TLPs ($T_{\text{total}}$):
TLP #12 completes dispatch at Cycle 436 ($136.25\text{ ns}$):

$$T_{\text{total}} = 436 \text{ cycles} \times 0.3125\text{ ns/cycle} = \mathbf{136.250 \text{ nanoseconds}}$$

##### 3. Compare Un-Stalled Ideal vs. Stalled Execution:
* Ideal Un-Stalled Time (12 TLPs $\times 0.3125\text{ ns}$) = $3.750\text{ ns}$ ($12\text{ cycles}$).
* Actual Stalled Time = $136.250\text{ ns}$ ($436\text{ cycles}$).

$$\text{Throughput Loss Factor} = \frac{136.250\text{ ns}}{3.750\text{ ns}} \approx \mathbf{36.33\times \text{ Execution Time Increase!}}$$

```text
FLOW CONTROL CREDIT STALL PERFORMANCE SUMMARY

 Parameter Metric             │ Ideal Un-Stalled Execution │ Stalled Credit Execution
──────────────────────────────┼────────────────────────────┼───────────────────────────
 Total Dispatch Cycles (12 TLPs)│ 12 CPU Cycles (3.75 ns)    │ 436 CPU Cycles (136.25 ns)
 Credit Exhaustion Stall Time │ 0 Nanoseconds              │ 132.19 ns (423 Cycles!)
 Buffer Overflow Packet Losses │ 0 Packets                  │ 0 PACKETS! (100% SAFE!)
```

##### Engineering Conclusion:
In exchange for a $132.19\text{-ns}$ credit stall, **zero packets were dropped, zero buffer overflows occurred, and zero data was lost**! The credit-based flow control protocol guaranteed $100\%$ buffer safety without losing a single byte of user data.

---

### Sanity Check and Verification

Let us verify our mathematical and protocol state results against PCIe specification rules:

1. **Gating Invariant Verification**:
   * TLP #8 consumed credit 8 $\implies \text{CONSUMED} = 8, \text{ALLOCATED} = 8 \implies \text{Available} = 0$.
   * TLP #9 attempted when $\text{Available} = 0 \implies$ Gating check evaluated FALSE, correctly freezing the host.
2. **Modulo-4096 Counter Wraparound Check**:
   * $\text{Credits\_Available} = (12 - 8) \pmod{4096} = 4$.
   * Dispatching 4 TLPs (#9, #10, #11, #12) increased $\text{CONSUMED}$ to $12$.
   * Final $\text{Credits\_Available} = (12 - 12) \pmod{4096} = 0$.
   * Counter accounting verified with $100\%$ mathematical precision!
3. **Credit Pool Independence**:
   * `MRd` TLPs consumed ONLY `NPH` credits.
   * `PH`, `PD`, `CPLH`, `CPLD` credit pools remained completely untouched and available for Memory Writes and Completions.

All 12-bit modulo-4096 credit check equations, `UpdateFC` DLLP credit returns, dual-credit (Header vs Data) metric calculations, and credit exhaustion stall durations evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Credit-Based Flow Control**: A pre-allocated buffer management protocol where a PCIe receiver advertises its available input SRAM queue capacity as numeric credits across six independent pools, forbidding the transmitter from dispatching a TLP unless it holds sufficient pre-allocated credits.
* **Flow Control Buffer Credit Update (`UpdateFC`)**: The Data Link Layer mechanism where the receiver periodically transmits `UpdateFC` DLLPs carrying cumulative `CREDITS_ALLOCATED` values back to the transmitter as input buffer slots are freed, unlocking the transmitter's credit gating equation and un-stalling TLP dispatches.
