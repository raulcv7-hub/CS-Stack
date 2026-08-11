content/00-digital-hardware-foundations/09-platform-bootstrapping/lessons/04-platform-bus-enumeration/01-pcie-bus-tree-scanning/02-base-address-register-allocation.md
# 02-base-address-register-allocation — Base Address Register (BAR) Resource Allocation, Non-Overlapping MMIO Assignment, and Hot-Plug Bridge Padding

## 1. The Overlapping Memory Window Collision Hazard

When early platform firmware completes recursive PCI Express (PCIe) bus scanning, every root port, switch bridge, and peripheral endpoint attached to the motherboard has been assigned a unique 16-bit Bus/Device/Function (BDF) identifier. The host central processing unit (CPU) now possesses a complete topological map of the interconnect tree.

However, despite knowing where every expansion device sits in the interconnect tree, **the CPU still cannot read or write a single byte of data to any device's control registers, internal status FIFOs, or frame memories!**

Why? Because the device's Memory-Mapped Input/Output (MMIO) registers have not been assigned physical memory addresses.

In modern computer architectures, CPUs communicate with peripheral devices using **Memory-Mapped I/O (MMIO)**. 

Under MMIO, a peripheral device's hardware registers are assigned specific numerical address ranges within the processor's global physical memory space. 

When a CPU core executes a standard memory instruction—such as `STORE R1, [0x8000_1000]`—the interconnect crossbar routes the request to the physical device configured to respond to address `0x8000_1000`.

Each peripheral endpoint requires a specific, contiguous physical memory window:
* A basic audio controller might require a small $4\text{-Kilobyte}$ ($4,096\text{-byte}$) memory window for its status registers.
* A $100\text{-Gigabit}$ Ethernet network interface card (NIC) might require a $16\text{-Megabyte}$ ($16,777,216\text{-byte}$) memory window for its descriptor rings and doorbell registers.
* A high-performance graphics processing unit (GPU) might require a massive $16\text{-Gigabyte}$ ($17,179,869,184\text{-byte}$) memory window for its video RAM (VRAM) frame buffer.

Now, consider the catastrophic physical hardware failure that occurs if early boot firmware assigns memory ranges blindly or allows two devices to overlap:

```text
THE OVERLAPPING MMIO WINDOW COLLISION HAZARD

 Global System Physical Address Space
 ┌─────────────────────────────────────────────────────────────┐
 │ Overlapping MMIO Region: 0x8000_0000 to 0x80FF_FFFF         │
 └──────────────────────────────┬──────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼ Both devices respond to 0x8000_0000!          ▼
 ┌──────────────┐                               ┌──────────────┐
 │ Endpoint A   │                               │ Endpoint B   │
 │ (GPU Card)   │                               │ (NVMe SSD)   │
 └──────────────┘                               └──────────────┘
  (Data drivers collide on interconnect wires -> SILICON DATA CORRUPTION!)
```

Trace the physical hardware collision:

1. **Address Overlap Collision**: Suppose early firmware assigns the exact same physical memory address range (`0x8000_0000` to `0x80FF_FFFF`) to both Endpoint A (a GPU card) and Endpoint B (an NVMe SSD).
2. **Bus Driver Contention**: When the CPU core executes a memory write instruction to address `0x8000_0000`, **both Endpoint A and Endpoint B detect a match in their internal address decoders and attempt to respond on the interconnect wires simultaneously!**
3. **Hardware Crash**: Transistor drivers on both chips pull the physical bus lines in opposite directions ($1.2\text{ V}$ versus $0.0\text{ V}$), causing electrical short-circuit currents, data bit corruption, and hard interconnect bus locks.
4. **Bridge Blocking Hazard**: Furthermore, if a PCIe switch bridge sitting above these endpoints does not have its internal **Memory Base and Memory Limit registers** programmed to encompass the exact sum of all downstream device memory windows, the bridge will **block and drop all MMIO packets**, rendering downstream devices completely inaccessible!

A platform cannot function with un-configured or overlapping device memory windows!

Before the operating system kernel boots, early platform firmware must query the exact physical memory size requirements of every Base Address Register (BAR) on every device, sort and align those requests to natural power-of-two address boundaries, program non-overlapping MMIO ranges into bridge configuration headers, reserve extra padding for hot-pluggable devices, and configure early IOMMU protection domains.

To achieve non-conflicting memory-mapped device access, computer architectures employ **BAR Resource Allocation**, **Non-Overlapping MMIO Assignment**, **Hot-Plug Bridge Padding**, and **Early IOMMU Protection**.

---

## 2. The Shopping Mall Real Estate Agent and the Sizing Mask

To build an intuitive, crystal-clear mental model of Base Address Registers (BARs), all-ones sizing masks, natural power-of-two alignment, and bridge MMIO base/limit windows before inspecting bitwise configuration headers, 64-bit BAR pairing rules, and allocation algorithms, let us consider an everyday analogy: **The Shopping Mall Real Estate Manager**.

Imagine a commercial real estate manager (**Platform Boot Firmware**) assigning physical storefront locations (**MMIO Memory Addresses**) inside a newly built, multi-story shopping mall (**The System Address Space**).

```text
THE SHOPPING MALL REAL ESTATE ANALOGY

 Shopping Mall Building (System Address Space)   Real Estate Manager
 ┌───────────────────────────┐                 ┌───────────────────────────┐
 │ 4-Story Commercial Mall   │                 │ Assigns Non-Overlapping   │
 │ (0x0000_0000 - 0xFFFFFFFF)│                 │ Storefront Address Ranges │
 └─────────────┬─────────────┘                 └─────────────▲─────────────┘
               │                                             │
               ▼ Un-Configured Storefront Spaces             │
 ┌───────────────────────────────────────────────────────────┴─────────────┐
 │ Shopkeepers (PCIe Endpoints): Need Different Store Sizes                │
 │  * Jewelry Kiosk (Audio Card) : Requires 4 Sq Ft                        │
 │  * Shoe Store    (Network NIC) : Requires 1,000 Sq Ft                   │
 │  * Dept Store    (GPU VRAM)   : Requires 10,000 Sq Ft                   │
 └─────────────────────────────────────────────────────────────────────────┘
```

Different shopkeepers (**Peripheral Devices / BARs**) arrive at the mall wanting to set up shop. 

Each shopkeeper requires a completely different amount of floor space:
* A small jewelry kiosk (**Audio Controller BAR**) needs only $4\text{ square feet}$.
* A shoe store (**Network Card BAR**) needs $1,000\text{ square feet}$.
* A massive anchor department store (**GPU Frame Buffer BAR**) needs $10,000\text{ square feet}$.

If the real estate manager assigns storefront addresses blindly without asking each shopkeeper how much space they need:
* Shopkeeper A and Shopkeeper B will set up their sales counters in the exact same room (**Address Collision**)!
* Customers trying to buy shoes will end up buying jewelry, and workers will trip over each other (**Data Corruption**).

How does the real estate manager discover each shopkeeper's space requirement without asking them in person?

Every shopkeeper carries a **Blank Metal Measuring Ruler (A Base Address Register / BAR)** mounted on the back of their counter!

The real estate manager uses an ingenious trick called **The All-Ones Sizing Trick (The BAR Sizing Algorithm)**:

```text
THE ALL-ONES SIZING TRICK

 1. Manager Writes ALL 1s : [ 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 ]
                            │
                            ▼ (Plaque's internal mechanism forces bottom 12 bits to 0!)
 2. Manager Reads Back   : [ 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 ]
                            ◄────────────── 20 Ones ─────────────► ◄── 12 Zeros (2^12 = 4 KB) ─►
```

1. **Coloring the Ruler Black (Writing All 1s)**: The manager takes a black marker and writes **ALL 1s** (`0xFFFF_FFFF`) over the shopkeeper's blank metal measuring ruler.
2. **The Hardwired Internal Springs**: Inside the ruler, the shopkeeper's internal hardware mechanism **forces all the lower bits corresponding to its required size to remain WHITE (`0`)**, while allowing the upper bits to stay black (`1`)!
   * If the shoe store requires a $4,096\text{-sq-ft}$ space ($2^{12} = 4,096$), the ruler's internal mechanism **forces the bottom 12 bits to $0$ (`0000_0000_0000_2`)**, leaving the top 20 bits as $1$ (`1111...1100_0000_0000_0000_2`).
3. **Reading the Mask**: The manager reads the ruler back: *"Aha! The bottom 12 bits are hardwired to zero! $2^{12} = 4,096$! This shop requires a $4\text{-KB}$ contiguous space!"*

---

### The Power-of-Two Alignment and Sorting Rule

Now that the real estate manager knows the exact size of every shop, how do they arrange them in the mall without wasting space?

The manager obeys **The Power-of-Two Natural Alignment Rule**:

> **Natural Alignment Rule**: A shop requiring a size of $S = 2^B$ square feet MUST be placed at a street address that is an exact mathematical multiple of $S$!

If a department store needs $16\text{ Megabytes}$ ($2^{24}\text{ bytes}$), its starting address **must end in 24 zeros** (e.g. `0x8000_0000` or `0x8100_0000`).

To avoid wasting space between shops, the real estate manager sorts all shops from **LARGEST TO SMALLEST**:

```text
SORTING BAR ALLOCATIONS FROM LARGEST TO SMALLEST

 Un-Sorted Allocation (Wastes Space!):
 [ 4 KB Kiosk @ 0x8000_0000 ] ──► [ 16 MB Gap Wasted! ] ──► [ 16 MB Dept Store @ 0x8100_0000 ]

 Sorted Allocation (Zero Waste!):
 [ 16 MB Dept Store @ 0x8000_0000 ] ──► [ 4 KB Kiosk @ 0x8100_0000 ] (100% Contiguous!)
```

* **Un-Sorted Allocation (Bad!)**: If the manager places a tiny $4\text{-KB}$ kiosk at `0x8000_0000`, the next available address is `0x8000_1000`. If the next shop is a $16\text{-MB}$ department store, its base address MUST align to `0x8100_0000`. 
  
  The space between `0x8000_1000` and `0x80FF_FFFF` ($15.996\text{ Megabytes}$) is **completely wasted as an un-usable fragmented gap**!
* **Sorted Allocation (Optimal!)**: By placing the $16\text{-MB}$ department store FIRST at `0x8000_0000`, it fills `0x8000_0000` to `0x80FF_FFFF`. The $4\text{-KB}$ kiosk is then placed immediately next to it at `0x8100_0000`. **Zero bytes are wasted!**

#### What About Hot-Plug Expansion Slots?
For empty storefronts equipped with hot-plug double doors (**PCIe Hot-Plug Slots**), the manager reserves an extra $64\text{-MB}$ vacant lot behind the door (**Hot-Plug Bridge Padding**). 

When a new store pops up during business hours, it occupies the reserved vacant lot without requiring the manager to tear down adjacent shops!

This real estate manager system is the exact physical analogue of **BAR Resource Allocation and Non-Overlapping MMIO Assignment**:
* The shopping mall is the **System Physical Address Space**.
* Shopkeepers are **PCIe Endpoints / BARs**.
* Storefront locations are **MMIO Physical Addresses**.
* The blank metal ruler is a **Base Address Register (BAR)**.
* Writing all 1s is **BAR Sizing Mask Probing**.
* Hardwired lower zeros are **Power-of-Two Natural Alignment Bits**.
* Sorting largest to smallest is **BAR Priority Sorting**.
* Reserved vacant lots are **Hot-Plug Bridge MMIO Padding**.

---

## 3. Formal Mechanics of BAR Sizing, Allocation, and Early IOMMU Protection

Now that we possess an intuitive mental model of real estate managers, all-ones rulers, and power-of-two sorting, let us examine the formal, rigorous engineering mechanics of **Base Address Register (BAR) Resource Allocation** and **Bridge Window Programming**.

---

### Primitive 1: The 5-Step BAR Sizing and Alignment Algorithm

A **Base Address Register (BAR)** is a $32\text{-bit}$ configuration register (or a paired $64\text{-bit}$ register) located within a PCIe device's Type 0 Configuration Header (offsets `0x10` through `0x24`).

```text
BITWISE LAYOUT OF A 32-BIT MEMORY BASE ADDRESS REGISTER (BAR)

 Bit 31                                                Bit 4 Bit 3 Bit 2 Bit 1 Bit 0
 ┌──────────────────────────────────────────────────────────┬─────┬───────┬─────┬─────┐
 │ Base Address Field [31:4]                                │ Pref│ Type  │ 0   │ Ind │
 │ (Holds upper allocated physical memory address bits)     │ (1b)│ [2:1] │(1b) │ (0) │
 └──────────────────────────────────────────────────────────┴─────┴───────┴─────┴─────┘
  ◄────────────────── Programmable Base Address ───────────► ◄── Read-Only Flags ──►
```

Let us review the read-only control flags in bits $[3:0]$:
* **Bit 0 (`Memory Space Indicator`)**: $0 =$ Memory-Mapped I/O (MMIO); $1 =$ Legacy I/O Port.
* **Bits [2:1] (`Memory Type`)**: $00_2 =$ 32-Bit BAR (Address $< 4\text{ GB}$); $10_2 =$ **64-Bit BAR Paired Register**!
* **Bit 3 (`Prefetchable Flag`)**: $0 =$ Non-Prefetchable MMIO (control registers with read side-effects); $1 =$ **Prefetchable MMIO** (video frame buffers / RAM without read side-effects).

---

#### The 5-Step Mathematical BAR Sizing Sequence

To discover the exact memory size $S$ requested by a device's BAR, early platform firmware executes **The 5-Step BAR Sizing Algorithm**:

```text
THE 5-STEP BAR SIZING ALGORITHM

 Step 1: Read Original Value   ──► V_orig = ReadConfig32(BAR_offset)
 Step 2: Write ALL 1s          ──► WriteConfig32(BAR_offset, 0xFFFF_FFFF)
 Step 3: Read Back Sizing Mask ──► V_mask = ReadConfig32(BAR_offset)
 Step 4: Compute Requested Size──► Size S = ~(V_mask & 0xFFFF_FFF0) + 1
 Step 5: Assign Aligned Base   ──► WriteConfig32(BAR_offset, A_base)
```

#### Step-by-Step Algorithm Execution:

1. **Step 1 (Save Original Value)**:
   Firmware reads and saves the original value $V_{\text{orig}}$ from $\text{BAR}_k$:
   $$V_{\text{orig}} = \text{ReadConfig32}(\text{BAR}_k)$$

2. **Step 2 (Write All 1s)**:
   Firmware writes `0xFFFF_FFFF` into $\text{BAR}_k$:
   $$\text{WriteConfig32}(\text{BAR}_k, \text{0xFFFF\_FFFF})$$

3. **Step 3 (Read Back Sizing Mask)**:
   Firmware reads back the modified value $V_{\text{mask}}$ from $\text{BAR}_k$:
   $$V_{\text{mask}} = \text{ReadConfig32}(\text{BAR}_k)$$
   * **The Hardware Masking Mechanics**: Inside the silicon die, the device's internal hardwired logic **forces all lower address bits corresponding to its required size to ZERO ($0$)**, while allowing the higher address bits to store $1\text{s}$!

4. **Step 4 (Calculate Required Memory Size $S$)**:
   Firmware masks out the read-only flag bits $[3:0]$ and calculates the requested memory size $S$ in bytes:

$$V_{\text{addr\_mask}} = V_{\text{mask}} \quad \mathbf{\&} \quad \text{0xFFFF\_FFF0}$$

$$\mathbf{\text{Requested Size } S = (\sim V_{\text{addr\_mask}}) + 1}$$

Where:
* $V_{\text{mask}}$ is the 32-bit value read back from the BAR after writing all 1s.
* $\sim V_{\text{addr\_mask}}$ is the bitwise NOT inversion of the masked address bits.
* $S$ is the physical memory size in bytes requested by the device ($S = 2^B$).

5. **Step 5 (64-Bit BAR Handling)**:
   If bits $[2:1]$ of $V_{\text{mask}}$ equal $10_2$ (64-bit BAR):
   * $\text{BAR}_k$ and $\text{BAR}_{k+1}$ form a single 64-bit register.
   * Firmware repeats the sizing process on $\text{BAR}_{k+1}$ (writing `0xFFFF_FFFF` to $\text{BAR}_{k+1}$) to extract the upper 32 bits of the size mask.
   * The 64-bit size is $S_{64} = (\sim [V_{\text{mask1}} \mid V_{\text{addr\_mask0}}]) + 1$.

---

### Primitive 2: Non-Overlapping MMIO Assignment and Bridge Window Programming

Once firmware has probed all BARs in the system and calculated their required sizes $S_1, S_2, \dots, S_n$:

Firmware sorts all requested BARs into two distinct resource lists:
1. **32-Bit Non-Prefetchable MMIO List** (Control registers, $< 4\text{ GB}$).
2. **64-Bit Prefetchable MMIO List** (Frame buffers, $> 4\text{ GB}$).

Within each list, firmware **sorts all BARs in descending order of size** ($S_{\text{max}} \dots S_{\text{min}}$).

```text
SORTED NON-OVERLAPPING MMIO ALLOCATION PIPELINE

 Sorted BAR List (Largest to Smallest):
  1. BAR C (GPU VRAM)    : Size = 256 MB (0x1000_0000)
  2. BAR B (Network NIC) : Size =   1 MB (0x0010_0000)
  3. BAR A (Audio Kiosk) : Size =   4 KB (0x0000_1000)

 Sequential Allocation (Starting at Base A_base = 0x8000_0000):
  * BAR C Base = 0x8000_0000 (Aligned to 256 MB boundary!) ──► Range: 0x8000_0000..0x8FFF_FFFF
  * BAR B Base = 0x9000_0000 (Aligned to 1 MB boundary!)   ──► Range: 0x9000_0000..0x900F_FFFF
  * BAR A Base = 0x9010_0000 (Aligned to 4 KB boundary!)   ──► Range: 0x9010_0000..0x9010_0FFF
  (100% Contiguous Allocation with ZERO Fragmented Gaps!)
```

#### The Natural Alignment Assignment Invariant
When assigning physical base address $A_{\text{base}}$ to a BAR of size $S = 2^B$:

$$\mathbf{\text{Valid Base Address } A_{\text{base}} \iff A_{\text{base}} \pmod S == 0 \quad \iff \quad A_{\text{base}} \ \ \& \ \ (S - 1) == 0}$$

Firmware advances its allocation tracking pointer ($A_{\text{next}}$) sequentially after each assignment:

$$A_{\text{next}} \Leftarrow A_{\text{base}} + S$$

---

### Programming Type 1 Bridge Memory Base and Limit Registers

To allow MMIO read and write transactions to cross from a parent bus down through a PCIe switch bridge to a child endpoint, firmware **MUST program the bridge's Memory Base and Memory Limit registers**.

In a Type 1 Bridge Header (offsets `0x20` and `0x22`):

```text
TYPE 1 BRIDGE MEMORY BASE AND LIMIT REGISTERS

 Memory Base Register (Offset 0x20 - 16 Bits)    Memory Limit Register (Offset 0x22 - 16 Bits)
 Bit 15                         Bit 4 Bit 3 Bit 0 Bit 15                         Bit 4 Bit 3 Bit 0
 ┌───────────────────────────────────┬───────────┐ ┌───────────────────────────────────┬───────────┐
 │ Memory Base Address [31:20]       │ Reserved  │ │ Memory Limit Address [31:20]      │ Reserved  │
 └───────────────────────────────────┴───────────┘ └───────────────────────────────────┴───────────┘
  (1-Megabyte Aligned Base Address Bits)            (1-Megabyte Aligned Limit Address Bits)
```

* **`MEM_BASE` (Offset `0x20` — 16 Bits)**: Bits $[15:4]$ store bits $[31:20]$ of the lowest physical MMIO address assigned to any downstream device behind this bridge ($1\text{-MB}$ boundary alignment).
* **`MEM_LIMIT` (Offset `0x22` — 16 Bits)**: Bits $[15:4]$ store bits $[31:20]$ of the highest physical MMIO address assigned to any downstream device behind this bridge.

#### Bridge Hardware MMIO Routing Rule
When an MMIO write or read TLP carrying target address $A_{\text{target}}$ arrives at a Type 1 Bridge:

The bridge's internal hardware comparator evaluates the **Bridge MMIO Routing Invariant**:

$$\mathbf{\text{Forward Downstream} \iff (\text{MEM\_BASE} \ll 20) \le A_{\text{target}} \le ((\text{MEM\_LIMIT} \ll 20) \mid \text{0xFFFFF})}$$

If $A_{\text{target}}$ falls within the bridge's `MEM_BASE` to `MEM_LIMIT` window, the bridge forwards the TLP downstream toward the endpoint!

---

### Primitive 3: Hot-Plug Bridge Padding and Early IOMMU Protection

In enterprise servers and cloud infrastructure, two critical system-level edge cases must be integrated into the BAR allocation pipeline: **Hot-Plug Bridge Padding** and **Early IOMMU Domain Protection**.

```text
HOT-PLUG PADDING AND EARLY IOMMU SECURITY INTEGRATION

 1. Hot-Plug Bridge Padding:
 Bridge MMIO Window Size = Sum_of_Active_Child_BARs + Padding_HotPlug
 (Reserves 64 MB of extra MMIO headroom for future hot-plugged devices!)

 2. Early IOMMU Protection Domain Configuration:
 [ Configure IOMMU Domain Page Tables ] ──► Map ONLY Allocated BAR Ranges
                                            │
                                            ▼
 [ Set Command Register MSE = 1 & BME = 1 ] ──► Enable Device MMIO & DMA!
 (Blocks un-mapped device DMA writes from corrupting kernel DRAM during boot!)
```

#### 1. Hot-Plug Bridge Padding Mechanics
When firmware encounters a PCIe bridge port marked as **Hot-Plug Capable** (`Slot Capabilities Register` offset `0x14` bit 6 $= 1$):
* Firmware calculates the sum of all currently populated child BAR sizes ($\sum S_{\text{child}}$).
* Firmware adds a pre-configured **Hot-Plug Padding Quota** (e.g., $\text{Padding}_{\text{hotplug}} = 64\text{ MB}$ of Non-Prefetchable MMIO and $512\text{ MB}$ of Prefetchable MMIO).
* Firmware programs the bridge's `MEM_BASE` and `MEM_LIMIT` registers to encompass the expanded padded window size:

$$\text{Window\_Size}_{\text{bridge}} = \sum S_{\text{child}} + \text{Padding}_{\text{hotplug}}$$

When a new expansion card is hot-plugged into the slot at runtime, the operating system driver allocates the new card's BARs directly out of the reserved $64\text{-MB}$ padding window without re-configuring or disrupting any existing bridges or devices on the server!

#### 2. Early IOMMU Protection Domain Configuration
A critical security vulnerability during early boot is enabling a device's Direct Memory Access (DMA) before configuring its Input-Output Memory Management Unit (IOMMU) translation tables.

To enforce $100\%$ security during platform bootstrapping:

> **The Early IOMMU Protection Invariant**: Firmware MUST configure the IOMMU's Protection Domain page tables to map ONLY the device's explicitly assigned BAR MMIO ranges BEFORE enabling `Memory Space Enable (MSE = 1)` or `Bus Master Enable (BME = 1)` in the device's Command Register!

$$\mathbf{\text{Execution Order: } \quad \text{Program BARs} \implies \text{Setup IOMMU Domain} \implies \text{Set Command Register MSE = 1 \& BME = 1}}$$

If a malicious or buggy PCIe device attempts a DMA write to un-mapped system RAM during boot, the IOMMU blocks the transaction at the hardware gate, preventing early kernel memory corruption!

---

## Real-World Silicon Engineering: The 4GB MMIO Hole and Resizable BARs

In commercial motherboard architecture, allocating BAR resources requires managing physical address space boundaries and high-capacity VRAM windows.

### 1. The 32-Bit MMIO Hole Below 4 GB

In x86-64 computer systems, physical memory addresses below the 4-Gigabyte boundary (`0x0000_0000_0000_0000` to `0x0000_0000_FFFF_FFFF`) are shared between physical system DRAM memory and legacy 32-bit MMIO devices.

To accommodate legacy 32-bit devices and operating systems:
* The system BIOS reserves a physical memory window below 4 GB (typically `0x8000_0000` to `0xFC00_0000`, a $2\text{-GB}$ space) called **The 32-Bit MMIO Hole**.
* All **Non-Prefetchable 32-bit BARs** MUST be allocated inside this 32-bit MMIO hole.

```text
SYSTEM PHYSICAL ADDRESS SPACE LAYOUT WITH 32-BIT MMIO HOLE

 64-Bit Physical Address Space
 ┌─────────────────────────────────────────┐
 │ 64-Bit Prefetchable MMIO Window         │ ◄── 0x0000_0010_0000_0000 (64 GB Mark)
 │ (Holds 16 GB GPU VRAM BARs above 4 GB!)  │
 ├─────────────────────────────────────────┤
 │ System DRAM Memory (Upper RAM)          │ ◄── 0x0000_0001_0000_0000 (4 GB Boundary)
 ├─────────────────────────────────────────┤
 │ 32-Bit Non-Prefetchable MMIO Hole (2 GB)│ ◄── 0x0000_0000_8000_0000 (2 GB Boundary)
 │ (Holds 32-bit NIC and Audio Control BARs)│
 ├─────────────────────────────────────────┤
 │ System DRAM Memory (Lower RAM: 0-2 GB)  │
 └─────────────────────────────────────────┘ ◄── 0x0000_0000_0000_0000
```

#### What Happens if the 32-Bit MMIO Hole Runs Out of Space?
If a server contains multiple expansion cards requesting large 32-bit non-prefetchable BARs, the 2-GB MMIO hole will fill up completely ($100\%$ capacity).
* If firmware attempts to allocate a 32-bit BAR outside the MMIO hole, the address collides with physical system DRAM!
* **Architectural Solution**: Firmware relocates all **Prefetchable BARs** (such as GPU frame buffers) out of the 32-bit hole into high $64\text{-bit}$ physical memory space above the 4-GB boundary (e.g., starting at `0x10_0000_0000`), freeing the 32-bit hole exclusively for strict 32-bit non-prefetchable control registers!

---

### 2. Resizable BAR (ReBAR) Dynamic Allocation

In high-performance gaming GPUs and AI accelerators equipped with $16\text{ Gigabytes}$ or $24\text{ Gigabytes}$ of High Bandwidth Memory (HBM/VRAM):

Legacy GPU firmware requested a small $256\text{-MB}$ BAR window (`BAR0 = 256 MB`) for backwards compatibility with 32-bit operating systems.

Because the BAR window was limited to 256 MB, the CPU could access only 256 MB of VRAM at any time, requiring the driver to continuously swap $256\text{-MB}$ memory pages during game rendering or AI training (**VRAM Paging Overhead**).

Under **Resizable BAR (ReBAR)** architecture:
1. During boot, firmware reads the GPU's **Resizable BAR Capability Structure** in extended configuration space (offset `0x100+`).
2. The capability structure reports that the GPU supports BAR sizing up to **16 Gigabytes** ($16,384\text{ MB}$).
3. If 64-bit decoding is enabled in the host Root Complex, firmware resizes `BAR0` from 256 MB to **16 Gigabytes** and allocates a 16-GB physical window above the 4-GB boundary!
4. The CPU gains direct, un-impeded 64-bit access to the entire 16GB VRAM array in a single memory window, boosting GPU rendering performance by $10\%\text{ to } 20\%$!

---

## 5. Solved Quantitative Engineering Exercise

To consolidate your complete mastery of BAR sizing mask calculations, 64-bit BAR pairing, power-of-two natural address alignment, bridge base/limit window programming, and ECAM configuration latencies, let us walk through a complete, step-by-step quantitative engineering calculation.

---

### Scenario & Parameters

You are a principal platform software architect configuring the Memory-Mapped I/O (MMIO) address space for an enterprise server processor socket operating at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The server host features an ECAM memory window mapped at base address `0x0000_0000_E000_0000`.

The system contains three PCIe Endpoint BARs and one Type 1 Bridge requiring MMIO resource allocation:

```text
SERVER PCIE MMIO RESOURCE ALLOCATION PARAMETERS

 Device / BAR Target  │ Requested BAR Type & Properties │ Required Physical Size
──────────────────────┼─────────────────────────────────┼─────────────────────────
 BAR A (Audio Kiosk)  │ 32-Bit Non-Prefetchable Memory  │ 64 Kilobytes (65,536 B)
 BAR B (Network NIC)  │ 32-Bit Non-Prefetchable Memory  │ 1 Megabyte (1,048,576 B)
 BAR C (GPU VRAM)     │ 64-Bit Prefetchable Memory      │ 256 Megabytes (268,435,456 B)
 Bridge 1 (PCIe Switch)│ Hot-Plug Capable Bridge Port     │ Requires 15 MB Padding
```

#### System Physical Address Space Bounds:
* **32-Bit Non-Prefetchable MMIO Window Base**: $A_{\text{mmio32\_base}} = \mathbf{\text{0x0000\_0000\_8000\_0000}}$ ($2.0\text{ GB}$ mark).
* **64-Bit Prefetchable MMIO Window Base**: $A_{\text{mmio64\_base}} = \mathbf{\text{0x0000\_0010\_0000\_0000}}$ ($64.0\text{ GB}$ mark).

#### Hardware Execution Timings:
* Single ECAM 32-bit Configuration Read/Write: $T_{\text{cfg\_op}} = 120\text{ CPU clock cycles}$ ($37.5\text{ ns}$).
* BAR Sizing Operation per 32-bit BAR: Requires 2 ECAM writes (`0xFFFF_FFFF` then base address) and 2 ECAM reads (original value then mask readback) $= 4\text{ ECAM operations}$ ($480\text{ CPU cycles} = 150.0\text{ ns}$).
* BAR Sizing Operation per 64-bit Paired BAR: Requires $8\text{ ECAM operations}$ ($960\text{ CPU cycles} = 300.0\text{ ns}$).

---

### The Hardware Execution Tasks:

1. Calculate the exact 32-bit hexadecimal size masks ($V_{\text{mask0}}$ and $V_{\text{mask1}}$) read back from **BAR C (256-MB 64-Bit Prefetchable BAR)** when firmware writes `0xFFFF_FFFF` to BAR0 and BAR1.
2. Sort all 3 BARs into their appropriate non-overlapping memory lists and calculate the exact 64-bit physical base addresses ($A_{\text{base\_A}}, A_{\text{base\_B}}, A_{\text{base\_C}}$) assigned to BAR A, BAR B, and BAR C, satisfying power-of-two natural alignment invariants.
3. Calculate the total required Non-Prefetchable MMIO Window Size for **Bridge 1** (encompassing BAR A, BAR B, and 15 MB of Hot-Plug Padding), and specify the 16-bit hex values written to Bridge 1's `MEM_BASE` and `MEM_LIMIT` registers (offsets `0x20` and `0x22`).
4. Calculate total physical execution time $T_{\text{bar\_alloc\_total}}$ (in microseconds) and total CPU clock cycles consumed to size, sort, allocate, and program all BARs and bridge windows across the three devices and Bridge 1.
5. Verify mathematical, alignment, and window containment correctness.

---

### Step-by-Step Derivation

#### Step 1: Derive 64-Bit Size Mask for BAR C ($S_C = 256\text{ MB} = 268,435,456\text{ Bytes} = \text{0x1000\_0000}$)

BAR C is a 64-bit prefetchable BAR ($BAR0$ and $BAR1$ paired).

Using the BAR size mask formula:

$$\text{Size } S_C = 268,435,456 = 2^{28} \text{ Bytes} = \text{0x1000\_0000}$$

$$S_C - 1 = \text{0x0FFF\_FFFF}$$

$$\sim(S_C - 1) = \sim(\text{0x0000\_0000\_0FFF\_FFFF}) = \text{0xFFFF\_FFFF\_F000\_0000}$$

Decomposing into lower 32 bits ($BAR0$) and upper 32 bits ($BAR1$):
* **Lower 32-Bit Mask ($V_{\text{mask0}}$)**: Bits $[31:4] = \text{0xF000\_000}$, Bits $[3:0] = 1100_2 = \text{0xC}$ (64-bit prefetchable memory flags):
  $$\mathbf{V_{\text{mask0}} = \text{0xF000\_000C}}$$
* **Upper 32-Bit Mask ($V_{\text{mask1}}$)**:
  $$\mathbf{V_{\text{mask1}} = \text{0xFFFF\_FFFF}}$$

When firmware writes `0xFFFF_FFFF` to BAR0 and BAR1, it reads back $V_{\text{mask0}} = \text{0xF000\_000C}$ and $V_{\text{mask1}} = \text{0xFFFF\_FFFF}$.

---

#### Step 2: Sort and Allocate Non-Overlapping Base Addresses

We separate the BARs into Non-Prefetchable (32-bit window `@ 0x8000_0000`) and Prefetchable (64-bit window `@ 0x10_0000_0000`):

##### 1. Non-Prefetchable 32-Bit Memory List (Base $A_{\text{mmio32\_base}} = \text{0x8000\_0000}$):
We sort BARs from **Largest to Smallest**:
* **1st: BAR B (Network NIC)**: Size $S_B = 1\text{ MB} = \text{0x0010\_0000} = 2^{20}\text{ Bytes}$.
  * Base Address Alignment: $\text{0x8000\_0000} \pmod{2^{20}} == 0 \implies \mathbf{\text{ALIGNED!}}$
  * **$A_{\text{base\_B}} = \text{0x0000\_0000\_8000\_0000}$**
  * Memory Range: `0x8000_0000` to `0x800F_FFFF` ($1\text{ MB}$).
  * Advance Next Pointer: $A_{\text{next}} = \text{0x8000\_0000} + \text{0x0010\_0000} = \text{0x8010\_0000}$.

* **2nd: BAR A (Audio Kiosk)**: Size $S_A = 64\text{ KB} = \text{0x0001\_0000} = 2^{16}\text{ Bytes}$.
  * Base Address Alignment: $\text{0x8010\_0000} \pmod{2^{16}} == 0 \implies \mathbf{\text{ALIGNED!}}$
  * **$A_{\text{base\_A}} = \text{0x0000\_0000\_8010\_0000}$**
  * Memory Range: `0x8010_0000` to `0x8010_FFFF` ($64\text{ KB}$).
  * Advance Next Pointer: $A_{\text{next}} = \text{0x8010\_0000} + \text{0x0001\_0000} = \text{0x8011\_0000}$.

##### 2. Prefetchable 64-Bit Memory List (Base $A_{\text{mmio64\_base}} = \text{0x0000\_0010\_0000\_0000}$):
* **1st: BAR C (GPU VRAM)**: Size $S_C = 256\text{ MB} = \text{0x1000\_0000} = 2^{28}\text{ Bytes}$.
  * Base Address Alignment: $\text{0x10\_0000\_0000} \pmod{2^{28}} == 0 \implies \mathbf{\text{ALIGNED!}}$
  * **$A_{\text{base\_C}} = \text{0x0000\_0010\_0000\_0000}$**
  * Memory Range: `0x0000_0010_0000_0000` to `0x0000_0010_0FFF_FFFF` ($256\text{ MB}$).

---

#### Step 3: Calculate Bridge 1 Window and Program Base/Limit Registers

Bridge 1 sits above BAR A ($64\text{ KB}$) and BAR B ($1\text{ MB}$).

##### 1. Calculate Required Bridge Non-Prefetchable MMIO Window Size:
$$\text{Child BAR Size Sum} = S_A + S_B = 64\text{ KB} + 1\text{ MB} = 1,114,112\text{ Bytes} = \text{1.0625 MB}$$

$$\text{Hot-Plug Padding} = 15.0\text{ MB}$$

$$\text{Total Bridge 1 Window Size} = 1.0625\text{ MB} + 15.0\text{ MB} = \mathbf{16.0625 \text{ MB}}$$

Type 1 Bridge memory base/limit registers require $1\text{-MB}$ alignment granularity ($2^{20}\text{ bytes}$). Rounding $16.0625\text{ MB}$ UP to the next $1\text{-MB}$ boundary:

$$\mathbf{\text{Bridge 1 Window Size} = 17.0 \text{ Megabytes}} \quad (\text{0x0110\_0000} \text{ Bytes})$$

##### 2. Calculate Bridge 1 `MEM_BASE` and `MEM_LIMIT` Addresses:
* `MEM_BASE` Address: Lowest assigned child address $= \mathbf{\text{0x8000\_0000}}$.
  * Register Value (Bits $[31:20]$): $\text{0x8000\_0000} \gg 20 = \text{0x800} \implies \mathbf{\text{MEM\_BASE = 0x8000}}$ (Offset `0x20`).
* `MEM_LIMIT` Address: $\text{MEM\_BASE} + \text{Window Size} - 1 = \text{0x8000\_0000} + \text{0x0110\_0000} - 1 = \mathbf{\text{0x810F\_FFFF}}$.
  * Register Value (Bits $[31:20]$): $\text{0x810F\_FFFF} \gg 20 = \text{0x810} \implies \mathbf{\text{MEM\_LIMIT = 0x8100}}$ (Offset `0x22`).

```text
BRIDGE 1 REGISTER ALLOCATION SUMMARY

 Register Name           │ Byte Offset │ Hex Value Programmed │ Hardware Meaning
─────────────────────────┼─────────────┼──────────────────────┼─────────────────────────────────────────
 MEM_BASE Register       │ Offset 0x20 │ 0x8000               │ Window Starts at 0x8000_0000
 MEM_LIMIT Register      │ Offset 0x22 │ 0x8100               │ Window Ends at 0x810F_FFFF (17 MB Size)
 Un-used Reserved Padding│ -           │ 15.9375 MB           │ Reserved for Hot-Plug Devices!
```

---

#### Step 4: Calculate Total Allocation Execution Time and CPU Clock Cycles

Let us count all ECAM operations executed by firmware:

1. **Sizing BAR A (32-bit BAR)**: 4 ECAM operations $= 4 \times 120 = 480\text{ CPU cycles}$.
2. **Sizing BAR B (32-bit BAR)**: 4 ECAM operations $= 4 \times 120 = 480\text{ CPU cycles}$.
3. **Sizing BAR C (64-bit BAR)**: 8 ECAM operations $= 8 \times 120 = 960\text{ CPU cycles}$.
4. **Writing Final Base Addresses**:
   * BAR A Write ($1\text{ op}$) $= 120\text{ cycles}$.
   * BAR B Write ($1\text{ op}$) $= 120\text{ cycles}$.
   * BAR C Write ($2\text{ ops}$ for BAR0/BAR1) $= 240\text{ cycles}$.
5. **Programming Bridge 1 `MEM_BASE` and `MEM_LIMIT`**: 2 ECAM writes $= 2 \times 120 = 240\text{ cycles}$.
6. **Enabling `MSE = 1` and `BME = 1` in 3 Command Registers**: 3 ECAM writes $= 3 \times 120 = 360\text{ cycles}$.

##### Total CPU Clock Cycles Consumed ($C_{\text{alloc\_total}}$):

$$C_{\text{alloc\_total}} = 480 + 480 + 960 + 120 + 120 + 240 + 240 + 360 = \mathbf{3,000 \text{ CPU Clock Cycles}}$$

##### Total Physical Execution Time ($T_{\text{bar\_alloc\_total}}$) at $3.2\text{ GHz}$ ($T_{\text{clk}} = 0.3125\text{ ns}$):

$$T_{\text{bar\_alloc\_total}} = 3,000 \text{ cycles} \times 0.3125 \times 10^{-9}\text{ s/cycle} = \mathbf{937.50 \text{ Nanoseconds}} = \mathbf{0.9375 \text{ Microseconds}}$$

```text
BAR RESOURCE ALLOCATION TIMELINE SUMMARY

 Execution Phase               │ ECAM Operations │ CPU Cycles (3.2 GHz) │ Physical Latency (ns)
───────────────────────────────┼─────────────────┼──────────────────────┼───────────────────────
 BAR Probing & Sizing (A, B, C)│ 16 Ops          │ 1,920 Cycles         │ 600.00 ns
 Writing Final Base Addresses  │  4 Ops          │   480 Cycles         │ 150.00 ns
 Programming Bridge 1 Windows  │  2 Ops          │   240 Cycles         │  75.00 ns
 Enabling Device Command MSE/BME│  3 Ops          │   360 Cycles         │ 112.50 ns
───────────────────────────────┼─────────────────┼──────────────────────┼───────────────────────
 TOTAL BAR ALLOCATION EXECUTION│ 25 Ops          │ 3,000 Cycles         │ 937.50 ns (0.9375 us)
```

##### Engineering Conclusion:
In **$0.9375\text{ microseconds}$ ($3,000\text{ CPU clock cycles}$)**, early platform firmware sized all 3 BARs, sorted and aligned them to natural power-of-two address boundaries, allocated non-overlapping MMIO ranges, programmed Bridge 1's $17\text{-MB}$ memory window with $15.9375\text{ MB}$ of hot-plug padding, and safely enabled device MMIO decoding!

---

### Sanity Check and Verification

Let us verify our mathematical, physical, and alignment results against PCIe specification rules:

1. **Natural Power-of-Two Alignment Verification**:
   * BAR A ($64\text{ KB}$): Base `0x8010_0000` $\pmod{65536} == 0 \implies \mathbf{PASSED!}$
   * BAR B ($1\text{ MB}$): Base `0x8000_0000` $\pmod{1048576} == 0 \implies \mathbf{PASSED!}$
   * BAR C ($256\text{ MB}$): Base `0x10_0000_0000` $\pmod{268435456} == 0 \implies \mathbf{PASSED!}$
2. **Zero Overlap Check**:
   * BAR B Range: `0x8000_0000` to `0x800F_FFFF`.
   * BAR A Range: `0x8010_0000` to `0x8010_FFFF`.
   * Gap between BAR B and BAR A $= \text{0x8010\_0000} - \text{0x8010\_0000} = 0\text{ bytes}$ (100% perfectly contiguous!).
3. **Bridge Window Containment Check**:
   * Bridge 1 Window: `0x8000_0000` to `0x810F_FFFF` ($17\text{ MB}$).
   * Contains BAR B (`0x8000_0000`..`0x800F_FFFF`) AND BAR A (`0x8010_0000`..`0x8010_FFFF`).
   * Both child BARs sit strictly inside Bridge 1's window. Bridge routing check $100\%$ verified!

All BAR all-ones sizing inversion formulas, power-of-two natural alignment checks, bridge base/limit window mappings, hot-plug padding calculations, and $0.9375\ \mu\text{s}$ execution timing metrics evaluate with 100% mathematical, physical, and logical precision.

---

## 6. Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital hardware engineering toolbox:

* **BAR Resource Allocation**: The 5-step hardware probing algorithm where firmware writes `0xFFFF_FFFF` to a device's Base Address Register (BAR) and reads back the masked bitpattern ($V_{\text{mask}}$) to calculate the required memory window size ($S = \sim V_{\text{mask}} + 1$) and align base addresses to natural power-of-two boundaries ($A_{\text{base}} \pmod S == 0$).
* **Non-Overlapping MMIO Assignment**: The resource layout algorithm where requested BARs are sorted from largest to smallest and assigned contiguous, non-conflicting physical memory addresses, programming Type 1 bridge `MEM_BASE` and `MEM_LIMIT` registers to forward downstream MMIO transactions.
* **Hot-Plug Bridge Padding**: The firmware resource reservation mechanism that allocates extra MMIO window headroom ($\text{Window}_{\text{bridge}} = \sum S_{\text{child}} + \text{Padding}_{\text{hotplug}}$) inside Type 1 bridge headers during boot enumeration, allowing future hot-plugged devices to be configured at runtime without re-enumerating existing system buses.
* **Early IOMMU Protection**: The security sequencing rule where platform firmware programs IOMMU protection domain page tables to map only explicitly allocated BAR ranges before setting `Memory Space Enable (MSE = 1)` or `Bus Master Enable (BME = 1)` in device Command Registers, preventing un-mapped DMA write attacks during boot.