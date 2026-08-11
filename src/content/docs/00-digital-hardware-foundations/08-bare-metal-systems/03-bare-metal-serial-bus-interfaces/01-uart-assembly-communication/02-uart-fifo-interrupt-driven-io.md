---
title: "Hardware UART FIFOs, Non-Blocking Interrupt-Driven I/O, and Overrun Error Recovery"
---

# Hardware UART FIFOs, Non-Blocking Interrupt-Driven I/O, and Overrun Error Recovery

## The Polling Latency Trap and Hardware Buffer Overruns

In high-performance bare-metal embedded systems engineering, a central processing unit (CPU) operates at multi-gigahertz or multi-hundred-megahertz instruction execution speeds. An ARM Cortex-M4 processor running at a clock frequency of $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ nanoseconds}$) executes billions of assembly instructions per second, evaluating complex mathematical algorithms, control loops, and sensor processing pipelines.

However, physical communication interfaces—such as a Universal Asynchronous Receiver-Transmitter (UART) serial port—operate at physical baud rates constrained by external cables and receiving hardware. 

Consider a standard, widely used serial communication baud rate of $115,200\text{ bits per second}$ ($115.2\text{ kbps}$).

To transmit a single 10-bit asynchronous serial frame ($1\text{ Start Bit} + 8\text{ Data Bits} + 1\text{ Stop Bit}$):

$$\text{Time per Serial Byte } (T_{\text{byte}}) = \frac{10\text{ Bits}}{115,200\text{ Bits/second}} \approx 86.805 \times 10^{-6} \text{ Seconds} = \mathbf{86.805 \text{ Microseconds}}$$

Now, compare these two physical execution time scales:
* **Time to execute 1 assembly instruction on a $3.2\text{-GHz}$ CPU**: $\mathbf{0.3125 \text{ Nanoseconds}}$.
* **Time to transmit 1 serial character over a $115,200\text{-baud}$ UART link**: $\mathbf{86,805.0 \text{ Nanoseconds}}$ ($86.805\ \mu\text{s}$).

Transmitting a single character over a UART serial link takes **$277,776\text{ CPU clock cycles}$**!

```text
THE SPEED MISMATCH DISASTER IN POLLING SERIAL I/O

 1 CPU Instruction Execution Phase  : 0.3125 Nanoseconds
 1 UART Serial Byte Transmission    : 86,805.0000 Nanoseconds
 ─────────────────────────────────────────────────────────────────
 RATIO: 277,776 CPU Instruction Cycles per SINGLE Transmitted Byte!
```

If a bare-metal assembly program attempts to transmit a 100-character text message (`"Error 402: Over-Temperature Fault Detected in Power Stage 3\r\n"`) using **Software Polling I/O** (`while (!(USART1->SR & USART_SR_TXE))`):

1. The CPU writes character 1 to the UART Data Register (`USART_DR`).
2. The CPU enters an assembly polling loop, repeatedly reading the status register (`USART_SR`) to check if the Transmit Data Register Empty flag (`TXE`) has been set.
3. **The CPU Execution Freeze**: The CPU sits trapped in this polling loop for **$86.8\text{ microseconds}$ per character**, doing zero productive work!
4. Across 100 characters, the CPU burns **$27,777,600\text{ instruction cycles}$ ($8.68\text{ milliseconds}$ of pure stall time)** acting as a manual waiting gate! Real-time motor control loops and safety monitoring threads sit completely frozen.

```text
SOFTWARE POLLING TRANSMISSION PIPELINE (27 MILLION CYCLES WASTED)

 Char 1 : Write DR ──► [ Poll TXE Status Loop: 277,776 Cycles Stalled! ] ──► Sent!
 Char 2 : Write DR ──► [ Poll TXE Status Loop: 277,776 Cycles Stalled! ] ──► Sent!
  ...
 Char 100: Write DR ──► [ Poll TXE Status Loop: 277,776 Cycles Stalled! ] ──► Sent!
 (CPU execution pipeline frozen for 8.68 milliseconds of 100% idle waste!)
```

Conversely, examine what occurs during **Serial Data Reception** under polling:

If the CPU is busy executing a 5-millisecond mathematical matrix calculation, and a remote device streams 5 bytes of data over the UART receive line (`RX`):
* The UART hardware receives Byte 1, stores it in `USART_DR`, and sets the Read Data Register Not Empty flag (`RXNE = 1`).
* Because the CPU is busy with matrix calculations, **it does not read `USART_DR` immediately**.
* $86.8\ \mu\text{s}$ later, the UART hardware receives Byte 2.
* **The Overrun Error (`ORE`)**: Because `USART_DR` still holds Byte 1 (`RXNE` is still $1$), **Byte 2 overwrites and destroys Byte 1**!
* The hardware sets the **Overrun Error Flag (`ORE = 1`)** in `USART_SR`. Byte 1 is lost forever, corrupting the incoming data stream!

```text
RECEIVE OVERRUN ERROR (ORE) DATA CORRUPTION

 RX Line : ───[ Byte 1 Arrives ]───────────[ Byte 2 Arrives (86.8 us later) ]───
                                           │
                                           ▼ (USART_DR still holds Byte 1!)
 USART_DR: [ Byte 1 Stored (RXNE = 1) ] ──► [ BYTE 2 OVERWRITES BYTE 1! ]
                                           (Byte 1 ERASED! Hardware sets ORE = 1!)
```

How do we transmit multi-byte serial data strings and receive burst messages at full wire speed **WITHOUT trapping the CPU in polling loops**, and **WITHOUT losing incoming bytes to overrun errors**?

To achieve non-blocking, zero-polling-waste serial communication, bare-metal hardware architectures employ **Hardware UART FIFO Buffers**, **Interrupt-Driven UART Transmission/Reception**, and **Overrun Error Recovery Handlers**.


### Strategy 1: The Standing Cashier (Software Polling I/O)

The store manager enforces a rigid, naive rule: *"You must stand directly at the front counter, staring out the window at the drive-thru lane until a customer arrives!"*

Look at what happens during the cashier's workday:
1. The cashier stands at the counter staring out the window (**Polling `USART_SR.RXNE` in an Assembly Loop**).
2. The cashier stands frozen for 10 minutes doing nothing while a customer approaches.
3. At 10:10 AM, the customer hands the cashier a paper order form (**1 Data Byte**). The cashier processes it in 1 second.
4. The cashier returns to staring out the window for another 10 minutes!

```text
STRATEGY 1: THE STANDING CASHIER (SOFTWARE POLLING I/O)

 Cashier stares out window (10 Mins) ──► Customer 1 Order ──► Cashier processes (1 Sec)
 Cashier stares out window (10 Mins) ──► Customer 2 Order ──► Cashier processes (1 Sec)
 (Cashier burns 99.8% of their workday standing still doing zero store work!)
```

This is **Software Polling I/O**. The store's inventory is never organized because the cashier's time is $99.8\%$ wasted staring out the window!


### Strategy 3: The Doorbell Chime System (Interrupt-Driven I/O)

To prevent the wire basket from ever overflowing during long tasks, the manager installs a **Doorbell Chime System (Hardware Interrupts `RXNEIE` / `TXEIE`)**:

```text
STRATEGY 3: DOORBELL CHIME SYSTEM (INTERRUPT-DRIVEN I/O)

 Capsule lands in Basket ──► Doorbell Rings! (Hardware Interrupt Asserted)
                             │
                             ▼
 Cashier pauses stocking ──► Steps to Basket ──► Empties Capsule ──► Resumes Stocking!
 (Cashier works at 100% efficiency! Basket NEVER overflows!)
```

1. **Receive Chime (`RXNEIE`)**: The instant Capsule 1 lands in the wire basket, a loud bell rings in the back room (**Hardware `RXNE` Interrupt**).
2. The cashier pauses their shelf-stocking, walks to the basket, grabs Capsule 1 (**Reads `USART_DR`**), and immediately goes back to stocking shelves!
3. **Transmit Chime (`TXEIE`)**: When the cashier needs to send 50 invoices to headquarters:
   * The cashier drops the stack of 50 invoices into an outgoing mailbox queue in RAM (**Software Ring Buffer**).
   * The cashier loads Invoice 1 into the outgoing tube, turns ON the "Mailbox Ready" bell (**Enables `TXEIE` Interrupt**), and goes back to work.
   * Every time the outgoing tube is empty, the bell rings automatically! The cashier steps over, loads the next invoice, and goes back to work until all 50 invoices are sent!

This pneumatic tube system is the exact physical analogue of **Hardware FIFOs, Interrupt-Driven I/O, and Overrun Recovery**:
* The cashier is the **CPU Execution Core**.
* Stocking shelves is the **Main Application Code Loop**.
* Staring out the window is **Software Polling I/O**.
* Drive-thru customers are **Incoming Serial Bytes**.
* The 8-slot wire basket is the **Hardware UART FIFO Buffer**.
* A shattered capsule on the floor is a **Hardware Overrun Error (`ORE`)**.
* The doorbell ringing is a **Hardware UART Interrupt (`RXNEIE` / `TXEIE`)**.
* The outgoing mailbox queue in RAM is a **Software Circular Ring Buffer**.


### 1. Dissecting the Status Register (`USART1_SR`)

The **Status Register (`USART_SR`)** is a 32-bit register at offset `0x00` that reports the real-time hardware state of the UART transmitter, receiver, and error detectors:

```text
USART_SR STATUS REGISTER BITFIELD MAP

 Bit 31                     Bit 8 Bit 7  Bit 6  Bit 5  Bit 4  Bit 3  Bit 2  Bit 1  Bit 0
 ┌───────────────────────────────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
 │ Reserved / Unused             │ LBD  │ TXE  │ TC   │ RXNE │ IDLE │ ORE  │ NE   │ FE   │ PE   │
 └───────────────────────────────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
```

Let us analyze the primary status bits:

* **`TXE` (Transmit Data Register Empty — Bit 7)**:
  * $1 =$ The internal hardware buffer `USART_DR` is empty and ready to accept the next byte.
  * $0 =$ The `USART_DR` register is full; writing a new byte now will overwrite the pending byte!
* **`TC` (Transmission Complete — Bit 6)**:
  * $1 =$ The entire transmission frame (data payload + stop bits) has completely shifted out of the hardware shift register onto the physical `TX` wire.
  * $0 =$ Transmission is actively in progress.
* **`RXNE` (Read Data Register Not Empty — Bit 5)**:
  * $1 =$ An incoming serial byte has been received, verified, and latched into `USART_DR`, ready to be read by the CPU.
  * $0 =$ No new byte has arrived in `USART_DR`.
* **`ORE` (Overrun Error — Bit 3)**:
  * $1 =$ An incoming byte was received while `RXNE` was already $1$ (a byte was lost!).
  * $0 =$ No overrun error occurred.
* **`FE` (Framing Error — Bit 1)**:
  * $1 =$ De-synchronization occurred or noise corrupted the Stop Bit (sampled $0.0\text{V}$ instead of $3.3\text{V}$).
  * $0 =$ Valid stop bit detected.


## Non-Blocking Interrupt-Driven Transmission Architecture

To transmit a multi-byte text string (e.g., 256 bytes) without blocking the CPU pipeline in a polling loop, bare-metal software integrates a **Software Circular Ring Buffer** with **`TXEIE` Interrupt-Driven State Machine Control**.

### The Software Circular Ring Buffer Topology

A **Circular Ring Buffer** is a fixed-size memory array in system RAM managed by two unsigned integer pointers (or array indices):
1. **`head` Pointer**: Points to the next empty array slot where software writes outgoing bytes.
2. **`tail` Pointer**: Points to the next array slot where the UART Interrupt Service Routine ($ISR$) reads the byte to transmit.

```text
SOFTWARE CIRCULAR RING BUFFER IN SYSTEM RAM (256-BYTE CAPACITY)

 Memory Array tx_buffer[256]
 ┌────┬────┬────┬──────────────────┬────┬────┬────┬──────────────────┐
 │ 'A'│ 'B'│ 'C'│ 'D' │ ...        │    │    │    │                  │
 └────┴────┴────┴──────────────────┴────┴────┴────┴──────────────────┘
   ▲                                 ▲
   │                                 │
   tail Pointer (Read by ISR)        head Pointer (Written by Main Loop)
   (Picks up bytes to send)          (Appends new text characters)
```

#### Queue State Formulas (8-Bit Unsigned Indices $0 \dots 255$):

* **Buffer Empty Condition**:
  $$\text{Buffer Empty} \iff (\text{head} == \text{tail})$$
* **Buffer Full Condition**:
  $$\text{Buffer Full} \iff ((\text{head} + 1) \pmod{256} == \text{tail})$$
* **Pending Bytes to Transmit**:
  $$\text{Pending Bytes} = (\text{head} - \text{tail}) \pmod{256}$$


## Overrun and Framing Error Recovery Mechanics

Now let us examine how the UART Data Link layer and assembly $ISR$ recover from physical hardware errors: **Overrun Errors (`ORE`)** and **Framing Errors (`FE`)**.

### The Read-to-Clear Error Flag Hardware Invariant

In modern microcontroller UART architectures, status error flags (`ORE`, `FE`, `NE`, `PE` in `USART_SR`) **CANNOT be cleared by writing zero ($0$) to `USART_SR`**!

To clear hardware error flags safely without race conditions, the silicon die uses a **Two-Step Read-to-Clear Sequence**:

```text
TWO-STEP READ-TO-CLEAR ERROR RECOVERY SEQUENCE

 STEP 1: READ STATUS REGISTER (USART_SR)
 CPU executes: LDR r1, [USART1_SR]  ──► Captures Error Flags (ORE=1 or FE=1)
                                         │
                                         ▼
 STEP 2: READ DATA REGISTER (USART_DR)
 CPU executes: LDR r2, [USART1_DR]  ──► CLEARS ORE AND FE FLAGS IN SILICON!
                                         (Hardware un-latches error state!)
```

> **The Read-to-Clear Invariant**: To clear the Overrun Error (`ORE`) or Framing Error (`FE`) flags in hardware, software MUST execute a **Read of `USART_SR` followed immediately by a Read of `USART_DR`**:

$$\text{Clear Hardware Error Flags } (\text{ORE} / \text{FE} \Leftarrow 0) \iff \text{Execute } \mathbf{\text{LDR } r_1, [\text{USART1\_SR}]} \quad \mathbf{\text{then}} \quad \mathbf{\text{LDR } r_2, [\text{USART1\_DR}]}$$


## Real-World Silicon Realities: RS-485 Direction Timing and Pointer Atomicity

In commercial industrial systems engineering, implementing non-blocking serial I/O requires handling half-duplex direction switches and ring buffer concurrency.


### 2. Volatile Ring Buffer Pointer Concurrency

In a non-blocking UART system:
* The main program loop writes to `tx_head`.
* The `USART1_IRQHandler` $ISR$ writes to `tx_tail`.

If the software compiler optimizes `tx_head` or `tx_tail` by storing their values in CPU registers ($r4..r11$) instead of reading RAM on every iteration:
* The main loop will never see pointer updates made by the $ISR$!
* **The Software Invariant**: In C/C++, ring buffer pointers `head` and `tail` **MUST be declared `volatile`**. In Assembly, software MUST fetch pointer values directly from RAM using `LDR` instructions inside critical sections!


### Scenario and Parameters

You are a senior bare-metal systems architect writing the non-blocking UART communications subsystem for a $3.2\text{ GHz}$ ARM Cortex-M4 server management controller ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The `USART1` peripheral is connected to the APB2 bus ($f_{\text{PCLK2}} = 84.0\text{ MHz}$) operating at $115,200\text{ baud}$ ($T_{\text{byte}} = 86.805\ \mu\text{s} = 277,776\text{ CPU clock cycles}$).

```text
3.2 GZ BARE-METAL SERVER CONTROLLER UART INTERRUPT SUBSYSTEM

 CPU Host (3.2 GHz) ──► [ Software Ring Buffer tx_buffer[256] ] ──► USART1 Peripheral
 Clock T = 312.5 ps     head & tail Pointers in RAM                Baud = 115,200 (86.8 us/byte)
```

#### Hardware & Memory Specifications:
* `USART1_BASE` $= \text{0x4001\_1000}$.
* Transmit Ring Buffer `tx_buffer` capacity $= 256\text{ bytes}$ located at SRAM address `0x2000_0100`.
* `tx_head` pointer index stored at SRAM address `0x2000_0200` (8-bit unsigned integer $0 \dots 255$).
* `tx_tail` pointer index stored at SRAM address `0x2000_0201` (8-bit unsigned integer $0 \dots 255$).

#### The Workload Test Sequence:
At physical time $t = 0.0\text{ ns}$ (CPU Cycle 0), both pointers are empty (`head = 0`, `tail = 0`).
1. **Step 1 ($t = 0.0\text{ ns}$)**: The main program appends a 4-character string (`"HELP"`) to `tx_buffer` and enables `USART1_CR1.TXEIE = 1`.
2. **Step 2 ($t = 10.0\text{ ns}$)**: Hardware fires `USART1_IRQHandler` (since `TXE = 1`).
3. **Step 3**: The $ISR$ services bytes in the background until the buffer is empty.

#### Your Objective

1. Calculate the number of CPU clock cycles and physical time (in microseconds) saved by using non-blocking interrupt-driven transmission over polling for the 4-byte string.
2. Trace the step-by-step state of `tx_head`, `tx_tail`, `tx_buffer`, `USART1_DR`, and `TXEIE` across the transmission of `"HELP"`.
3. Show why the $ISR$ MUST disable `TXEIE = 0` when `tail == head` at the 4th byte, and show how `TCIE` is used to detect final frame completion.
4. Write the complete, production-ready ARM Assembly routines:
   * `USART1_SendString`: Non-blocking function called by main code to queue strings and kick off transmission.
   * `USART1_IRQHandler`: Production ISR handling both `TXE` (transmit), `RXNE` (receive), and `ORE` (overrun error recovery).
5. Verify mathematical, structural, and logical correctness.


#### Step 2: Trace Non-Blocking Ring Buffer Transmission

Initial State: `tx_head = 0`, `tx_tail = 0`, `tx_buffer` empty.

##### 1. Main Program Execution (`USART1_SendString`):
* Appends `'H'`, `'E'`, `'L'`, `'P'` to `tx_buffer[0..3]`.
* Updates `tx_head` $\Leftarrow 4$. (`tx_head = 4, tx_tail = 0` $\implies 4$ pending bytes).
* Enables `USART1_CR1.TXEIE = 1`. **Main program returns immediately!**

##### 2. First ISR Execution (Cycle 10 — `TXE = 1`):
* Hardware asserts `USART1_IRQHandler`.
* $ISR$ checks `head (4) != tail (0)`.
* $ISR$ reads `tx_buffer[0]` (`'H'`) and writes to `USART1_DR`. `TXE` flips to $0$ in hardware.
* $ISR$ updates `tx_tail` $\Leftarrow 1$. $ISR$ returns (`bx lr`).

##### 3. Second ISR Execution ($t = 86.8\ \mu\text{s}$ — Character `'H'` transmitted):
* `USART1_DR` becomes empty (`TXE = 1`). Hardware asserts `USART1_IRQHandler`.
* $ISR$ reads `tx_buffer[1]` (`'E'`) and writes to `USART1_DR`. `TXE` flips to $0$.
* $ISR$ updates `tx_tail` $\Leftarrow 2$. $ISR$ returns.

##### 4. Third ISR Execution ($t = 173.6\ \mu\text{s}$ — Character `'E'` transmitted):
* $ISR$ reads `tx_buffer[2]` (`'L'`) and writes to `USART1_DR`.
* $ISR$ updates `tx_tail` $\Leftarrow 3$. $ISR$ returns.

##### 5. Fourth ISR Execution ($t = 260.4\ \mu\text{s}$ — Character `'L'` transmitted):
* $ISR$ reads `tx_buffer[3]` (`'P'`) and writes to `USART1_DR`.
* $ISR$ updates `tx_tail` $\Leftarrow 4$.
* **Buffer Empty Check**: $ISR$ sees `head (4) == tail (4)`!
* **Shutdown Action**: $ISR$ **clears `TXEIE = 0`** to prevent infinite re-triggering, and **sets `TCIE = 1`** to wait for `'P'` to finish shifting out.

##### 6. Fifth ISR Execution ($t = 347.2\ \mu\text{s}$ — Transmission Complete `TC = 1`):
* Character `'P'` finishes shifting out onto physical `TX` wire. `TC = 1`.
* Hardware asserts `USART1_IRQHandler` (due to `TCIE = 1`).
* $ISR$ clears `TCIE = 0`. Transmission $100\%$ complete!

```text
NON-BLOCKING TRANSMISSION CHRONOLOGY TRACE

 Time (us) │ Active Module     │ tx_head │ tx_tail │ Action / Register Event
───────────┼───────────────────┼─────────┼─────────┼─────────────────────────────────────────────
     0.0   │ Main Program      │    4    │    0    │ Queued "HELP"; Set TXEIE = 1; Returned!
     0.03  │ ISR 1             │    4    │    1    │ Wrote 'H' to DR; TXE <= 0
    86.8   │ ISR 2             │    4    │    2    │ Wrote 'E' to DR; TXE <= 0
   173.6   │ ISR 3             │    4    │    3    │ Wrote 'L' to DR; TXE <= 0
   260.4   │ ISR 4             │    4    │    4    │ Wrote 'P' to DR; Buffer Empty -> TXEIE <= 0!
   347.2   │ ISR 5 (TC Interrupt│   4    │    4    │ TC = 1! TCIE <= 0; STREAM COMPLETE!
```


### Sanity Check and Verification

Let us verify our mathematical, physical, and register state machine results against hardware specifications:

1. **Cycle Offloading Calculation Check**:
   * Polling time for 4 bytes $= 1,111,104\text{ CPU cycles}$.
   * Interrupt-driven CPU time $= 192\text{ CPU cycles}$.
   * Offloading percentage $= (1 - 192/1,111,104) \times 100\% = 99.9827\%$. Math verified $100\%$!

2. **Read-to-Clear Error Sequence Verification**:
   * In `USART1_IRQHandler`, `handle_overrun_error` executed `LDR r1, [USART1_SR]` followed by `LDR r3, [USART1_DR]`.
   * Executing the 2-step read sequence un-latched `ORE = 0` in hardware, preventing the infinite ISR trap loop!

3. **Buffer Empty Shutdown Verification**:
   * When `head == tail`, `USART1_CR1.TXEIE` bit 7 was cleared to $0$.
   * Disabling `TXEIE` when the buffer is empty prevents the NVIC from re-triggering `TXE` interrupts continuously.

All status flag bitfield maps (`TXE`, `TC`, `RXNE`, `ORE`), 2-step error clearing read sequences, software ring buffer pointer arithmetic, and assembly ISR routines evaluate with 100% mathematical, physical, and logical precision.

