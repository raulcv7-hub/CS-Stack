---
title: "10. Microarchitectural Security - Table of Contents"
---

# microarchitectural-security — Microarchitectural Security Architecture

> **Assumed Prerequisites:** Out-of-order execution pipelines, branch prediction (BTB, BHT, TAGE), speculative execution, physical register renaming, Load-Store Queues (LSQ), and Reorder Buffer (ROB) commitment from `03-cpu-microarchitecture`; L1/L2/L3 cache line fills (64 bytes), set associativity, replacement policies, and MESI coherence protocols from `04-memory-subsystems`; PCIe interconnects and IOMMU address translation from `07-hardware-interconnects`.
> **Course Boundary:** Begins at microarchitectural side-channel timing leakage, cache-based side-channel attacks, speculative and transient execution vulnerabilities (Spectre, Retbleed, Meltdown, Foreshadow, MDS, LVI, Downfall, PACMAN, SLS), physical DRAM Rowhammer disturbance (DDR4/DDR5 PRAC), hardware fault injection, and hardware-enforced isolation / trusted execution environments (ARM TrustZone, Intel SGX/TDX, RISC-V Sanctum, AMD SEV-SNP, ARM CCA) at the silicon level. Ends at microarchitectural mitigations built into hardware/RTL (speculation barriers, hardware branch mitigations IBRS/IBPB, microarchitectural buffer flushes, constant-time hardware execution units, hardware cache set partitioning, randomized caches, hardware control-flow integrity PAC/CET, formal information flow tracking, and integrated secure processor synthesis).
> **Explicit Exclusions:** ❌ No analog electronics, PCB probe physics, or IC decapping (belongs to Electrical Engineering), ❌ No operating system or software-only memory corruption exploits (buffer overflows, ROP, heap exploitation - handled in Layer 08 `software-vulnerability-analysis`), ❌ No web application security (XSS, CSRF, SQLi - handled in Layer 08 `web-application-security`), ❌ No high-level cryptographic software APIs or pure blackboard mathematics (handled in Layer 08 `cryptographic-primitives`), ❌ No user-space C/C++ application code.

## 01-cache-side-channel-attacks — Cache Side-Channel Leakage Architecture

### 01-timing-side-channels — Cache Access Timing Leakage Mechanics
* 01-cache-timing-leakage-foundations — Problem: Shared cache access latency differences between L1 hits and DRAM misses leak secret key-dependent memory access patterns. | Primitives: Cache timing side-channel, Secret-dependent memory access.
* 02-flush-reload-attack-mechanics — Problem: Shared inclusive caches allow an unprivileged process to measure exact line eviction and reload timing of shared memory buffers without modifying data. | Primitives: Flush+Reload attack, Shared memory line tracking.
* 03-prime-probe-attack-mechanics — Problem: Attackers without shared memory must construct eviction sets using group testing algorithms to fill target cache sets and measure eviction timings. | Primitives: Prime+Probe attack, Eviction set construction.
* 04-evict-time-attack-mechanics — Problem: Evicting specific victim cache lines before execution allows attackers to measure overall execution time changes and deduce control flow choices. | Primitives: Evict+Time attack, Execution timing delta analysis.
* 05-covert-channel-capacity-ecc — Problem: Microarchitectural covert channels experience noise from background OS activity, requiring error-correcting codes to maximize transmission bandwidth. | Primitives: Covert channel capacity, Microarchitectural error-correcting codes.

### 02-execution-unit-side-channels — Non-Cache Execution Unit Timing Leakage
* 01-port-contention-side-channels — Problem: SMT sibling threads sharing execution ports leak execution decisions via port contention timing delays. | Primitives: Execution port contention, SMT resource leakage.
* 02-variable-time-arithmetic-leakage — Problem: Data-dependent execution times in hardware multipliers and dividers leak secret key bits during cryptographic operations. | Primitives: Data-dependent execution timing, Variable-time ALU leakage.
* 03-frequency-throttling-side-channel-hertzbleed — Problem: Dynamic Frequency and Voltage Scaling (DVFS) varying CPU frequencies based on data-dependent power consumption translates constant-time software into a timing side channel. | Primitives: Hertzbleed attack, DVFS power-dependent frequency leakage.

## 02-transient-execution-vulnerabilities — Transient Execution Vulnerability Architecture

### 01-speculative-branch-attacks — Speculative Branch Misprediction Attacks
* 01-branch-speculation-side-channel-leakage — Problem: Out-of-order execution pipelines speculatively execute instructions past mispredicted branch boundaries, leaving persistent traces in cache lines before instruction retirement. | Primitives: Transient execution leakage, Speculative cache footprint.
* 02-spectre-variant-1-bounds-check-bypass — Problem: Speculatively executing array reads past bounds-check branches allows attackers to read arbitrary kernel memory via cache side channels. | Primitives: Spectre-v1 (Bounds Check Bypass), Speculative array out-of-bounds access.
* 03-spectre-variant-2-branch-target-injection — Problem: Poisoning shared Branch Target Buffers forces host CPUs to speculatively jump to arbitrary attacker-controlled gadget addresses. | Primitives: Spectre-v2 (Branch Target Injection), BTB poisoning gadget execution.
* 04-speculative-store-bypass-mechanics — Problem: Load-Store Queues executing loads ahead of unresolved store addresses speculatively read stale memory data before store forwarding resolves. | Primitives: Spectre-v4 (Speculative Store Bypass), Load-Store Queue speculation hazard.
* 05-return-stack-buffer-speculation-retbleed — Problem: Exhausting or desynchronizing the Return Stack Buffer forces the CPU to fall back to poisoned BTB targets during return instruction execution. | Primitives: Retbleed (Spectre-RSB), Return Stack Buffer underflow speculation.
* 06-branch-history-injection-mechanics — Problem: Branch History Injection forces global branch history registers into un-isolated states, bypassing eIBRS hardware isolation boundaries. | Primitives: Branch History Injection (BHI), Global history register manipulation.
* 07-straight-line-speculation-mechanics — Problem: Instruction decoders speculatively fetch and execute instructions past unconditional jumps or return instructions before control flow updates. | Primitives: Straight-Line Speculation (SLS), Unconditional branch speculative fetch.

### 02-hardware-privilege-fault-speculation — Hardware Privilege Fault Speculative Leakage
* 01-meltdown-rogue-data-cache-load — Problem: Out-of-order CPUs speculatively forward kernel data from L1 Data Caches to dependent instructions before checking user/supervisor privilege bits in page table entries. | Primitives: Meltdown attack, Un-privileged speculative cache load.
* 02-foreshadow-l1-terminal-fault — Problem: CPU speculative execution reads valid data from L1 Data Caches even when page table entries are marked invalid or un-mapped by SMM/SGX enclaves. | Primitives: Foreshadow (L1 Terminal Fault), Invalid PTE speculative cache access.
* 03-microarchitectural-data-sampling — Problem: Speculative execution reads un-committed intermediate data from internal hardware fill buffers, load buffers, and store buffers across sibling SMT threads. | Primitives: Microarchitectural Data Sampling (MDS), Internal buffer sampling.
* 04-load-value-injection-mechanics — Problem: Inverting MDS vulnerabilities allows attackers to inject malicious transient data values into victim pipeline execution units during faulting load operations. | Primitives: Load Value Injection (LVI), Transient data payload injection.
* 05-gather-data-sampling-downfall — Problem: SIMD vector gather instructions reading multi-element data lines expose intermediate register states across shared microarchitectural SIMD buffers. | Primitives: Gather Data Sampling (Downfall / GDS), Vector buffer transient leakage.
* 06-rogue-system-register-read-spectre-v3a — Problem: Speculatively executing system register read instructions allows unprivileged applications to read restricted control registers like CR3 or MSRs before privilege fault trap resolution. | Primitives: Spectre-v3a (Rogue System Register Read), System register speculative access.
* 07-speculative-pointer-authentication-pacman — Problem: Speculatively executing pointer authentication checks allows attackers to probe PAC signature validity without triggering architectural memory fault exceptions. | Primitives: PACMAN attack, Speculative pointer authentication probing.

## 03-physical-microarchitectural-attacks — Physical Microarchitectural Attack Mechanics

### 01-dram-rowhammer-mechanics — DRAM Rowhammer Cell Inter-Capacitance Leakage
* 01-dram-adjacent-row-activation-disturbance — Problem: Repeatedly activating a single DRAM row millions of times per second induces electromagnetic cross-coupling that flips bit states in physically adjacent un-accessed DRAM rows. | Primitives: Rowhammer disturbance, Electromagnetic row coupling.
* 02-double-sided-rowhammer-flipping — Problem: Alternating activations between two adjacent rows surrounding a target row bypasses single-row refresh counters, accelerating bit-flip rates. | Primitives: Double-sided Rowhammer, Target row bit-flip acceleration.
* 03-target-row-refresh-bypass — Problem: Hardware Target Row Refresh mitigations can be bypassed by non-uniform, multi-row hammering patterns. | Primitives: Target Row Refresh (TRR) bypass, Complex hammering pattern.
* 04-per-row-activation-counting-prac — Problem: Modern DDR5 memory controllers require hardware activation counters per row to trigger emergency refresh cycles before disturbance thresholds are reached. | Primitives: Per-Row Activation Counting (PRAC), In-DRAM activation tracking.

### 02-hardware-fault-injection-attacks — Voltage and Clock Glitching Fault Injection
* 01-clock-glitching-instruction-skip — Problem: Inserting sharp, nanosecond voltage drops or clock glitches into CPU power rails causes instruction decoders to skip execution steps or mis-evaluate condition flags. | Primitives: Clock glitching, Instruction skip fault.
* 02-voltage-droop-fault-induction — Problem: Sudden dynamic supply voltage drops induce setup time violations in arithmetic execution units, corrupting cryptographic calculation outputs. | Primitives: Voltage droop fault injection, Setup time violation induction.
* 03-system-management-mode-latency-leakage — Problem: Un-synchronized System Management Interrupt (SMI) execution pauses host OS threads, creating microarchitectural timing variations in user processes. | Primitives: System Management Mode (SMM) latency side-channel, SMI execution disturbance.

## 04-hardware-trusted-execution-environments — Hardware-Enforced Isolation Architectures

### 01-hardware-security-enclaves — Hardware Enclave Execution Architectures
* 01-arm-trustzone-hardware-world-partitioning — Problem: Protecting sensitive cryptographic keys from a compromised operating system kernel requires hardware-enforced isolation into Secure and Non-Secure worlds. | Primitives: ARM TrustZone, Secure World hardware partitioning.
* 02-hardware-enclave-page-isolation — Problem: Isolating user-space application enclaves from a malicious OS kernel requires hardware-enforced memory encryption and Enclave Page Cache checks. | Primitives: Hardware Enclave (Intel SGX), Enclave Page Cache (EPC) protection.
* 03-riscv-sanctum-enclave-architecture — Problem: Hardware enclaves vulnerable to cache side-channel leakage require cache set partitioning and hardware page table isolation. | Primitives: RISC-V Sanctum, Hardware cache set isolation.
* 04-enclave-controlled-channel-page-faults — Problem: A malicious OS kernel manipulating page table validity bits can induce controlled page faults to track enclave execution flow step-by-step. | Primitives: Controlled-channel page fault attack, Enclave access pattern tracking.

### 02-hardware-memory-encryption-systems — Hardware Memory Encryption Architecture
* 01-transparent-memory-encryption — Problem: Physical probes attached to motherboard DRAM buses can capture plaintext encryption keys and sensitive memory state. | Primitives: Transparent Memory Encryption (TME/SME), Inline AES-XTS memory encryption engine.
* 02-datacenter-confidential-virtualization — Problem: Hypervisors with full physical memory access can inspect or tamper with guest VM memory state and register contexts without hardware-enforced confidential computing domains. | Primitives: Confidential Computing (Intel TDX / AMD SEV-SNP / ARM CCA), Hardware guest memory encryption.
* 03-hardware-attestation-report-mechanics — Problem: Verifying that an enclave or confidential VM is running untampered on genuine hardware requires hardware-signed cryptographic attestation reports. | Primitives: Hardware attestation report, Silicon identity measurement.

## 05-microarchitectural-hardware-mitigations — Microarchitectural Security Mitigations in Silicon

### 01-hardware-speculation-barriers — Speculation Barrier Instruction Mechanics
* 01-speculative-execution-barriers — Problem: Preventing speculative execution past conditional branches or indirect jumps requires hardware barrier instructions that halt pipeline speculation until branch directions resolve. | Primitives: Speculation barrier (`CSDB`/`LFENCE`), Pipeline speculation serialization.
* 02-microarchitectural-buffer-flushing — Problem: Preventing cross-context data leaks across SMT threads or privilege switches requires hardware instructions to purge internal fill buffers and branch predictor states. | Primitives: Microarchitectural buffer flush (`MD_CLEAR`), Branch predictor state clearing.
* 03-branch-predictor-hardware-mitigations — Problem: Bypassing software branch isolation requires hardware-enforced branch prediction isolation modes across privilege transitions and SMT threads. | Primitives: Hardware branch predictor mitigations (IBRS / STIBP / IBPB), Speculation restriction flags.

### 02-hardware-cache-partitioning-architectures — Hardware Cache Partitioning Architecture
* 01-constant-time-hardware-execution — Problem: Variable-time execution units leak secret data values via instruction timing variations. | Primitives: Constant-time execution unit, Data-independent timing guarantee (`DIT`).
* 02-hardware-cache-partitioning-mitigations — Problem: Shared cache set contention enables Flush+Reload and Prime+Probe attacks unless cache ways or sets are statically partitioned among security domains. | Primitives: Hardware cache partitioning, Cache way locking.
* 03-randomized-cache-architectures — Problem: Static cache set indexing allows attackers to construct eviction sets deterministically, requiring dynamic address-to-set permutation. | Primitives: Randomized cache mapping (ScatterCache / CEASER), Dynamic cache set permutation.
* 04-hardware-control-flow-integrity — Problem: Attackers hijacking return addresses or function pointers in memory alter control flow unless hardware enforces pointer authentication or shadow stacks. | Primitives: Hardware Control-Flow Integrity (Intel CET / ARM PAC / RISC-V Zicfiss), Hardware shadow stack.

## 06-integrated-secure-processor-synthesis — Integrated Secure Processor Subsystem Synthesis

### 01-secure-microarchitecture-integration — Integrated Secure Processor Architecture
* 01-hardened-out-of-order-core-synthesis — Problem: Combining out-of-order speculative execution, cache partitioning, hardware enclaves, speculation barriers, and hardware control-flow integrity creates complex microarchitectural security trade-offs and residual covert channels. | Primitives: Hardened out-of-order core, Integrated secure microarchitecture.
* 02-formal-information-flow-verification — Problem: Hardware designs containing subtle microarchitectural timing leaks cannot be fully audited without formal information flow tracking across register-transfer level netlists. | Primitives: Information Flow Tracking (IFT / SecVerilog), Microarchitectural non-interference proof.
