---
title: "Credit-Based Flow Control Architecture and Buffer Credit Update Mechanics"
---

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


### Strategy 1: The Reactive Shouting Manager (Reactive Flow Control Failure)

The arcade manager stands next to the machine and enforces a reactive rule: *"Throw tokens as fast as you want! When the coin slot container reaches 8 tokens, I will shout 'STOP THROWING TOKENS!' across the room."*

Look at what happens:
1. The player throws 8 tokens in rapid succession. The coin container reaches 8 tokens ($100\%$ full).
2. The manager shouts: *"STOP THROWING TOKENS!"*
3. The manager's voice takes 5 seconds to travel across the noisy room to the balcony.
4. Meanwhile, the player has **already thrown 5 more tokens** that were in mid-air!
5. The 5 mid-air tokens crash into the full coin container, bounce off the machine, fall onto the floor, and are lost forever!

This is the **Reactive Flow Control Failure**.


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


### 2. Credit Starvation and Out-of-Order Queue Blockade

Consider a scenario where an endpoint receiver's Non-Posted Data Buffer (`NPD`) becomes $100\%$ full because a slow software driver is taking a long time to process I/O Read transactions.

The host transmitter runs out of `NPD` credits ($\text{Credits\_Available}_{\text{NPD}} = 0$).

What happens if the host transmitter needs to execute a **Posted Memory Write (`MWr`)**?

Because Posted traffic (`PH`, `PD`) uses **completely independent credit accounting registers** from Non-Posted traffic (`NPH`, `NPD`):
* The zero-credit status of `NPD` has **ZERO EFFECT on `PH` and `PD` credits**!
* The host transmitter continues streaming Memory Write TLPs (`MWr`) at full $64.0\text{ GB/s}$ speed!
* The credit pool separation completely prevents Non-Posted queue blockades from stalling Posted memory traffic!


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

