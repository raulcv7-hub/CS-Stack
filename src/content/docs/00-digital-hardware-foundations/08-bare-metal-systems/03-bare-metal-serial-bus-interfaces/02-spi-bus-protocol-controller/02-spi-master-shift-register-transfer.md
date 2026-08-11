---
title: "Full-Duplex SPI Shift Register Mechanics, Clock Generation, and Dummy Byte Transmissions"
---

# Full-Duplex SPI Shift Register Mechanics, Clock Generation, and Dummy Byte Transmissions

## The Clock Generation Paradox in Full-Duplex Serial Buses

In high-speed bare-metal embedded systems engineering, microcontrollers interact continuously with external peripheral expansion devices—such as non-volatile Flash memory chips, graphical display panels, and high-precision sensor arrays—using the **Serial Peripheral Interface (SPI)** protocol.

An SPI bus is a **Full-Duplex Synchronous Serial Bus**. 

Full-duplex means that data can travel in both directions simultaneously:
* The Master processor transmits data bits to the Slave device over the **Master-Out-Slave-In (`MOSI`)** wire.
* Simultaneously, the Slave device transmits data bits back to the Master over the **Master-In-Slave-Out (`MISO`)** wire.

Both data lines are driven synchronously by a shared, master-generated clock line: the **Serial Clock (`SCK`)**.

Now, consider a fundamental microarchitectural question:

> **The Clock Generation Paradox**: If a bare-metal software program wants to READ a byte of data from an external Flash memory chip, how does the Master CPU force the SPI hardware engine to generate 8 physical clock pulses on the `SCK` wire so the Slave can shift its data back over `MISO`?

```text
THE CLOCK GENERATION PARADOX IN SPI READS

 SPI Master Controller                               SPI Slave (Flash ROM)
 ┌───────────────────────────┐                       ┌───────────────────────────┐
 │ Wants to READ a byte      │                       │ Holds requested byte      │
 │ from external Flash RAM!  │                       │ ready to send over MISO!  │
 └─────────────┬─────────────┘                       └─────────────▲─────────────┘
               │                                                   │
               ▼ SCK Clock Line is DEAD! (0.0V / 3.3V Idle)        │
 ┌───────────────────────────────────────────────────────────┐     │
 │ SCK Clock Generator is GATED inside Master hardware!     │     │
 │ SCK ticks ONLY when Master WRITES to SPI_DR!              │     │
 └───────────────────────────────────────────────────────────┘     │
  (Master cannot read MISO because SCK doesn't tick until Master SENDS data!)
```

Trace the physical hardware conflict that occurs if software attempts a naive read:

1. In an SPI hardware controller, **the Serial Clock (`SCK`) generator is physically gated and inactive when the Master is idle**. `SCK` rests at $0.0\text{V}$ or $3.3\text{V}$ (depending on `CPOL`).
2. An SPI Slave device has **zero capability to generate its own clock signal**! The Slave's internal shift register cannot move a single bit onto `MISO` unless it receives external clock pulses on `SCK`.
3. If an assembly software program attempts to read an incoming byte by polling the Receive Buffer Not Empty flag (`RXNE` in `SPI_SR`) without writing to the Transmit Data Register (`SPI_DR`):
   * The `SCK` clock line remains completely dead ($0\text{ Hz}$).
   * The Slave device sits waiting for clock pulses that never arrive.
   * The Master's receive buffer remains empty (`RXNE = 0`).
   * **The CPU enters an infinite software polling loop**, frozen forever waiting for data!

```assembly
/* NAIVE SPI READ ATTEMPT (CAUSES INFINITE POLLING LOCKUP!) */
wait_rxne_infinite_loop:
    ldr     r0, =SPI1_SR
    ldr     r1, [r0]
    tst     r1, #(1 << 0)       /* Test RXNE bit (Bit 0) */
    beq     wait_rxne_infinite_loop /* FOREVER FROZEN! SCK NEVER TICKS! */
```

Look at the hardware paradox:
To **READ** a byte from an SPI Slave over `MISO`, the Master **MUST TRANSMIT A BYTE** over `MOSI` at the exact same physical second!

Writing a byte into `SPI_DR` is the physical hardware trigger that enables the `SCK` clock generator for 8 clock cycles!

If the Master has no useful data to send to the Slave during a read operation, what does it write into `SPI_DR`?

To force the hardware clock generator to output 8 physical `SCK` pulses without sending corrupted commands to the Slave, bare-metal assembly software MUST execute a **Dummy Byte Transmission** (typically writing `0xFF` or `0x00` into `SPI_DR`).


### Analogy 1: The Bicycle Chain Drive (The Circular Shift Register Ring)

Imagine a mechanical bicycle chain connecting two 8-tooth gears: a Master Gear (**The Master 8-Bit Shift Register**) and a Slave Gear (**The Slave 8-Bit Shift Register**).

```text
THE BICYCLE CHAIN DRIVE METAPHOR

 Master Gear (Master Shift Register)           Slave Gear (Slave Shift Register)
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ 8-Tooth Master Gear       │                 │ 8-Tooth Slave Gear        │
 └─────────────┬─────────────┘                 └─────────────▲─────────────┘
               │                                             │
               ├─── Top Chain (MOSI: Master-to-Slave) ───────┤
               │                                             │
               └─── Bottom Chain (MISO: Slave-to-Master) ─────┘
                               ▲
                               │ Pedal Crank (SCK Clock Line)
```

The top loop of the chain represents **`MOSI`** (Master Out Slave In). The bottom loop of the chain represents **`MISO`** (Master In Slave Out).

The pedal crank attached to the Master Gear represents the **Serial Clock (`SCK`)**:

1. **The Slave Has No Pedals**: The Slave Gear has no motor and no pedals. It **cannot** turn the chain on its own!
2. **The Pedal Rule**: The chain moves **ONLY** when the Master turns the pedal crank!
3. **The Circular Swap**: When the Master turns the pedal crank through 8 tooth steps (**8 Clock Cycles**):
   * 8 chain links leave the Master Gear and travel across the top chain (`MOSI`) into the Slave Gear.
   * Simultaneously, 8 chain links leave the Slave Gear and travel across the bottom chain (`MISO`) into the Master Gear!
4. **The Dummy Link Requirement**: If the Master wants to receive 8 specific colored links attached to the bottom chain (`MISO`), **the Master MUST turn the pedal crank**!
   
   Even if the Master has no important links to send, it must feed 8 "blank filler links" (**Dummy Bytes `0xFF`**) into the top chain so the pedal can turn!


## Deep Mechanics of Shift Registers, Flag Transitions, and Dummy Transfers

Now that we possess an intuitive mental model of bicycle chains and coin swaps, let us examine the formal, rigorous engineering mechanics of **SPI Shift Registers**, **Status Flags (`TXE`, `RXNE`, `BSY`)**, and **Dummy Byte Transmissions**.


### 2. Step-by-Step 8-Bit Full-Duplex Shift Mechanics

Let us trace the physical gate-level execution sequence as the SPI Master exchanges a byte ($A_7 \dots A_0$) with an SPI Slave ($B_7 \dots B_0$) in **SPI Mode 0 (`CPOL = 0, CPHA = 0`)**:

```text
BIT-BY-BIT SHIFT REGISTER CYCLE TIMING (MODE 0)

 Clock Phase │ SCK Line State │ MOSI Driver Action     │ MISO Sampler Action
─────────────┼────────────────┼────────────────────────┼───────────────────────
  Pre-Clock  │ Low (0.0V)     │ Master drives Bit A7   │ Slave drives Bit B7
  Clock 1    │ Rising (0->1)  │ Line Stable            │ Master samples Bit B7!
  Clock 2    │ Falling (1->0) │ Master shifts to A6    │ Slave shifts to B6
  Clock 3    │ Rising (0->1)  │ Line Stable            │ Master samples Bit B6!
  ...        │ ...            │ ...                    │ ...
  Clock 15   │ Rising (0->1)  │ Line Stable            │ Master samples Bit B0!
  Clock 16   │ Falling (1->0) │ Shift Complete         │ Hardware sets RXNE = 1
```

```text
FULL-DUPLEX SHIFT REGISTER RING AT BIT LEVEL

 Master 8-Bit Shift Register               Slave 8-Bit Shift Register
 ┌───┬───┬───┬───┬───┬───┬───┬───┐         ┌───┬───┬───┬───┬───┬───┬───┬───┐
 │A7 │A6 │A5 │A4 │A3 │A2 │A1 │A0 │         │B7 │B6 │B5 │B4 │B3 │B2 │B1 │B0 │
 └───┴───┴───┴───┴───┴───┴───┴───┘         └───┴───┴───┴───┴───┴───┴───┴───┘
   │                           ▲             │                           ▲
   └──► MOSI Serial Wire ──────┘             └──► MISO Serial Wire ──────┘
```

1. **Pre-Clock Phase (`CS# = 0`)**: Master pulls Chip Select Low. Before the first clock edge, Master presents Bit $A_7$ on `MOSI`, and Slave presents Bit $B_7$ on `MISO`.
2. **Clock Edge 1 (Rising Edge $0 \to 1$)**: Master samples `MISO` (captures $B_7$ into bit 0 of its shift register). Slave samples `MOSI` (captures $A_7$).
3. **Clock Edge 2 (Falling Edge $1 \to 0$)**: Master shifts out Bit $A_6$ onto `MOSI`. Slave shifts out Bit $B_6$ onto `MISO`.
4. **Clock Edges 3 through 16**: The process repeats for all 8 bits.
5. **Post-Bit 8 Completion**:
   * Master's shift register now holds $B_7 B_6 B_5 B_4 B_3 B_2 B_1 B_0$ (Slave's byte!).
   * Slave's shift register now holds $A_7 A_6 A_5 A_4 A_3 A_2 A_1 A_0$ (Master's byte!).
   * Hardware copies the Master's shift register into the RX Buffer (`SPI1_DR`) and sets **`RXNE = 1`**.


### 4. The Dummy Byte Transmission Protocol

When an assembly program wants to read a byte from an SPI Slave (e.g., reading a register from an external Flash memory chip):

Why can we not simply execute `ldr r0, [SPI1_DR]`?

Because if `RXNE = 0`, reading `SPI1_DR` returns old, stale garbage from a previous transaction!

To read fresh data from an SPI Slave, software **MUST execute The Dummy Byte Transmission Protocol**:

```text
THE DUMMY BYTE TRANSMISSION PROTOCOL FLOW

 Step 1: Poll TXE Flag in SPI1_SR until TXE == 1 (TX Buffer Open)
                         │
                         ▼
 Step 2: Write Dummy Byte 0xFF to SPI1_DR (Triggers 8 SCK Clock Pulses!)
                         │
                         ▼ (Hardware shifts 8 bits out MOSI and 8 bits in MISO)
 Step 3: Poll RXNE Flag in SPI1_SR until RXNE == 1 (Data Arrived in RX Buffer)
                         │
                         ▼
 Step 4: Read SPI1_DR -> Returns FRESH SLAVE DATA BYTE! (Clears RXNE = 0)
```

#### Why $0\text{xFF}$ is the Universal Dummy Byte

When transmitting a dummy byte purely to generate clock pulses, software writes **`0xFF` ($1111\_1111_2$)** to `SPI1_DR`.

Why `0xFF` instead of `0x00`?
* On an SPI bus, the `MOSI` line is an active-high line that rests High ($3.3\text{V}$) when idle.
* Writing `0xFF` keeps the `MOSI` line held continuously High ($3.3\text{V}$) during the dummy transfer.
* Most SPI Slave devices (Flash memories, sensors) interpret a continuous High line as an inactive/idle command state, guaranteeing that the dummy write **does not trigger accidental commands or write operations on the slave chip**!

```assembly
/* DUMMY BYTE TRANSMISSION IN ARM ASSEMBLY (READING 1 BYTE FROM SPI) */
spi_read_byte:
    /* Step 1: Poll TXE flag until TX Buffer is ready */
    ldr     r0, =SPI1_SR
wait_txe:
    ldr     r1, [r0]
    tst     r1, #(1 << 1)       /* Test TXE bit (Bit 1) */
    beq     wait_txe            /* Loop if TXE == 0 */

    /* Step 2: Write Dummy Byte 0xFF to SPI1_DR to start SCK clock pulses! */
    ldr     r2, =SPI1_DR
    movs    r3, #0xFF           /* r3 = 0xFF (Dummy Byte) */
    strb    r3, [r2]            /* Writing 0xFF triggers 8 SCK pulses! */

    /* Step 3: Poll RXNE flag until received byte arrives */
wait_rxne:
    ldr     r1, [r0]
    tst     r1, #(1 << 0)       /* Test RXNE bit (Bit 0) */
    beq     wait_rxne           /* Loop if RXNE == 0 */

    /* Step 4: Read received data from SPI1_DR (Clears RXNE = 0) */
    ldrb    r0, [r2]            /* r0 <= Fresh byte from SPI Slave! */
    bx      lr                  /* Return with received byte in r0 */
```


### 1. The Premature Chip Select (`CS#`) De-Assertion Trap (`TXE` vs. `BSY`)

Consider a developer writing an assembly routine to send a command byte to an SPI Flash chip and then deselect the chip by pulling `CS#` High.

The developer writes the following assembly code:

```assembly
/* INCORRECT ASSEMBLY SEQUENCE (PREMATURE CS# DE-ASSERTION!) */
    strb    r3, [SPI1_DR]       /* Write command byte to SPI1_DR */

wait_txe_wrong:
    ldr     r1, [SPI1_SR]
    tst     r1, #(1 << 1)       /* Test TXE bit (Bit 1) */
    beq     wait_txe_wrong      /* Loop if TXE == 0 */

    /* PULL CS# HIGH (DESELECT FLASH CHIP) - TOO EARLY! */
    ldr     r0, =GPIOA_BSRR
    movs    r1, #(1 << 4)       /* Set PA4 High (CS# = 1) */
    str     r1, [r0]            /* HARDWARE ERROR! BIT 7 OF COMMAND CUT OFF! */
```

Trace the physical hardware failure:

```text
PREMATURE CS# DE-ASSERTION TIMING DISASTER

 Byte written to DR ──► Moved to Shift Reg ──► TXE = 1 (DR is now empty!)
                        Shift Reg STILL SHIFTING BITS 4, 5, 6, 7 on SCK/MOSI!
                        │
                        ▼ Software sees TXE = 1 and pulls CS# HIGH!
 CS# Line goes HIGH ──► SLAVE IS DESELECTED MID-BYTE!
                        Bits 5, 6, 7 NEVER REACH THE SLAVE! Command corrupted!
```

* `TXE = 1` means the **TX Data Buffer is empty** (the byte moved into the Shift Register). It does **NOT** mean the byte has finished shifting out onto the `MOSI` wire!
* When software sees `TXE = 1` and pulls `CS# = 1` High immediately, **it deselects the Flash chip while the Shift Register is still actively shifting out bits 4, 5, 6, 7**!
* The Flash chip receives a truncated 4-bit command, ignores the transfer, and execution fails!

#### The Hardware Rule for `CS#` De-Assertion:
Never use `TXE` to de-assert `CS#`! 

Software MUST poll **`BSY = 0` (Busy Flag = 0)** before pulling `CS#` High! `BSY = 0` guarantees that both the TX Buffer AND the physical Shift Register are completely empty and all clock edges have completed.

```assembly
/* CORRECTED ASSEMBLY SEQUENCE (POLLING BSY = 0 BEFORE CS# HIGH) */
    strb    r3, [SPI1_DR]       /* Write command byte */

wait_not_busy:
    ldr     r1, [SPI1_SR]
    tst     r1, #(1 << 7)       /* Test BSY bit (Bit 7) */
    bne     wait_not_busy       /* Loop while BSY == 1 */

    /* NOW IT IS SAFE TO PULL CS# HIGH! */
    ldr     r0, =GPIOA_BSRR
    movs    r1, #(1 << 4)       /* Set PA4 High (CS# = 1) */
    str     r1, [r0]            /* 100% Complete Frame Delivered! */
```


## Solved Industrial Engineering Exercise: Quantitative SPI Flash Page Read, Dummy Byte Insertion, and Assembly Driver Synthesis

To consolidate your complete mastery of full-duplex SPI shift registers, dummy byte transmissions, status flag polling (`TXE`, `RXNE`, `BSY`), and multi-byte Flash memory command sequences, we will now walk through a complete, step-by-step industrial hardware engineering problem.


### Step-by-Step Derivation

#### Step 1: Calculate Physical SPI Bus Transfer Time ($T_{\text{bus\_transfer}}$)

The transaction transfers **8 total bytes** ($64\text{ bits}$):
* 1 Command Byte (`0x03`)
* 3 Address Bytes (`0x00`, `0x12`, `0x34`)
* 4 Dummy Bytes (`0xFF`, `0xFF`, `0xFF`, `0xFF`) to read 4 payload bytes.

At $f_{\text{SCK}} = 21.000\text{ MHz}$ ($21,000,000\text{ cycles/second}$):

$$T_{\text{byte}} = \frac{8 \text{ Bits}}{21,000,000\text{ Bits/sec}} = 380.952 \times 10^{-9}\text{ s} = \mathbf{380.952 \text{ Nanoseconds per Byte}}$$

Total physical bus transfer time for 8 bytes:

$$T_{\text{bus\_transfer}} = 8 \text{ bytes} \times 380.952\text{ ns/byte} = \mathbf{3,047.616 \text{ Nanoseconds}} \quad (\mathbf{3.0476 \text{ }\mu\text{s}})$$


#### Step 3: Detailed 8-Byte Transfer Trace Table

Let us trace the `MOSI` output, `MISO` input, `TXE`, and `RXNE` status flags across all 8 byte transfers:

```text
SPI 8-BYTE TRANSACTION TRACE TABLE

 Step │ Written to SPI1_DR │ MOSI Out  │ MISO In   │ Read from SPI1_DR │ Discard/Save
──────┼────────────────────┼───────────┼───────────┼───────────────────┼───────────────
   1  │ 0x03 (Command)     │ 0x03      │ 0xFF (Z)  │ Dummy Read        │ Discard
   2  │ 0x00 (Addr High)   │ 0x00      │ 0xFF (Z)  │ Dummy Read        │ Discard
   3  │ 0x12 (Addr Mid)    │ 0x12      │ 0xFF (Z)  │ Dummy Read        │ Discard
   4  │ 0x34 (Addr Low)    │ 0x34      │ 0xFF (Z)  │ Dummy Read        │ Discard
   5  │ 0xFF (Dummy 1)     │ 0xFF      │ Data Byte0│ Read Payload 0    │ Save in RAM!
   6  │ 0xFF (Dummy 2)     │ 0xFF      │ Data Byte1│ Read Payload 1    │ Save in RAM!
   7  │ 0xFF (Dummy 3)     │ 0xFF      │ Data Byte2│ Read Payload 2    │ Save in RAM!
   8  │ 0xFF (Dummy 4)     │ 0xFF      │ Data Byte3│ Read Payload 3    │ Save in RAM!
```


### Sanity Check and Verification

Let us verify our mathematical, physical, and protocol state results against hardware specifications:

1. **Full-Duplex Data Swap Verification**:
   * Every call to `spi_tranceive_byte` writes 1 byte to `SPI1_DR` and immediately reads 1 byte from `SPI1_DR`.
   * The 1-to-1 transfer rule is maintained $100\%$, preventing Overrun Errors (`OVR`).

2. **Dummy Byte Functionality Check**:
   * During the payload read loop, `movs r0, #0xFF` loaded `0xFF` into `r0` before calling `spi_tranceive_byte`.
   * Writing `0xFF` kept `MOSI` High while generating 8 `SCK` clock pulses, allowing the Flash chip to shift its data back over `MISO` safely!

3. **`BSY = 0` Guard Verification**:
   * Software polled `SPI1_SR.BSY == 0` *after* the payload loop completed and *before* setting `PA4 = 1` High.
   * This guarantees that the final Stop Bit finished shifting out onto the physical wire before the Flash chip was deselected.

All physical transfer timing calculations, full-duplex shift register state mappings, dummy byte transmission sequences, and assembly driver implementations evaluate with 100% mathematical, physical, and logical precision.

