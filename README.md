# Computer Science Knowledge Library

> **Manifesto:** Build a free, open, and exhaustive Computer Science library that explains the most complex engineering concepts in an extraordinarily intuitive, rigorous, and direct way.

---

## 1. Project Philosophy & Non-Negotiable Invariants

This library is built upon four fundamental pillars that distinguish it from traditional academic curricula:

### 1.1. "Explain the Complex Simply"
Every concept, no matter how advanced, can be understood if taught using first principles, relatable mental models, and clear abstractions. We eliminate academic fluff and conversational padding (*"In this chapter we will explore..."*); we start directly with the problem.

### 1.2. The Problem-First Invariant
No solution, technique, or architecture is ever introduced without first demonstrating the friction, physical limit, performance bottleneck, or deadlock that arises when that concept is missing.

### 1.3. Zero-Invasion Boundary (Pure Computer Science)
To maintain absolute domain purity:
* **Zero Analog Physics / Electronics:** Computing starts at the discrete digital logic boundary ($0$ and $1$, truth tables, logic gates). Semiconductor physics and analog voltages belong to Electrical Engineering and are strictly excluded.
* **Zero Isolated Blackboard Mathematics:** Mathematics is never taught as abstract paper formulas. Every mathematical tool (Boolean algebra, linear algebra, modular arithmetic, probability) is operationally absorbed inside the engineering code or hardware where it becomes executable.

### 1.4. Zero Entry Friction
Every course is designed to be accessible to a curious mind assuming zero prior knowledge of that specific domain. The introductory topic of any domain acts as an onboarding bridge, introducing all necessary mental primitives from scratch.

---

## 2. Knowledge Architecture & Domain Model

The library structures information as a continuous, unified **Directed Acyclic Graph (DAG)** of knowledge, organized in a strict 4-level taxonomy:

```text
Subject (Course)
 └── Block (Module)
      └── Topic (Unit)
           └── Lesson (Atom)
```

### 2.1. Subject
The maximum vertical unit of knowledge representing a closed, complete domain of Computer Science. It has no temporal duration or credit limits; its only bound is to exhaust the subject domain completely.

### 2.2. Block
A strategic subdivision within a Subject that groups topics sharing the same level of abstraction or dependency context.

### 2.3. Topic
A coordinated set of lessons focused on solving a specific technical problem or mastering a complex component.

### 2.4. Lesson
The minimal, indivisible learning unit. Each lesson addresses a **single, orthogonal, atomic concept**. It delivers a theoretical depth of ~5,000 words, accompanied by embedded visual diagrams, real-world edge cases, and a step-by-step solved engineering exercise.

---

## 3. Principles of Orthogonality and Abstraction

* **The Orthogonality Rule:** The intersection of competencies between any two lessons or subjects is empty. If two concepts can exist or be implemented independently, they belong to separate units.
* **No Compound Names:** Subject and lesson titles never use compound connectors (e.g., "X and Y"). Each unit represents a single, unívocal engineering or theoretical concept.
* **Abstraction Contracts:** Higher-level layers treat lower-level layers as deterministic "black boxes." A higher unit consumes the output contract of a lower unit without needing to re-explain its internal mechanics.

---

## 4. Visual & Pedagogical Standards

* **Ubiquitous Visual Representation:** Diagrams and visual state maps are not relegated to isolated sections. They are embedded organically throughout the text whenever a problem, state transition, memory layout, or pipeline is explained.
* **Universal Unicode/ASCII Format:** All visual aids use monospaced text diagrams aligned flush to the left margin, with a maximum width of 70 characters to ensure perfect readability on any screen or terminal without horizontal scrolling.
* **Continuous Reading Flow:** Text citations and academic cross-reference tags (e.g., `[1.1.1]`) are strictly prohibited to avoid interrupting the reader's focus.

---

## 5. How to Understand and Use This Repository

Every directory and specification within this project is **autonomous and self-contained**. 

* **To Explore the Curriculum Structure:** Navigate through the layer directories. Each layer represents a contract of abstraction that feeds the layers above it.
* **To Implement or Contribute Content:** Follow the structural contracts, domain limits, and lesson templates defined within the respective specification spaces. Every lesson must deliver an atomic problem, formal mechanics, real-world edge cases, a solved quantitative exercise, and a clear list of output primitives.

> Escoge una asignatura del grafo DAG para hacer su asignatura. No hace falta un orden lineal. Mola hacer el grafo en diferentes capas, como si fuese el temario de la universidad o un master o posgrado/doctorado. Eso si, respeta las dependencias.
> De cara a hacer ToC's o escribir lecciones, piensa que es un temario para ingenieros informáticos. Prima la lógica sobre otros aspectos como los detalles electrónicos, matemáticos u de otro tipo. Recuerda tu público.
> SIEMPRE QUE SE COMPARTA CONTIGO ESTE PROYECTO, TENDRÁ PREDETERMINADAMENTE LA ULTIMA ASIGNATURA ESCRITA, SE OMITEN EL RESTO (EXCEPTO SU TOC.MD) PARA NO LLENAR TU CONTEXTO Y SIEMPRE TENER UNA REFERENCIA. ESO SI, JAMÁS HAGAS REFERENCIAS DIRECTAS A ESTA ÚLTIMA ASIGNATURA DE REFERENCIA Y MUCHO MENOS, JAMAS DES COSAS POR SABIDAS. SE COMPARTEN LAS TOC.MD PARA QUE SEPAS UN POCO LO QUE SE HA REDACTADO DEL PROYECTO.
> Ojo las ToC que alguno de sus headers contiene la forma X & Y es sospechoso de incorrección: o es X o es Y. seguramnete haya alternativas como elevar la instancia o crearlo de formas independientes como X e Y.