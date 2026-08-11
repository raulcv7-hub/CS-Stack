---
title: "Pseudo-LRU Line Replacement State Machine Architecture"
---

# Pseudo-LRU Line Replacement State Machine Architecture

## The True LRU State Explosion Problem

In high-performance processor design, set-associative cache architectures ($N$-way set-associative caches) group multiple parallel cache line slots—called **Ways**—into each cache set index row. By allowing up to $N$ independent memory blocks to reside in the same set row simultaneously, set-associative caches eliminate over $90\%$ of the destructive conflict miss thrashing loops that plague direct-mapped caches.

However, set associativity introduces a new, critical hardware decision problem every time a cache miss occurs:

> **The Replacement Decision Problem**: When a new memory block must be loaded into a cache set whose $N$ ways are all $100\%$ full, which of the $N$ occupied ways should be evicted to make room for the incoming line?

To maximize the cache hit rate and exploit temporal locality, computer architects seek to evict the cache line that is least likely to be needed by the CPU in the near future. 

The ideal theoretical replacement heuristic is the **Least Recently Used (LRU)** policy: *evict the specific cache line inside the set that has not been accessed for the longest period of time.*

In a 2-way set-associative cache ($N = 2$), implementing True LRU in digital hardware is trivial. The cache controller needs only **1 single tracking bit per set** ($U \in \{0, 1\}$):
* If Way 0 is accessed, the hardware sets $U = 1$ (pointing to Way 1 as the least recently used).
* If Way 1 is accessed, the hardware sets $U = 0$ (pointing to Way 0 as the least recently used).
* When a miss occurs, the hardware simply evicts Way $U$.

However, modern Level 2 (L2) and Level 3 (L3) caches do not use 2 ways; they use **8-way, 16-way, or 24-way set associativity** ($N = 8, 16, 24$) to maximize hit rates for large, complex workloads.

Here lies a severe, unscalable hardware physical barrier: **The True LRU Combinatorial State Explosion**.

```text
THE TRUE LRU PERMUTATION STATE EXPLOSION

 2-Way Set  : 2!  = 2 States      ──► 1 Bit per Set
 4-Way Set  : 4!  = 24 States     ──► 5 Bits per Set
 8-Way Set  : 8!  = 40,320 States ──► 16 Bits per Set!
 16-Way Set : 16! = 20.9 Trillion ──► 45 Bits per Set!
```

To track the exact chronological access order of $N$ ways without losing track of any way's age relative to the others, a set must store the exact permutation rank of all $N$ ways. 

The number of unique age order permutations for an $N$-way set is given by the factorial function:

$$\text{Permutations}(N) = N! = N \times (N-1) \times (N-2) \times \dots \times 1$$

To store $N!$ unique permutations in binary digital logic, the number of tracking bits $K_{\text{LRU}}$ required **per cache set** is:

$$K_{\text{LRU}} = \lceil \log_2(N!) \rceil$$

Let us evaluate this equation across increasing associativity levels $N$:

* **For $N = 2$ Ways**: $2! = 2 \text{ states} \implies \lceil \log_2(2) \rceil = \mathbf{1 \text{ Bit per set}}$.
* **For $N = 4$ Ways**: $4! = 24 \text{ states} \implies \lceil \log_2(24) \rceil = \mathbf{5 \text{ Bits per set}}$.
* **For $N = 8$ Ways**: $8! = 40,320 \text{ states} \implies \lceil \log_2(40320) \rceil = \mathbf{16 \text{ Bits per set}}$.
* **For $N = 16$ Ways**: $16! \approx 2.09 \times 10^{13} \text{ states} \implies \lceil \log_2(2.09 \times 10^{13}) \rceil = \mathbf{45 \text{ Bits per set}}$!

Look at the physical storage disaster for a 16-way set-associative cache!
If a $2\text{-Megabyte}$ L2 cache contains 2,048 sets ($S = 2,048$), tracking True LRU requires:

$$\text{Total True LRU Storage} = 2,048 \text{ sets} \times 45 \text{ bits/set} = 92,160 \text{ bits} = \mathbf{11.5 \text{ Kilobytes of SRAM!}}$$

The processor would have to waste $11.5\text{ KB}$ of expensive on-chip SRAM die area *just to store age-tracking metadata*!

Worse than the physical storage overhead is the **Dynamic Power and Logic Gate Complexity**:
Updating a 45-bit permutation matrix on every single cache hit requires an $N \times N$ hardware comparison and shift matrix that consumes massive dynamic power and adds multiple gate delays to the critical path, slowing down the CPU clock frequency.

To eliminate this state explosion, hardware architects replace True LRU with an $O(1)$ hardware approximation algorithm: **Pseudo-LRU (PLRU)**, implemented using **Tree-Based Pseudo-LRU (Tree-PLRU) State Machines**.

---

## The Tournament Bracket and Signposts: An Everyday Mental Model

To build an intuitive, crystal-clear mental model of how Tree-PLRU approximates age tracking using logarithmic bit space before inspecting binary decision trees and matrix equations, let us picture a sports tournament.

Imagine a tennis club running a tournament with **8 players** (**8 Ways in a Cache Set**: Player 0 through Player 7).

```text
THE 8-PLAYER TENNIS TOURNAMENT BRACKET

                        [ Top Signpost B0 ]
                       /                   \
            [ Left Signpost B1 ]       [ Right Signpost B2 ]
            /                \          /                 \
     [ Sign B3 ]        [ Sign B4 ]   [ Sign B5 ]     [ Sign B6 ]
     /        \         /        \    /        \      /        \
  Player 0  Player 1 Player 2 Player 3 Player 4 Player 5 Player 6 Player 7
```

The club manager wants to know which player has played the least recently, so they can offer that player the court. 

However, the manager does not want to maintain a complicated notebook ranking all $8! = 40,320$ possible playing order permutations (True LRU).

Instead, the manager sets up a **Binary Signpost Tree** on the tennis field containing **7 simple directional signposts** ($B_0$ through $B_6$). Each signpost simply points **Left** ($0$) or **Right** ($1$):

1. **Top Signpost ($B_0$)**: Points to the Left Half (Players 0–3) or Right Half (Players 4–7).
2. **Level 2 Signposts ($B_1, B_2$)**:
   * Sign $B_1$ points to Players 0–1 or Players 2–3.
   * Sign $B_2$ points to Players 4–5 or Players 6–7.
3. **Level 3 Signposts ($B_3, B_4, B_5, B_6$)**: Point to individual players.

Let us observe how this signpost tree operates during two events:

---

### Event 1: Player Access (Updating the Signposts)

Whenever a player finishes a match (a cache hit on that Way), that player walks past the signposts on their path and **flips all signposts on their path to point AWAY from themselves**!

```text
PLAYER 3 PLAYS A MATCH (WAY 3 HIT)

 Player 3 is in the Left Subtree (under Sign B1 under Sign B0).
 As Player 3 leaves the court:
 * Sign B4 is flipped to point LEFT  (to Player 2, AWAY from Player 3!).
 * Sign B1 is flipped to point LEFT  (to Players 0/1, AWAY from Player 3!).
 * Sign B0 is flipped to point RIGHT (to Players 4-7, AWAY from Player 3!).
```

Notice what flipping the signposts achieves:
By forcing every signpost along Player 3's path to point in the **opposite direction**, the signposts now point toward players who **have NOT played recently**!

---

### Event 2: Eviction Selection (Finding a Pseudo-LRU Player)

When a new player arrives and needs a court (a cache miss requiring eviction), the manager does not read a notebook or perform math.

The manager simply walks onto the field at the Top Signpost ($B_0$) and **follows the direction arrows on the signposts**:

```text
EVICTION PATH SELECTION (FOLLOWING THE ARROWS)

 Manager starts at Top Sign B0:
 * Sign B0 points RIGHT ──► Manager walks to Right Subtree (Sign B2).
 * Sign B2 points LEFT  ──► Manager walks to Left Branch (Sign B5).
 * Sign B5 points RIGHT ──► Manager arrives at Player 5!
 (Player 5 is evicted!)
```

Look at how simple and fast this eviction search is:
* The manager checked **only 3 signposts** ($O(\log_2 8)$) to find an eviction candidate!
* Did the manager find the mathematically exact least recently used player in all cases? Not always, but they are **guaranteed to find a player who has not played recently**! They will **NEVER** evict the most recently used player.

How many signposts were needed for 8 players?
**EXACTLY 7 SIGNPOSTS ($N - 1 = 7$ bits)!**

Compare this with True LRU's notebook requiring **16 bits per set**:
* True LRU Notebook: 16 bits per set ($40,320$ states).
* Tree-PLRU Signpost Tree: **7 bits per set** ($128$ states).
* **Storage Reduction**: More than $56\%$ savings in metadata SRAM area!

This signpost tree is the exact physical analogue of a **Tree-Based Pseudo-LRU (Tree-PLRU) State Machine**:
* The 8 players are the **8 Cache Ways (Way 0 to Way 7)**.
* Playing a match is a **Cache Hit on Way $k$**.
* Flipping signposts away from the player is the **Tree-PLRU Bit Inversion State Update**.
* Following the signpost arrows is the **Eviction Selection Decode Logic**.

---

## Primitive 1: Pseudo-LRU (PLRU) Line Replacement Mechanics

Now that we possess a clear, intuitive mental model of direction signposts, let us examine the formal, rigorous engineering mechanics of **Pseudo-LRU (PLRU)** algorithms.

> **Pseudo-LRU (PLRU)** is an $O(1)$ constant-time hardware replacement algorithm that uses a logarithmic binary state space ($N - 1$ bits per set for $N$ ways) to approximate Least Recently Used line eviction, guaranteeing that the Most Recently Used (MRU) line is never evicted while maintaining over $98\%$ of True LRU's hit rate performance.

---

### Taxonomy of Pseudo-LRU Implementations

In digital silicon design, hardware architects use two primary physical variants of Pseudo-LRU:

```text
PSEUDO-LRU TAXONOMY

                   PSEUDO-LRU REPLACEMENT ALGORITHMS
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
 TREE-BASED PSEUDO-LRU (Tree-PLRU)               BIT-BASED PSEUDO-LRU (MRU-Bit)
 * Uses N-1 binary bits per set.                 * Uses N binary bits per set.
 * Arranged as a binary decision tree.           * Each bit represents "MRU status".
 * Logarithmic state space O(log2 N).            * Simple, but less precise for N >= 8.
 * Preferred for L2/L3 caches (N = 4, 8, 16).   * Preferred for small L1 caches (N = 2, 4).
```

#### 1. Tree-Based Pseudo-LRU (Tree-PLRU)
* **Storage Requirement**: Exactly $N - 1$ bits per set for an $N$-way set-associative cache.
* **Mechanism**: Organizes the $N$ ways as leaf nodes of a complete binary decision tree containing $N - 1$ internal direction nodes ($B_0 \dots B_{N-2}$).
* **Properties**: Deterministic, logarithmic bit scaling, excellent approximation of True LRU ($> 98\%$ hit rate match on real-world SPEC CPU benchmarks).

#### 2. Bit-Based Pseudo-LRU (MRU-Bit PLRU)
* **Storage Requirement**: Exactly $N$ bits per set ($M_0 \dots M_{N-1}$), where each bit corresponds directly to one way.
* **Mechanism**:
  * On a cache hit to Way $k$, set $M_k = 1$ (marking Way $k$ as Most Recently Used).
  * If setting $M_k = 1$ causes **ALL $N$ bits in the set to become $1$**, clear all other bits back to $0$ ($M_i = 0$ for $i \neq k$).
  * On an eviction miss, pick the lowest-indexed way whose MRU bit is $0$ ($M_k == 0$).

---

### Comparative State Space Analysis: True LRU vs. Tree-PLRU vs. Bit-PLRU

Let us compare the physical metadata storage requirements across different associativity levels $N$:

$$\text{True LRU Bits} = \lceil \log_2(N!) \rceil$$

$$\text{Tree-PLRU Bits} = N - 1$$

$$\text{Bit-PLRU Bits} = N$$

```text
METADATA STORAGE COMPARISON MATRIX ACROSS ASSOCIATIVITY LEVELS

 Associativity (N) │ True LRU Bits / Set │ Tree-PLRU Bits / Set │ Bit-PLRU Bits / Set │ Storage Savings (Tree vs True)
───────────────────┼─────────────────────┼──────────────────────┼─────────────────────┼───────────────────────────────
 2-Way             │       1 Bit         │        1 Bit         │       2 Bits        │ 0% (Identical for N=2)
 4-Way             │       5 Bits        │        3 Bits        │       4 Bits        │ 40.0% Reduction
 8-Way             │      16 Bits        │        7 Bits        │       8 Bits        │ 56.2% Reduction
 16-Way            │      45 Bits        │       15 Bits        │      16 Bits        │ 66.7% Reduction
 32-Way            │     118 Bits        │       31 Bits        │      32 Bits        │ 73.7% Reduction
```

Look at the scaling behavior in this matrix:
* For an 8-way cache, Tree-PLRU reduces tracking storage from 16 bits down to **7 bits per set** ($56.2\%$ savings).
* For a 16-way cache, Tree-PLRU reduces tracking storage from 45 bits down to **15 bits per set** ($66.7\%$ savings).
* For a 32-way cache, Tree-PLRU reduces tracking storage from 118 bits down to **31 bits per set** ($73.7\%$ savings).

---

## Primitive 2: Tree-PLRU State Machine Architecture and Decision Logic

Now let us examine the exact gate-level mechanics, state transition equations, and eviction decode logic for **Tree-Based Pseudo-LRU (Tree-PLRU)**.

---

### Tree-PLRU Mechanics for a 4-Way Set-Associative Cache ($N = 4$)

A 4-way set-associative cache set contains 4 ways: Way 0, Way 1, Way 2, Way 3.

To manage replacement, Tree-PLRU allocates **$N - 1 = 3$ tracking bits per set**: $B_0, B_1, B_2$.

#### The 3-Bit Binary Decision Tree Topology:
* **Root Node ($B_0$)**: Splits the set into the Left Subtree (Ways 0 and 1) and Right Subtree (Ways 2 and 3).
  * $B_0 = 0 \implies$ Points to Left Subtree (Ways 0/1 contain an eviction candidate).
  * $B_0 = 1 \implies$ Points to Right Subtree (Ways 2/3 contain an eviction candidate).
* **Left Subtree Node ($B_1$)**: Splits Way 0 and Way 1.
  * $B_1 = 0 \implies$ Points to Way 0.
  * $B_1 = 1 \implies$ Points to Way 1.
* **Right Subtree Node ($B_2$)**: Splits Way 2 and Way 3.
  * $B_2 = 0 \implies$ Points to Way 2.
  * $B_2 = 1 \implies$ Points to Way 3.

```text
4-WAY TREE-PLRU BINARY DECISION TREE SCHEMATIC

                         Root Bit B0
                        /           \
                 (B0=0)               (B0=1)
                /                       \
          Left Bit B1               Right Bit B2
         /           \             /            \
     (B1=0)        (B1=1)      (B2=0)         (B2=1)
      /              \          /               \
   Way 0            Way 1    Way 2             Way 3
```

---

#### 1. Hit Update Rules for 4-Way Tree-PLRU

When a cache hit occurs on Way $k$ (or when a new line is loaded into Way $k$), the 3-bit state vector $(B_0, B_1, B_2)$ is updated to force all directional arrows along Way $k$'s path to **point AWAY from Way $k$**:

```text
4-WAY TREE-PLRU HIT UPDATE TRUTH TABLE

 Target Way Hit │ New State Bit B0 │ New State Bit B1 │ New State Bit B2 │ Action Summary
────────────────┼──────────────────┼──────────────────┼──────────────────┼───────────────────────────────
   Way 0 Hit    │      B0 = 1      │      B1 = 1      │    Unchanged     │ Points Right & to Way 1
   Way 1 Hit    │      B0 = 1      │      B1 = 0      │    Unchanged     │ Points Right & to Way 0
   Way 2 Hit    │      B0 = 0      │    Unchanged     │      B2 = 1      │ Points Left & to Way 3
   Way 3 Hit    │      B0 = 0      │    Unchanged     │      B2 = 0      │ Points Left & to Way 2
```

Let's write the Boolean state transition equations for $(B_0', B_1', B_2')$ on a hit to Way $k$:

$$B_0' = \begin{cases} 1 & \text{if Way 0 or Way 1 is hit} \\ 0 & \text{if Way 2 or Way 3 is hit} \end{cases}$$

$$B_1' = \begin{cases} 1 & \text{if Way 0 is hit} \\ 0 & \text{if Way 1 is hit} \\ B_1 & \text{if Way 2 or Way 3 is hit (Unchanged)} \end{cases}$$

$$B_2' = \begin{cases} 1 & \text{if Way 2 is hit} \\ 0 & \text{if Way 3 is hit} \\ B_2 & \text{if Way 0 or Way 1 is hit (Unchanged)} \end{cases}$$

---

#### 2. Eviction Selection Logic for 4-Way Tree-PLRU

When a cache miss occurs and all 4 ways in the set are occupied, the cache controller inspects the current 3-bit state vector $(B_0, B_1, B_2)$ and decodes the eviction candidate way by following the tree arrows from the root down to the leaf node:

```text
4-WAY TREE-PLRU EVICTION DECODE TRUTH TABLE

 Current State (B0 B1 B2) │ Tree Path Followed              │ Selected Eviction Way
──────────────────────────┼─────────────────────────────────┼───────────────────────
         0  0  X          │ B0=0 (Left)  -> B1=0 (Way 0)     │         Way 0
         0  1  X          │ B0=0 (Left)  -> B1=1 (Way 1)     │         Way 1
         1  X  0          │ B0=1 (Right) -> B2=0 (Way 2)     │         Way 2
         1  X  1          │ B0=1 (Right) -> B2=1 (Way 3)     │         Way 3
```

*(Note: $X$ indicates a Don't Care condition).*

Let us write the exact combinational Boolean equations for selecting Eviction Way $E_k \in \{E_0, E_1, E_2, E_3\}$:

$$E_0 = \overline{B_0} \cdot \overline{B_1}$$

$$E_1 = \overline{B_0} \cdot B_1$$

$$E_2 = B_0 \cdot \overline{B_2}$$

$$E_3 = B_0 \cdot B_2$$

Look at how simple these four 2-input AND gate equations are! 

To select an eviction way among 4 candidate lines, the hardware requires **only four 2-input AND gates**! The eviction decode latency is less than **$50\text{ picoseconds}$**.

---

### Tree-PLRU Mechanics for an 8-Way Set-Associative Cache ($N = 8$)

For an 8-way set-associative cache, Tree-PLRU allocates **$N - 1 = 7$ tracking bits per set**: $B_0, B_1, B_2, B_3, B_4, B_5, B_6$.

```text
8-WAY TREE-PLRU BINARY DECISION TREE STRUCTURE

                             Root Bit B0
                            /           \
                     (B0=0)/             \(B0=1)
                          /               \
                    Left Bit B1       Right Bit B2
                   /          \       /          \
                (B1=0)      (B1=1) (B2=0)      (B2=1)
                /                \ /                \
             Bit B3            Bit B4            Bit B5            Bit B6
            /      \          /      \          /      \          /      \
        Way 0    Way 1    Way 2    Way 3    Way 4    Way 5    Way 6    Way 7
```

#### 1. Eviction Selection Decode Logic for 8-Way Tree-PLRU
The eviction decode logic for an 8-way set follows the 3-level tree path from root bit $B_0$ down through level 2 ($B_1/B_2$) and level 3 ($B_3/B_4/B_5/B_6$):

$$E_0 = \overline{B_0} \cdot \overline{B_1} \cdot \overline{B_3}$$

$$E_1 = \overline{B_0} \cdot \overline{B_1} \cdot B_3$$

$$E_2 = \overline{B_0} \cdot B_1 \cdot \overline{B_4}$$

$$E_3 = \overline{B_0} \cdot B_1 \cdot B_4$$

$$E_4 = B_0 \cdot \overline{B_2} \cdot \overline{B_5}$$

$$E_5 = B_0 \cdot \overline{B_2} \cdot B_5$$

$$E_6 = B_0 \cdot B_2 \cdot \overline{B_6}$$

$$E_7 = B_0 \cdot B_2 \cdot B_6$$

Eight 3-input AND gates decode the eviction way for an 8-way set-associative cache in $O(1)$ constant time!

---

## Hardware Realities: Power, Gate Delays, and Pathological Access Sequences

In real-world semiconductor engineering, adopting Tree-PLRU over True LRU delivers massive physical advantages, but engineers must account for edge-case access patterns.

---

### 1. Silicon Die Area and Power Comparison

Let us calculate the physical hardware savings of Tree-PLRU for a modern **$2\text{-Megabyte}$ 16-Way Set-Associative L2 Cache** containing 2,048 sets ($S = 2,048, N = 16$):

* **True LRU Storage**: $2,048 \text{ sets} \times 45 \text{ bits/set} = 92,160 \text{ bits} = \mathbf{11.52 \text{ Kilobytes of SRAM}}$.
* **Tree-PLRU Storage**: $2,048 \text{ sets} \times 15 \text{ bits/set} = 30,720 \text{ bits} = \mathbf{3.84 \text{ Kilobytes of SRAM}}$.

```text
PHYSICAL HARDWARE SAVINGS (2 MB 16-WAY L2 CACHE)

 Metric                    │ True LRU               │ Tree-PLRU              │ Savings
───────────────────────────┼────────────────────────┼────────────────────────┼───────────────────────────
 Metadata Storage RAM      │ 11.52 KB               │ 3.84 KB                │ 66.7% Area Reduction!
 Bits Updated per Hit      │ Up to 45 Bits          │ 4 Bits (log2 16)       │ 91.1% Power Reduction!
 Eviction Decode Logic     │ 16x16 Comparison Matrix│ 16x 4-input AND Gates  │ 80% Delay Reduction!
```

Look at the physical savings:
1. **Area Reduction**: Tree-PLRU saves **$7.68\text{ Kilobytes}$ of on-chip SRAM** per cache array, freeing up thousands of transistors for execution logic.
2. **Power Reduction**: On every cache hit, True LRU must evaluate and rewrite up to 45 tracking bits. Tree-PLRU rewrites **only 4 bits** ($\log_2 16 = 4$), reducing tracking bit dynamic switching power by **$91.1\%$**!

---

### 2. Pathological Access Sequences: When Tree-PLRU Deviates from True LRU

Because Tree-PLRU uses a logarithmic approximation ($N - 1$ bits) rather than tracking full $N!$ permutations, there exist specific, rare memory access sequences where Tree-PLRU evicts a way that is *not* the absolute oldest way.

#### Example Pathological Sequence on a 4-Way Cache:

Consider a 4-way set initialized to state $B_0 B_1 B_2 = 000_2$.
All 4 ways are occupied ($A_0, A_1, A_2, A_3$).

Now, suppose the CPU executes the following access sequence:
1. **Hit Way 0**: State updates to $B_0 B_1 B_2 = 110_2$. (Tree points to Ways 2/3).
2. **Hit Way 1**: State updates to $B_0 B_1 B_2 = 100_2$. (Tree points to Ways 2/3).
3. **Hit Way 2**: State updates to $B_0 B_1 B_2 = 001_2$. (Tree points to Ways 0/1).

Let me analyze the chronological access age of the 4 ways after this sequence:
* Way 2 was accessed **most recently** (Age rank 1).
* Way 1 was accessed 2nd most recently (Age rank 2).
* Way 0 was accessed 3rd most recently (Age rank 3).
* **Way 3 was accessed LEAST recently (Age rank 4 - True LRU candidate!)**.

Now, a cache miss occurs! Which way does Tree-PLRU evict?
* Tree-PLRU inspects current state $B_0 B_1 B_2 = 001_2$.
* $B_0 = 0 \implies \text{Follow Left Subtree (Ways 0/1)}$.
* $B_1 = 0 \implies \text{Follow B1=0 (Select Way 0!)}$.

Tree-PLRU evicts **Way 0** (Age rank 3), instead of **Way 3** (Age rank 4)!

```text
PATHOLOGICAL DEVIATION TRACE (4-WAY TREE-PLRU)

 Actual Chronological Age Order : [Way 2 (Newest)] > [Way 1] > [Way 0] > [Way 3 (Oldest)]
 True LRU Eviction Candidate    : Way 3 (Oldest)
 Tree-PLRU Eviction Candidate   : Way 0 (3rd Oldest)
 (Tree-PLRU evicted the 3rd oldest way instead of the 4th oldest way!)
```

#### Why This Deviation Is Acceptable in Real-World Engineering:
* **The MRU Protection Guarantee**: Tree-PLRU **NEVER evicts Way 2** (the Most Recently Used way!). It is physically impossible for Tree-PLRU to evict the MRU line.
* **Empirical Benchmark Performance**: Across standard SPEC CPU benchmark suites, Tree-PLRU achieves a cache hit rate within **$0.2\%$ to $1.0\%$** of True LRU!

In exchange for a microscopic $0.5\%$ difference in hit rate, Tree-PLRU cuts metadata storage by $66\%$ and cuts dynamic switching power by $91\%$. This trade-off represents an outstanding architectural win.

---

## Solved Industrial Engineering Exercise: Quantitative 8-Way Tree-PLRU State Machine Simulation and Eviction Analysis

To consolidate your complete mastery of Tree-PLRU state machines, binary decision trees, bitwise hit update rules, and eviction decode logic, we will now walk through a complete, step-by-step industrial hardware engineering problem.

---

### Scenario and Parameters

You are a senior microarchitect auditing the L2 Cache controller of a $3.2\text{ GHz}$ 64-bit server processor core ($T_{\text{clk}} = 0.3125\text{ ns} = 312.5\text{ ps}$).

The L2 Cache is configured as an **8-Way Set-Associative Cache** ($N = 8\text{ ways}$) using **7-bit Tree-Based Pseudo-LRU (Tree-PLRU)** replacement per set ($B_0, B_1, B_2, B_3, B_4, B_5, B_6$).

```text
3.2 GHz SERVER CORE WITH 8-WAY SET-ASSOCIATIVE L2 CACHE

 CPU Core (3.2 GHz) ──► [ L2 Cache Set Row 42 (8 Ways) ] ──► Main Memory (DRAM)
 Clock T = 312.5 ps     Tree-PLRU Tracking Bits = 7 Bits     Miss Penalty = 160 Cycles
```

#### Initial Cache Set State at Set Row 42:
* All 8 ways (Way 0 through Way 7) are currently occupied by valid data lines.
* The 7-bit Tree-PLRU state vector at Set Row 42 is initialized to **all zeros**:

$$B_0 B_1 B_2 B_3 B_4 B_5 B_6 = 0000000_2$$

#### The Access Sequence:
The processor executes a sequence of 6 memory operations targeting Set Row 42:
1. **Access 1**: Hit on **Way 3**.
2. **Access 2**: Hit on **Way 0**.
3. **Access 3**: Hit on **Way 7**.
4. **Access 4**: Hit on **Way 2**.
5. **Access 5**: Hit on **Way 5**.
6. **Access 6**: Hit on **Way 1**.

#### Your Objective

1. Determine which way would be selected for eviction under the **initial state** ($0000000_2$) if a cache miss occurred before Access 1.
2. Trace the step-by-step bitwise state transitions of $(B_0, B_1, B_2, B_3, B_4, B_5, B_6)$ across all 6 access events, showing which specific tree bits flip on each hit.
3. Determine the final 7-bit Tree-PLRU state vector after Access 6 completes.
4. Decode the final state vector to determine **which way will be evicted on the NEXT cache miss** (Access 7).
5. Compare the Tree-PLRU eviction choice against what True LRU would have chosen for the exact same access sequence.
6. Verify mathematical, structural, and logical correctness.

---

### Step-by-Step Derivation

#### Step 1: Eviction Candidate under Initial State ($0000000_2$)

Initial State: $B_0 B_1 B_2 B_3 B_4 B_5 B_6 = 0000000_2$.

Let us decode the eviction way by following the 3-level tree path from root bit $B_0$ down:
1. **Level 1 ($B_0 = 0$)**: Follow Left Branch $\to$ Left Subtree (Ways 0, 1, 2, 3).
2. **Level 2 ($B_1 = 0$)**: Follow Left Branch $\to$ Subtree (Ways 0, 1).
3. **Level 3 ($B_3 = 0$)**: Follow Left Branch $\to$ **Way 0**.

$$\text{Initial Eviction Candidate} = \mathbf{\text{Way 0}}$$

---

#### Step 2: Step-by-Step State Transition Trace across Accesses 1 to 6

Let us recall the bit-flipping rules for 8-Way Tree-PLRU:
* **Root Bit $B_0$**: Flipped to $1$ if Ways 0–3 hit; flipped to $0$ if Ways 4–7 hit.
* **Level 2 Bits ($B_1, B_2$)**:
  * $B_1$ flipped to $1$ if Ways 0–1 hit; $0$ if Ways 2–3 hit; unchanged if Ways 4–7 hit.
  * $B_2$ flipped to $1$ if Ways 4–5 hit; $0$ if Ways 6–7 hit; unchanged if Ways 0–3 hit.
* **Level 3 Bits ($B_3 \dots B_6$)**:
  * $B_3$ flipped to $1$ if Way 0 hits; $0$ if Way 1 hits.
  * $B_4$ flipped to $1$ if Way 2 hits; $0$ if Way 3 hits.
  * $B_5$ flipped to $1$ if Way 4 hits; $0$ if Way 5 hits.
  * $B_6$ flipped to $1$ if Way 6 hits; $0$ if Way 7 hits.

Now, let us trace each access step by step:

##### Initial State: $(0, 0, 0, 0, 0, 0, 0)$

##### Access 1: Hit on Way 3
* Way 3 path uses bits $B_0, B_1, B_4$.
* Way 3 is in Left Subtree (Ways 0–3) $\implies$ Set $B_0 = 1$ (points right to 4–7).
* Way 3 is in Right branch of $B_1$ (Ways 2–3) $\implies$ Set $B_1 = 0$ (points left to 0–1).
* Way 3 is in Right branch of $B_4$ (Way 3) $\implies$ Set $B_4 = 0$ (points left to Way 2).
* Bits $B_2, B_3, B_5, B_6$ remain unchanged ($0$).
* **State after Access 1**: $B_0 B_1 B_2 B_3 B_4 B_5 B_6 = \mathbf{(1, 0, 0, 0, 0, 0, 0)}$

##### Access 2: Hit on Way 0
* Way 0 path uses bits $B_0, B_1, B_3$.
* Way 0 is in Left Subtree $\implies$ Set $B_0 = 1$ (points right).
* Way 0 is in Left branch of $B_1$ $\implies$ Set $B_1 = 1$ (points right to 2–3).
* Way 0 is in Left branch of $B_3$ $\implies$ Set $B_3 = 1$ (points right to Way 1).
* **State after Access 2**: $B_0 B_1 B_2 B_3 B_4 B_5 B_6 = \mathbf{(1, 1, 0, 1, 0, 0, 0)}$

##### Access 3: Hit on Way 7
* Way 7 path uses bits $B_0, B_2, B_6$.
* Way 7 is in Right Subtree (Ways 4–7) $\implies$ Set $B_0 = 0$ (points left to 0–3).
* Way 7 is in Right branch of $B_2$ (Ways 6–7) $\implies$ Set $B_2 = 0$ (points left to 4–5).
* Way 7 is in Right branch of $B_6$ (Way 7) $\implies$ Set $B_6 = 0$ (points left to Way 6).
* **State after Access 3**: $B_0 B_1 B_2 B_3 B_4 B_5 B_6 = \mathbf{(0, 1, 0, 1, 0, 0, 0)}$

##### Access 4: Hit on Way 2
* Way 2 path uses bits $B_0, B_1, B_4$.
* Way 2 is in Left Subtree $\implies$ Set $B_0 = 1$ (points right).
* Way 2 is in Right branch of $B_1$ $\implies$ Set $B_1 = 0$ (points left).
* Way 2 is in Left branch of $B_4$ $\implies$ Set $B_4 = 1$ (points right to Way 3).
* **State after Access 4**: $B_0 B_1 B_2 B_3 B_4 B_5 B_6 = \mathbf{(1, 0, 0, 1, 1, 0, 0)}$

##### Access 5: Hit on Way 5
* Way 5 path uses bits $B_0, B_2, B_5$.
* Way 5 is in Right Subtree $\implies$ Set $B_0 = 0$ (points left).
* Way 5 is in Left branch of $B_2$ (Ways 4–5) $\implies$ Set $B_2 = 1$ (points right to 6–7).
* Way 5 is in Right branch of $B_5$ (Way 5) $\implies$ Set $B_5 = 0$ (points left to Way 4).
* **State after Access 5**: $B_0 B_1 B_2 B_3 B_4 B_5 B_6 = \mathbf{(0, 0, 1, 1, 1, 0, 0)}$

##### Access 6: Hit on Way 1
* Way 1 path uses bits $B_0, B_1, B_3$.
* Way 1 is in Left Subtree $\implies$ Set $B_0 = 1$ (points right).
* Way 1 is in Left branch of $B_1$ $\implies$ Set $B_1 = 0$ (points left).
* Way 1 is in Right branch of $B_3$ (Way 1) $\implies$ Set $B_3 = 0$ (points left to Way 0).
* **State after Access 6**: $B_0 B_1 B_2 B_3 B_4 B_5 B_6 = \mathbf{(1, 0, 1, 0, 1, 0, 0)}$

```text
STATE TRANSITION TRACE SUMMARY

 Access Step │ Way Hit │ Flipped Bits │ New State (B0 B1 B2 B3 B4 B5 B6)
─────────────┼─────────┼──────────────┼──────────────────────────────────
   Initial   │   -     │     -        │   0  0  0  0  0  0  0
   Access 1  │  Way 3  │ B0=1         │   1  0  0  0  0  0  0
   Access 2  │  Way 0  │ B1=1, B3=1   │   1  1  0  1  0  0  0
   Access 3  │  Way 7  │ B0=0         │   0  1  0  1  0  0  0
   Access 4  │  Way 2  │ B0=1, B1=0, B4=1│ 1  0  0  1  1  0  0
   Access 5  │  Way 5  │ B0=0, B2=1   │   0  0  1  1  1  0  0
   Access 6  │  Way 1  │ B0=1, B3=0   │   1  0  1  0  1  0  0
```

---

#### Step 3: Final State Vector and Eviction Decode for Access 7

After Access 6 completes, the final Tree-PLRU state vector is:

$$B_0 B_1 B_2 B_3 B_4 B_5 B_6 = \mathbf{1010100_2}$$

Now, a cache miss occurs on Access 7! Which way will be evicted?

Let us decode the eviction way by following the tree arrows from root bit $B_0$ down:
1. **Level 1 ($B_0 = 1$)**: $B_0 = 1 \implies$ Follow Right Branch $\to$ Right Subtree (Ways 4, 5, 6, 7).
2. **Level 2 ($B_2 = 1$)**: $B_2 = 1 \implies$ Follow Right Branch $\to$ Subtree (Ways 6, 7).
3. **Level 3 ($B_6 = 0$)**: $B_6 = 0 \implies$ Follow Left Branch $\to$ **Way 6**.

$$\text{Tree-PLRU Eviction Candidate for Access 7} = \mathbf{\text{Way 6}}$$

```text
EVICTION DECODE PATH FOR ACCESS 7

 Root B0 = 1 ──► Follow Right Branch (Ways 4-7)
                   │
                   ▼
 Level 2 B2 = 1 ──► Follow Right Branch (Ways 6-7)
                      │
                      ▼
 Level 3 B6 = 0 ──► Follow Left Branch (Way 6)
                      │
                      ▼
            [ WAY 6 EVICTED! ]
```

---

#### Step 4: Comparison against True LRU

Let us trace the true chronological access age of all 8 ways after Accesses 1 through 6:

* Access 1: Hit Way 3.
* Access 2: Hit Way 0.
* Access 3: Hit Way 7.
* Access 4: Hit Way 2.
* Access 5: Hit Way 5.
* Access 6: Hit Way 1.

Let us rank the 8 ways by access recency (from most recent to least recent):
1. **Way 1** (Accessed at Step 6 - Most Recent)
2. **Way 5** (Accessed at Step 5)
3. **Way 2** (Accessed at Step 4)
4. **Way 7** (Accessed at Step 3)
5. **Way 0** (Accessed at Step 2)
6. **Way 3** (Accessed at Step 1)
7. **Way 4 & Way 6** (Un-accessed since initial state - **Least Recently Used Candidates!**).

##### Comparison Result:
* True LRU Candidate: **Way 4 or Way 6** (neither was accessed during the sequence).
* Tree-PLRU Eviction Choice: **Way 6**.

**TREE-PLRU SELECTED WAY 6, MATCHING TRUE LRU PERFECTLY!**

---

### Sanity Check and Verification

Let us verify our mathematical and structural results against hardware state machine principles:

1. **Bit Count Verification**:
   * Number of ways $N = 8$. Tree-PLRU tracking bits $N - 1 = 7\text{ bits}$.
   * State vector $(B_0 \dots B_6)$ correctly uses 7 bits per set.
2. **MRU Protection Check**:
   * Way 1 was accessed most recently (Step 6).
   * Could Tree-PLRU evict Way 1?
   * On Access 6 (Hit Way 1), $B_0 \to 1$ (points to Right Subtree) and $B_3 \to 0$ (points to Way 0).
   * To reach Way 1 during eviction, $B_0$ would need to be $0$ AND $B_3$ would need to be $1$.
   * **It is physically impossible for Tree-PLRU to evict Way 1!**
3. **Hardware Storage Reduction**:
   * True LRU for 8 ways requires 16 bits per set.
   * Tree-PLRU used 7 bits per set, achieving a **$56.25\%$ reduction in metadata SRAM storage** while choosing the exact same eviction candidate as True LRU!

All state transitions, binary tree decode pathways, MRU protection guarantees, and True LRU comparisons evaluate with 100% mathematical, physical, and logical precision.

---

## Key Output Primitives

This lesson formally delivers the following conceptual primitives to your digital logic engineering toolbox:

* **Pseudo-LRU (PLRU)**: An $O(1)$ constant-time hardware replacement algorithm that approximates Least Recently Used line eviction using a logarithmic state space ($N-1$ bits for $N$ ways), eliminating the $N!$ combinatorial state explosion of True LRU while guaranteeing that the Most Recently Used line is never evicted.
* **Tree-PLRU State Machine**: The binary decision tree implementation of Pseudo-LRU that organizes $N$ ways as leaf nodes under $N-1$ directional bit nodes ($B_0 \dots B_{N-2}$), where cache hits flip tree bits to point away from the accessed way and eviction decoders follow the arrows down to select an un-accessed way in $O(\log_2 N)$ gate logic depth.
