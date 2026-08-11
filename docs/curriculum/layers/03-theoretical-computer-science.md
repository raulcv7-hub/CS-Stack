# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 03

La Capa 03 constituye el cimiento matemático-formal de la computación teórica, la definición rigurosa de lenguajes de programación y la construcción del frontend de compiladores. Su dominio abarca la caracterización de gramáticas formales y autómatas, el análisis léxico y sintáctico para la producción de Árboles Sintácticos Abstractos (AST), la semántica formal denotacional y operacional, la teoría y arquitectura de sistemas de tipos, el análisis estático de programas mediante interpretación abstracta, la transformación a Representación Intermedia neutra en Forma SSA, los límites matemáticos de la computabilidad, la teoría de la complejidad computacional (P vs NP, NP-Completitud), los motores de resolución de restricciones SAT/SMT y la verificación formal de sistemas mediante comprobación de modelos. Toda emisión de código máquina ejecutable, asignación de registros físicos o gestión de runtimes se asume totalmente abstraída por la Capa 05.

---

## 🟢 CAPA 03: Theoretical CS, Formal Languages & Compiler Frontends
*(Ruta en sistema de archivos: `content/03-theoretical-computer-science/`)*

---

### 01. `automata-theory` — Automata Theory

* **Assumed Prerequisites:** Recorridos de grafos y análisis asintótico de `02: 01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la definición formal de alfabetos y cadenas y termina en la equivalencia entre gramáticas libres de contexto y autómatas a pila, incluyendo algoritmos de conversión y minimización de estados.
* **Explicit Exclusions:** ❌ SIN comprobación semántica de tipos (tratada en `04`), ❌ SIN análisis de flujo de control (CFG, tratado en `05`).
* **Problema Disparador:** ¿Cómo definimos matemáticamente qué secuencias de símbolos son válidas en un lenguaje y qué potencia de cómputo se requiere para reconocerlas u optimizar su reconocimiento?
* **Dominio Técnico Comprehendido:** La Jerarquía de Chomsky, Lenguajes Regulares y Autómatas Finitos (DFA/NFA), Expresiones Regulares, Construcción de Subconjuntos (conversión Powerset NFA $\rightarrow$ DFA), Minimización de DFAs (Algoritmo de Hopcroft), Lenguajes Libres de Contexto, Gramáticas, Autómatas a Pila (*Pushdown Automata*) y Lemas de Bombeo (*Pumping Lemma* para lenguajes regulares y libres de contexto).
* **Artefacto / Modelo Mental Entregable:** Un convertidor de NFA a DFA minimizado por Hopcroft y un autómata a pila determinista (PDA) capaz de validar gramáticas libres de contexto balanceadas.
* **Frontera de Entrada:** Comienza en la definición formal de alfabeto, cadena y lenguaje aceptado.
* **Frontera de Salida:** Termina en la minimización determinista de autómatas finitos y la equivalencia entre gramáticas libres de contexto y autómatas a pila.
* **Dependencias Directas:** `02: 01. asymptotic-algorithm-analysis`.

---

### 02. `compiler-frontend-parsing` — Compiler Frontend Parsing

* **Assumed Prerequisites:** Autómatas finitos (DFA/NFA), conversión Powerset y gramáticas libres de contexto de `01. automata-theory`.
* **Course Boundary:** Comienza en el flujo de caracteres UTF-8 no estructurado del código fuente y termina en la desambiguación y transformación del Árbol de Sintaxis Concreta (CST) a un Árbol Sintáctico Abstracto (AST) con Tablas de Símbolos.
* **Explicit Exclusions:** ❌ SIN comprobación semántica de tipos (tratada en `04`), ❌ SIN emisión de representación intermedia SSA IR (tratada en `06`).
* **Problema Disparador:** El compilador recibe un flujo continuo de caracteres no estructurados. ¿Cómo reconocemos tokens en $O(1)$, resolvemos ambigüedades gramaticales y descartamos la sintaxis superficial para construir un Árbol Sintáctico Abstracto (AST) y Tablas de Símbolos?
* **Dominio Técnico Comprehendido:** Procesamiento de texto de lenguajes, Construcción de Thompson (Regex $\rightarrow$ NFA), generadores de tokens (Lexers), gramáticas formales, desambiguación y precedencia de operadores, Árbol de Sintaxis Concreta (CST / Parse Tree) vs Árbol de Sintaxis Abstracta (AST), Tablas de Símbolos para ámbitos léxicos (*Lexical Scope Resolution*), algoritmos de parsing Top-Down (Recursive Descent, LL(k)) y Bottom-Up (LR(1), LALR) y estrategias de recuperación de errores sintácticos.
* **Artefacto / Modelo Mental Entregable:** Un generador de Lexer basado en Thompson/Hopcroft y un Parser LALR(1) funcional que transforma código fuente en un AST estructurado con resolución de Tabla de Símbolos.
* **Frontera de Entrada:** Comienza en el flujo de caracteres UTF-8 no estructurado del código fuente.
* **Frontera de Salida:** Termina en la producción de un AST validado sintácticamente libre de ruido sintáctico con Tabla de Símbolos.
* **Dependencias Directas:** `01. automata-theory`.

---

### 03. `formal-semantics-foundations` — Formal Semantics Foundations

* **Assumed Prerequisites:** Árboles de Sintaxis Abstracta (AST) y Tablas de Símbolos de `02. compiler-frontend-parsing`.
* **Course Boundary:** Comienza en la toma del AST no tipado y termina en la especificación matemática rigurosa de la ejecución mediante semántica denotacional, operacional y axiomática.
* **Explicit Exclusions:** ❌ SIN comprobación de tipos ni inferencia (tratadas en `04`), ❌ SIN generación de código objeto (Capa 05).
* **Problema Disparador:** Definir el comportamiento de un lenguaje mediante documentación en texto ambiguo produce interpretaciones inconsistentes y fallos no deterministas. ¿Cómo especificamos el significado y la ejecución de un programa matemáticamente sobre el AST de forma inequívoca?
* **Dominio Técnico Comprehendido:** Semántica Formal, Semántica Denotacional (dominios, puntos fijos), Semántica Operacional de paso pequeño (*Small-Step*) y paso grande (*Big-Step*), Semántica Axiomática (Lógica de Hoare, tripletas de Hoare, pre/postcondiciones e invariantes de bucle), Cálculo Lambda Untyped ($\lambda$-calculus, $\alpha$-conversión, $\beta$-reducción, estrategias de evaluación de orden normal vs valor).
* **Artefacto / Modelo Mental Entregable:** Un intérprete de semántica operacional de paso pequeño para un lenguaje imperativo elemental sobre AST y un reductor de Cálculo Lambda con estrategias de evaluación.
* **Frontera de Entrada:** Comienza en el AST no tipado emitido por el parser.
* **Frontera de Salida:** Termina en la especificación formal del comportamiento operacional del lenguaje y la verificación de tripletas de Hoare.
* **Dependencias Directas:** `02. compiler-frontend-parsing`.

---

### 04. `type-system-architecture` — Type System Architecture

* **Assumed Prerequisites:** AST y semántica operacional de `03. formal-semantics-foundations`.
* **Course Boundary:** Comienza en el AST anotado con estados y termina en la demostración formal de seguridad de tipos y la fundamentación teórica de la gestión afín de recursos.
* **Explicit Exclusions:** ❌ SIN análisis estático por interpretación abstracta sobre retículos (tratado en `05`).
* **Problema Disparador:** Sin reglas formales sobre los datos, las operaciones inválidas en memoria se detectan solo durante la ejecución. ¿Cómo diseñamos sistemas de tipos que demuestren estáticamente la ausencia de errores de tipo y garanticen la gestión segura de recursos sin tiempo de ejecución?
* **Dominio Técnico Comprehendido:** Sistemas de Tipos, Reglas de Tipado (*Typing Judgments & Rules*), Comprobación de tipos (*Type Checking*), Inferencia de Tipos (Algoritmo Hindley-Milner / Algorithm W), Sistema F y Polimorfismo Paramétrico, Subtipado y Varianza (Covarianza, Contravarianza), Sistemas de Tipos Lineales y Afines (*Linear/Affine Type Systems* para fundamentación teórica de propiedad y préstamos), y Pruebas de Solidez de Tipos (*Type Soundness: Progress and Preservation Theorem*).
* **Artefacto / Modelo Mental Entregable:** Un motor de inferencia de tipos Hindley-Milner con comprobación de tipos afines sobre AST, demostrado formalmente bajo las propiedades de *Progress* y *Preservation*.
* **Frontera de Entrada:** Comienza en el AST producido por el parser listo para la verificación semántica de tipos.
* **Frontera de Salida:** Termina en el AST totalmente anotado con tipos y demostrado bajo solidez de tipos (*Type Soundness*) y semántica afín de recursos.
* **Dependencias Directas:** `03. formal-semantics-foundations`.

---

### 05. `static-program-analysis` — Static Program Analysis

* **Assumed Prerequisites:** AST anotado con tipos y semántica operacional de `04. type-system-architecture`.
* **Course Boundary:** Comienza en el AST tipado y termina en la aproximación segura y convergente del comportamiento del programa mediante análisis de flujo de datos e interpretación abstracta sobre retículos.
* **Explicit Exclusions:** ❌ SIN pruebas de software en tiempo de ejecución (Testing, Capa 09).
* **Problema Disparador:** Probar el software con entradas limitadas no garantiza la ausencia de errores, y evaluar todas las ejecuciones exactamente es un problema indecidible. ¿Cómo aproximamos conservadoramente el comportamiento de todas las ejecuciones posibles garantizando la convergencia del análisis?
* **Dominio Técnico Comprehendido:** Análisis estático sin ejecución, Grafos de Flujo de Control (CFG), Análisis de Flujo de Datos (*Reaching Definitions, Liveness Analysis, Available Expressions*), Análisis de Punteros y Alias, Interpretación Abstracta, Retículos y Semirretículos, Conexiones de Galois, Operadores de Ensanchamiento y Estrechamiento (*Widening & Narrowing operators* para convergencia de Puntos Fijos sobre retículos infinitos) y Detección Estática de Vulnerabilidades.
* **Artefacto / Modelo Mental Entregable:** Un analizador estático de código basado en Interpretación Abstracta sobre retículos de intervalos con operadores de *Widening* operando sobre CFGs.
* **Frontera de Entrada:** Comienza en la toma del código fuente tipado.
* **Frontera de Salida:** Termina en la aproximación segura y garantizada en tiempo finito del comportamiento en tiempo de ejecución.
* **Dependencias Directas:** `04. type-system-architecture`.

---

### 06. `intermediate-representation-design` — Intermediate Representation Design

* **Assumed Prerequisites:** AST tipado de `02. compiler-frontend-parsing` y análisis de flujo de control de `05. static-program-analysis`.
* **Course Boundary:** Comienza en el AST tipado y analiza la promoción de variables de memoria a registros SSA mediante análisis de alias y la transformación a Representación Intermedia neutra optimizada en Forma SSA.
* **Explicit Exclusions:** ❌ SIN asignación de registros físicos de CPU ni emisión de ensamblador de arquitectura (Capa 05).
* **Problema Disparador:** Realizar optimizaciones complejas directamente sobre el AST o sobre ensamblador específico es caótico, y las asignaciones en pila representan accesos lentos a memoria. ¿Cómo traducimos el AST a una representación intermedia de tres direcciones en forma SSA, promoviendo variables de memoria a registros SSA virtuales?
* **Dominio Técnico Comprehendido:** Representaciones Intermedias de compilador (IR de tres direcciones), Representación en Forma SSA (Static Single Assignment), Dominancia, Árboles de Dominancia, Fronteras de Dominancia, Algoritmo de colocación de nodos $\phi$ y renominación de variables (Cytron), Promoción de Memoria a Registros SSA (*Mem2Reg / SROA - Scalar Replacement of Aggregates*) mediante análisis de alias, Grafos de Flujo de Control en IR y pases de optimización de IR independientes de la arquitectura (DCE, Constant Folding, CSE).
* **Artefacto / Modelo Mental Entregable:** Un conversor de AST a forma SSA IR con pase Mem2Reg, colocación de funciones $\phi$ por algoritmo de Cytron y cálculo de fronteras de dominancia.
* **Frontera de Entrada:** Comienza en la toma del AST tipado.
* **Frontera de Salida:** Termina en una Representación Intermedia SSA tipada, desambiguada en memoria y optimizada lista para el backend.
* **Dependencias Directas:** `02. compiler-frontend-parsing`, `05. static-program-analysis`.

---

### 07. `computability-theory` — Computability Theory

* **Assumed Prerequisites:** Nivel formal de autómatas y gramáticas de `01. automata-theory`.
* **Course Boundary:** Comienza en la definición formal del modelo abstracto de cálculo universal y termina en las pruebas matemáticas formales de indecidibilidad e imposibilidad del análisis semántico exacto.
* **Explicit Exclusions:** ❌ SIN análisis de clases de complejidad polinomial P vs NP (tratadas en `08`).
* **Problema Disparador:** Existen problemas bien formulados que ningún ordenador podrá resolver jamás. ¿Cómo delimitamos matemáticamente la frontera entre lo computable y lo indecidible, y cómo demostramos que todo análisis semántico exacto de programas es imposible?
* **Dominio Técnico Comprehendido:** Máquinas de Turing (Deterministas, No Deterministas, Multicinta), Tesis de Church-Turing, Jerarquía de Chomsky Tipo 0 y Tipo 1, Problema de la Parada (*Halting Problem*), Decidibilidad y Semidecidibilidad, Reducciones de Computabilidad, Teorema de Rice (demostración formal de que cualquier propiedad semántica no trivial de un programa es indecidible) y Problema de Correspondencia de Post (PCP).
* **Artefacto / Modelo Mental Entregable:** Una demostración formal por diagonalización del Halting Problem y del Teorema de Rice, junto con un simulador universal de Máquina de Turing.
* **Frontera de Entrada:** Comienza en la definición matemática del modelo de cálculo universal.
* **Frontera de Salida:** Termina en las pruebas de imposibilidad lógica de la computación y la fundamentación teórica de la indecidibilidad semántica.
* **Dependencias Directas:** `01. automata-theory`.

---

### 08. `computational-complexity-theory` — Computational Complexity Theory

* **Assumed Prerequisites:** Máquinas de Turing e Indecidibilidad de `07. computability-theory`.
* **Course Boundary:** Comienza en la clasificación de problemas decidibles según el consumo de recursos de tiempo/espacio y termina en la teoría de NP-Completitud y reducciones polinomiales.
* **Explicit Exclusions:** ❌ SIN algoritmos heurísticos de aproximación (Capa 02).
* **Problema Disparador:** Un problema puede ser computable en teoría pero requerir más tiempo que la edad del universo para resolverse en la práctica. ¿Cómo clasificamos los problemas según su dificultad inherente y demostramos que un problema es tan difícil como los más complejos de su clase?
* **Dominio Técnico Comprehendido:** Medidas de complejidad en Máquinas de Turing, Clases de Complejidad en Tiempo (P, NP, EXPTIME), Clases de Complejidad en Espacio (L, PSPACE, NPSPACE), Teorema de Savitch, Reducciones Polinomiales (Karp / Cook), Teorema de Cook-Levin, NP-Completitud (SAT, 3-SAT, Clique, Vertex Cover, TSP) y la Jerarquía Polinomial.
* **Artefacto / Modelo Mental Entregable:** Demostración formal del Teorema de Cook-Levin y construcción de una cadena de reducciones polinomiales desde 3-SAT a un problema de grafos NP-Completo.
* **Frontera de Entrada:** Comienza en la delimitación de recursos (tiempo y memoria) para problemas decidibles.
* **Frontera de Salida:** Termina en la caracterización formal de la frontera P vs NP y la prueba de intratabilidad polinomial.
* **Dependencias Directas:** `07. computability-theory`.

---

### 09. `constraint-satisfaction-solvers` — Constraint Satisfaction Solvers

* **Assumed Prerequisites:** Análisis estático de `05. static-program-analysis` y NP-Completitud de `08. computational-complexity-theory`.
* **Course Boundary:** Comienza en la formulación de problemas de satisfacción de restricciones booleanas y aritméticas y termina en la construcción de motores de resolución SAT/SMT de alto rendimiento con aprendizaje de cláusulas por conflicto.
* **Explicit Exclusions:** ❌ SIN verificación formal por Model Checking temporal (tratada en `10`).
* **Problema Disparador:** Resolver instancias masivas de problemas NP-Completos por fuerza bruta es inviable. ¿Cómo construimos motores de razonamiento que resuelvan millones de cláusulas lógicas y restricciones aritméticas mediante deducción y aprendizaje de conflictos?
* **Dominio Técnico Comprehendido:** Algoritmos de Resolución SAT, Algoritmo DPLL (*Davis-Putnam-Logemann-Loveland*), Algoritmo CDCL (*Conflict-Driven Clause Learning*), Estructuras de datos de propagación de unidades (*2-Watched Literals*), Heurísticas de decisión (VSIDS), Teorías SMT (*Satisfiability Modulo Theories* - Z3 internals, Teoría de Igualdad con Funciones Sin Interpretar, Aritmética Lineal de Enteros/Reales), Ejecución Simbólica (*Symbolic Execution*, explosión de caminos y *Concolic Testing*).
* **Artefacto / Modelo Mental Entregable:** Un motor Solver CDCL SAT en C/Rust con aprendizaje de cláusulas por conflicto, *2-Watched Literals* y soporte SMT elemental para teoría de igualdad.
* **Frontera de Entrada:** Comienza en la formulación de fórmulas booleanas y restricciones simbólicas de entrada.
* **Frontera de Salida:** Termina en la decisión determinista SAT/UNSAT con asignación de variables o prueba de conflicto.
* **Dependencias Directas:** `05. static-program-analysis`, `08. computational-complexity-theory`.

---

### 10. `formal-model-checking` — Formal Model Checking

* **Assumed Prerequisites:** Solvers de restricciones de `09. constraint-satisfaction-solvers` y análisis estático de `05. static-program-analysis`.
* **Course Boundary:** Comienza en la especificación lógica del espacio de estados de un sistema y termina en la verificación exhaustiva de propiedades temporales mediante Model Checking y prueba interactiva.
* **Explicit Exclusions:** ❌ SIN pruebas unitarias estáticas o dinámicas tradicionales (Capa 09).
* **Problema Disparador:** En sistemas concurrentes y críticos (aeroespacial, kernels, protocolos), las combinaciones de estados son astronómicas y las pruebas tradicionales pasan por alto condiciones de carrera sutiles. ¿Cómo demostramos matemáticamente que un sistema jamás violará sus invariantes explorando su espacio de estados formalmente?
* **Dominio Técnico Comprehendido:** Verificación formal por espacio de estados, Lógica Temporal (*LTL - Linear Temporal Logic, CTL - Computation Tree Logic*), Comprobación de Modelos (*Model Checking* explícito vs Bounded Model Checking simbólico por SAT/SMT), Lenguajes de especificación (TLA+, Promela/SPIN), Reducción de orden parcial para mitigar explosión de estados, e Introducción a Asistentes de Demostración / Provers Interactivos (*Interactive Theorem Proving* - Coq, Lean).
* **Artefacto / Modelo Mental Entregable:** Una especificación de un protocolo concurrente en TLA+ verificada mediante un motor de Model Checker que genera un contraejemplo de traza exacta ante violaciones de invariantes.
* **Frontera de Entrada:** Comienza en la especificación formal del modelo de estados y la propiedad de lógica temporal.
* **Frontera de Salida:** Termina en la demostración matemática formal de corrección o en la emisión de un contraejemplo de ejecución.
* **Dependencias Directas:** `05. static-program-analysis`, `09. constraint-satisfaction-solvers`.