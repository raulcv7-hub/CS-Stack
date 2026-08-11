# ESPECIFICACIÓN DE ARQUITECTURA DE CAPAS: ONTOLOGÍA Y CLASIFICADOR GENERATIVO (CAPAS 00 A 10)

---

## PARTE 1: MEMORIA DE ARQUITECTURA Y REGLAS DE ABSTRACCIÓN

### 1.1. Propósito del Documento
Este documento constituye la **Ontología Generativa de Capas de Abstracción**. Su propósito no es enumerar asignaturas de forma estática, sino establecer los **Criterios Lógicos de Pertenencia, Arquetipos de Problemas y Contratos de Interfaz (API/Primitivos)** que permiten clasificar y componer cualquier conocimiento presente o futuro de las Ciencias de la Computación dentro de un Grafo Acíclico Dirigido (DAG) infinito, ordenado y extensible.

---

### 1.2. Las Dos Fronteras Inviolables de Dominio

1. **Cero Física y Cero Electrónica Analógica:** 
   * **FUERA DEL PROYECTO:** Transistores analógicos, dopaje de semiconductores, curvas $V-I$, leyes de Kirchhoff, capacitancias parasitarias, soldadura, electromagnetismo o física de materiales.
   * **DENTRO DEL PROYECTO:** La **Abstracción Digital Discreta**. El sistema asume los valores lógicos $0$ y $1$, las **Puertas Lógicas básicas (`AND`, `OR`, `NOT`)**, las tablas de verdad, los registros binarios y las señales de reloj como axiomas dados.
2. **Cero Matemáticas Puras Isoladas:**
   * **FUERA DEL PROYECTO:** Asignaturas de matemáticas puras de pizarra (Álgebra Lineal pura, Cálculo Multivariable de papel, Estadística teórica no computacional).
   * **DENTRO DEL PROYECTO:** Todo concepto matemático se **absorbe de forma operacional** dentro del dominio de ingeniería donde se convierte en código ejecutable o hardware digital.

---

### 1.3. Semántica del Grafo DAG y Contrato de Capas

$$\text{Capa } N \xrightarrow{\quad \text{Contrato de Interfaz (API/Primitivos)} \quad} \text{Capa } N+1$$

* **Frontera de Entrada (Caja Negra):** Conjunto de abstracciones que la Capa $N$ asume como totalmente resueltas e implementadas por las capas inferiores ($00 \dots N-1$).
* **Frontera de Salida (Contrato):** Conjunto de primitivos y servicios deterministas que la Capa $N$ entrega a las capas superiores ($N+1 \dots 10$).
* **Regla de Pertenencia Generativa:** Filtro lógico que decide si un concepto pertenece a una capa.
* **Garantía Inviolable del DAG:** La Capa $N$ **jamás** puede hacer referencia o depender de conceptos que se introduzcan formalmente en la Capa $N+K$.

---

# PARTE 2: ONTOLOGÍA DE CAPAS Y REGLAS DE CLASIFICACIÓN

---

## 🟢 CAPA 00: Substrato de Conmutación Digital y Microarquitectura

### 1. Naturaleza Ontológica de la Capa
La traducción del bit discreto ($0$ y $1$) en una **máquina física/lógica capaz de interpretar y ejecutar instrucciones en serie sobre memoria contigua, gestionar su energía y comunicarse con el entorno**.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 00 si y solo si es una construcción lógica discreta que define la conmutación de puertas, la representación numérico-binaria por hardware, la ruta de datos de un procesador, un conjunto de instrucciones (ISA), el control de potencia/reloj o la interacción bare-metal con periféricos sin intermediación de software.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de minimización y síntesis de lógica combinacional y secuencial.
* Problemas de representación de números reales y enteros en registros fijos de hardware.
* Problemas de sincronización por reloj, riesgos (*hazards*) y segmentación de instrucciones (*pipelining*).
* Problemas de densidad de potencia, estrangulamiento térmico y dominios de reloj (*Dark Silicon, DVFS, Clock Gating*).
* Problemas de transferencia de datos de alta velocidad en buses físicos (PCIe, CXL, DMA).
* Problemas de comunicación directa con periféricos mediante registros mapeados en memoria (MMIO).

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** Axioma del estado discreto ($0/1$) y puertas lógicas funcionales (`AND`, `OR`, `NOT`).
* **Salida (Contrato):** Procesador ejecutable por **Conjunto de Instrucciones (ISA / Ensamblador)**, registros, stack frame por hardware, controladores DVFS y MMIO.

### 5. Exclusiones Estratégicas
* ❌ Cero física de materiales, voltajes o electrónica analógica.
* ❌ Cero lenguajes de alto nivel compilados/interpretados (C/C++).
* ❌ Cero abstracciones de software multi-tarea (kernels/procesos).

---

## 🟢 CAPA 01: Semántica de Lenguajes, Memoria y Paradigmas de Ejecución

### 1. Naturaleza Ontológica de la Capa
La **expresión de lógica de software, mutación de estado, gestión de memoria direccionable y control de flujo** mediante sintaxis estructurada y paradigmas de computación.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 01 si y solo si es un mecanismo o paradigma de lenguaje de programación (variables, tipos, punteros, asignadores de memoria, modelos de propiedad, concurrencia de memoria compartida, asincronía, metaprogramación o efectos algebraicos) que define cómo se expresa y ejecuta la lógica en código.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de modelado y abstracción de datos en memoria (tipado, punteros, referencias, alineamiento).
* Problemas de representación exacta de texto en bytes (codificaciones UTF-8/IEEE 754).
* Problemas de gestión explícita del ciclo de vida de la memoria (asignadores Heap, fragmentación, RAII, propiedad y préstamos).
* Problemas de estructuración del código (orientación a objetos, diseño orientado a datos, funciones puras, inmutabilidad, unificación lógica).
* Problemas de ordenamiento de memoria y coordinación (mutexes, atómicos, `Acquire`/`Release`, event loops, continuaciones delimitadas y efectos algebraicos).

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** Instrucciones de ensamblador, registros y memoria direccionable (Capa 00).
* **Salida (Contrato):** Tipos de datos, punteros, asignadores de Heap, semántica de propiedad, paradigmas de ejecución (OOP, DOD, Funcional, Concurrente, Async, Efectos) y DSLs internos.

### 5. Exclusiones Estratégicas
* ❌ Cero estructuras de datos compuestas o jerárquicas (árboles auto-balanceados, grafos).
* ❌ Cero llamadas a servicios del sistema operativo (`syscalls`, memoria virtual paginada).

---

## 🟢 CAPA 02: Organización de Datos y Análisis Algorítmico

### 1. Naturaleza Ontológica de la Capa
La **eficiencia espacio-temporal en la organización, versión y procesamiento de la información** independientemente del lenguaje o entorno.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 02 si y solo si es una estructura de datos en memoria (lineal, jerárquica, probabilística, espacial, persistente/inmutable) o un patrón algorítmico caracterizado y medido formalmente por su complejidad asintótica (Big-O) o modelo de I/O.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de ordenación, búsqueda y acceso a datos en tiempo/espacio óptimo.
* Problemas de representación de relaciones complejas (redes, jerarquías, espacio geométrico).
* Problemas de preservación del historial en inmutabilidad mediante compartición estructural de nodos (*Path Copying, HAMT*).
* Problemas de reducción de espacio mediante estructuras de datos estimativas/probabilísticas (Bloom, HyperLogLog).
* Problemas de exploración, flujo en redes y optimización combinatoria.
* Problemas de procesamiento frecuencial (FFT) e indexación de secuencias de texto (FM-Index).

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** Tipos primitivos, punteros, referencias de memoria y control de flujo (Capa 01).
* **Salida (Contrato):** Estructuras de datos avanzadas (árboles, grafos, filtros, tries inmutables) y algoritmos de optimización clasificados en complejidad Big-O y modelos I/O.

### 5. Exclusiones Estratégicas
* ❌ Cero teoría de gramáticas formales o autómatas sintácticos (Capa 03).
* ❌ Cero llamadas a disco físico, bases de datos o persistencia (Capa 07).
* ❌ Cero comunicación por red multi-nodo (Capa 06).

---

## 🟢 CAPA 03: Sintaxis Formal, Semántica y Compilación Frontend

### 1. Naturaleza Ontológica de la Capa
La **transformación de texto no estructurado en representaciones semánticas e intermedias tipadas**, y la delimitación matemática de la computabilidad y la complejidad.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 03 si y solo si es un modelo autómata/gramatical, una teoría formal de tipos, un analizador sintáctico, una transformación a Representación Intermedia (SSA IR) independiente del SO, un análisis de decidibilidad o una clasificación de complejidad polinomial.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de reconocimiento y validación de lenguajes formales y gramáticas.
* Problemas de demostración formal de seguridad y solidez de tipos (*Type Safety*).
* Problemas de análisis estático del flujo de control y datos en código mediante interpretación abstracta.
* Problemas de traducción de sintaxis humana a Árboles Sintácticos (AST) y Representaciones Intermedias (SSA IR).
* Problemas de delimitación de lo que es computable o indecidible (*Halting Problem*, Teorema de Rice).
* Problemas de clasificación de dificultad computacional (P vs NP, NP-Completitud, PSPACE).
* Problemas de verificación lógica formal de programas (*Model Checking*, CDCL SAT/SMT Solvers).

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** Estructuras de datos de árbol/grafo (Capa 02) e Instrucciones ISA (Capa 00).
* **Salida (Contrato):** Árboles AST, Representaciones Intermedias SSA tipadas, pruebas formales de solidez y límites de decidibilidad/complejidad.

### 5. Exclusiones Estratégicas
* ❌ Cero generación de formatos ejecutables binarios vinculados al SO (`ELF`/`PE`).
* ❌ Cero motores de bytecode o runtimes en tiempo de ejecución (JVM/V8/GC).
* ❌ Cero llamadas al sistema operativo.

---

## 🟢 CAPA 04: Gestión de Recursos de Nodo y Sistemas Operativos

### 1. Naturaleza Ontológica de la Capa
La **multiplexación, aislamiento, arbitraje seguro y filtrado de recursos físicos de una sola máquina** para ejecutar múltiples programas de forma compartida.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 04 si y solo si es un mecanismo del kernel de SO para abstraer y gobernar la CPU, la memoria virtual paginada, la comunicación IPC, los bloques de almacenamiento local, los controladores de dispositivos, el aislamiento de procesos/contenedores o el filtrado de llamadas al sistema en un solo nodo.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de planificación, aislamiento y cambio de contexto entre múltiples procesos/hilos.
* Problemas de sincronización ligera en espacio de usuario y comunicación inter-procesos (Futex, IPC, Pipes).
* Problemas de abstracción de memoria física mediante espacio de direcciones virtuales paginadas (`mmap`).
* Problemas de persistencia local en bloques resistente a apagones (VFS, Inodos, Journaling, FTL NAND Flash).
* Problemas de comunicación y control de hardware de I/O mediante controladores e `io_uring`.
* Problemas de virtualización (hipervisores) y aislamiento de contenedores (`namespaces/cgroups`).
* Problemas de restricción de privilegios y filtrado de interfaces del Kernel (`seccomp-bpf`, LSM, Landlock).

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** Instrucciones ISA (Capa 00), memoria C/Concurrencia (Capa 01) e IR de compilador (Capa 03).
* **Salida (Contrato):** Modo protegido, llamadas al sistema (*Syscalls*), Memoria Virtual, VFS local, Drivers de dispositivo, Aislamiento mono-nodo (`namespaces/cgroups`) y Sandboxes de Kernel.

### 5. Exclusiones Estratégicas
* ❌ Cero máquinas virtuales de bytecode gestionado (JVM/V8) o Garbage Collectors de lenguajes.
* ❌ Cero comunicación por red entre máquinas distintas o sockets distribuidos.

---

## 🟢 CAPA 05: Entornos de Ejecución Administrados, Formatos Binarios y Toolchains

### 1. Naturaleza Ontológica de la Capa
El **ensamblaje binario nativo para el SO y la ejecución administrada mediante entornos de bytecode, interpretación dinámica y optimización de runtimes**.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 05 si y solo si es un sistema de construcción/toolchain, un formato ejecutable del SO (`ELF`), un enlazador, un motor de bytecode (JVM/V8/Wasm), un compilador JIT, un recolector de basura o un optimizador de lenguajes dinámicos (Inline Caches/Shapes).*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de asignación de registros físicos por coloreado de grafos y selección de instrucciones.
* Problemas de resolución de símbolos y enlazado de múltiples archivos objeto en binarios ejecutables (`ELF`/`PE`).
* Problemas de gestión automatizada y reproducible de cadenas de montaje de software (*toolchains*).
* Problemas de ejecución de código portátil mediante máquinas virtuales de bytecode y sandboxes WebAssembly.
* Problemas de optimización dinámica mediante compilación JIT, desoptimización OSR y Safepoints.
* Problemas de gestión automática de memoria en runtimes (*Garbage Collection* generacional/concurrente).
* Problemas de aceleración de acceso a objetos dinámicos mediante Clases Ocultas (*Shapes*) e *Inline Caches*.

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** Representación Intermedia SSA (Capa 03) y API de memoria virtual/syscalls del Kernel (Capa 04).
* **Salida (Contrato):** Binarios ejecutables relocalizables (`ELF`/`PE`), motores de bytecode (JVM/V8/Wasm), JIT, Garbage Collectors y Runtimes dinámicos optimizados.

### 5. Exclusiones Estratégicas
* ❌ Cero sockets de red ni protocolos de comunicación.
* ❌ Cero motores de bases de datos o almacenamiento persistente.

---

## 🟢 CAPA 06: Interconexión Multi-nodo, Redes y Consenso Distribuido

### 1. Naturaleza Ontológica de la Capa
La **comunicación de paquetes a través de medios no fiables, la coordinación de tiempo físico y el acuerdo/consenso entre múltiples nodos independientes**.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 06 si y solo si es un protocolo de transporte/enrutamiento de datos por red, una arquitectura SDN, un protocolo de sincronización de tiempo físico, una abstracción de comunicación distribuida, o un algoritmo para alcanzar acuerdo/consenso en presencia de fallos en redes multi-nodo.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de entrega, direccionamiento y enrutamiento de paquetes entre redes heterogéneas (L2/L3/SDN).
* Problemas de flujo, congestión y canal fiable sobre medios con pérdida (TCP/QUIC, CUBIC/BBR).
* Problemas de ordenación de eventos sin reloj físico global (relojes lógicos/vectoriales).
* Problemas de acotación del error de tiempo físico en redes (NTP, PTP IEEE 1588, APIs TrueTime).
* Problemas de acuerdo único sobre registros distribuidos ante caídas (*Crash-Stop*: Paxos/Raft) o adversarios (*Crash-Adversarial*: PBFT/PoW).
* Problemas de localización y descubrimiento de nodos en redes descentralizadas (P2P/DHT Kademlia).

### 4. Contrato de Entrada/Salida
* **Entrada (Caja Negra):** Sockets I/O y Drivers de red del Kernel (Capa 04) e I/O Asíncrono (Capa 01).
* **Salida (Contrato):** Canales de transporte fiables, protocolos de aplicación (HTTP/3, gRPC), tiempo físico acotado y máquinas de estado replicadas por consenso distribuido.

### 5. Exclusiones Estratégicas
* ❌ Cero motores de bases de datos relacionales SQL (B+ Trees/WAL) ni modelos de datos (Capa 07).
* ❌ Cero primitivas criptográficas teóricas aisladas (Capa 08).

---

## 🟢 CAPA 07: Motores de Almacenamiento, Persistencia y Procesamiento Masivo

### 1. Naturaleza Ontológica de la Capa
La **persistencia, indexación, procesamiento transaccional, analítico yLakehouse de datos masivos** a escala local y distribuida.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 07 si y solo si es una técnica de almacenamiento en disco/RAM (SQL/NoSQL/Vectorial/Grafos), un protocolo de transacciones ACID, un sistema de archivos distribuido, un formato de tabla Lakehouse o un motor de procesamiento batch/streaming sobre datos persistidos.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de almacenamiento e indexación eficiente en disco/búferes (B+ Trees, LSM-Trees, Index-Free Adjacency).
* Problemas de garantías ACID y control de concurrencia transaccional (2PL, MVCC, ARIES WAL).
* Problemas de particionamiento, fragmentación (*Sharding*) y replicación masiva de datos en clústeres.
* Problemas de transaccionalidad ACID y viajes en el tiempo sobre almacenamiento de objetos (Delta Lake, Iceberg).
* Problemas de procesamiento batch distribuido sobre grandes volúmenes de datos (Spark/MapReduce).
* Problemas de consulta, ranking e indexación vectorial de alta dimensión (Inverted Index, HNSW).
* Problemas de procesamiento analítico columnar (OLAP/Parquet) y computación sobre flujos continuos (Kafka/Flink).

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** VFS local (Capa 04) y Sockets/Consenso Distribuido (Capa 06).
* **Salida (Contrato):** Motores SQL/NoSQL transaccionales, almacenes de grafos, Data Lakehouses, buscadores vectoriales y pipelines de analítica en tiempo real.

### 5. Exclusiones Estratégicas
* ❌ Cero patrones de arquitectura de software para aplicaciones (Clean Arch, Microservicios).
* ❌ Cero algoritmos de entrenamiento de Inteligencia Artificial (Capa 10).

---

## 🟢 CAPA 08: Ingeniería Criptográfica, Análisis de Vulnerabilidades y Defensa

### 1. Naturaleza Ontológica de la Capa
La **protección, prueba, análisis defensivo/ofensivo, inmutabilidad y neutralización de vectores de ataque** en sistemas de información frente a adversarios activos.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 08 si y solo si es una primitiva/protocolo criptográfico, una prueba de cero conocimiento, una técnica de explotación/mitigación de corrupción de memoria binaria, un método de ingeniería inversa, un mecanismo de seguridad perimetral, un sistema de identidad o una técnica de seguridad web.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de confidencialidad, integridad y autenticidad en canales no seguros (AES-GCM, ECC, TLS 1.3).
* Problemas de demostración computacional de veracidad sin revelar datos (Pruebas de Cero Conocimiento - ZKP/SNARKs).
* Problemas de detección y explotación de fallos de memoria en binarios (Buffer Overflows, ROP, Heap corruption).
* Problemas de análisis de binarios ejecutables sin código fuente (Desensamblado, Reversa Ghidra, Ejecución simbólica).
* Problemas de inspección de tráfico y protección perimetral (Firewalls DPI, WireGuard, Zero Trust).
* Problemas de autenticación y federación de identidad de grano fino (OAuth2, OIDC, FIDO2/WebAuthn, IAM).
* Problemas de explotación y mitigación de vulnerabilidades de aplicación web (XSS, CSRF, SSRF, SQLi, SOP, CORS, CSP).

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** Ensamblador (Capa 00), Memoria C (Capa 01), Binarios `ELF` (Capa 05), Kernels (Capa 04), Redes (Capa 06) y Datos (Capa 07).
* **Salida (Contrato):** Canales seguros TLS, binarios auditados sin corrupción de memoria, cortafuegos DPI, sistemas de identidad federada y aplicaciones web blindadas defensivamente.

### 5. Exclusiones Estratégicas
* ❌ Cero demostraciones matemáticas de pizarra aisladas sin código o aplicación.
* ❌ Cero políticas administrativas o auditorías legales no computacionales (GDPR/ISO).

---

## 🟢 CAPA 09: Arquitectura de Software, Motores de Plataforma y Orquestación

### 1. Naturaleza Ontológica de la Capa
La **síntesis, desacoplamiento, prueba, despliegue, orquestación, observabilidad y operación de plataformas de software complejas** a escala industrial.

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 09 si y solo si es un patrón de arquitectura de aplicaciones (Clean/DDD/CQRS), un motor de layout/UI, un principio de interacción HCI, una metodología de prueba basada en propiedades, un pipeline CI/CD GitOps, una malla de microservicios, un orquestador declarativo de clústeres o un motor de telemetría distribuida.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de estructuración y desacoplamiento de grandes código-bases (Clean Architecture, DDD, CQRS, Event Sourcing).
* Problemas de cálculo de geometría, layout y composición gráfica de interfaces de usuario (Render Trees, Flexbox).
* Problemas de diseño ergonómico de interfaces e interacción sin carga cognitiva (Modelo GOMS, Fitts).
* Problemas de verificación e invariantes de software mediante pruebas basadas en propiedades (Property-Based Testing/QuickCheck).
* Problemas de automatización de cadenas de entrega y despliegue sin caída (CI/CD, GitOps, *Expand-Contract Pattern*).
* Problemas de comunicación, resiliencia e inyección de caos entre microservicios (Service Mesh, Sidecars Envoy, mTLS).
* Problemas de orquestación declarativa de estado deseado en clústeres de contenedores (Kubernetes Operators, Schedulers).
* Problemas de recolección, correlación e indexación de métricas, trazas y logs a escala (OpenTelemetry, W3C Trace Context, TSDB).

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** Bases de Datos (Capa 07), Seguridad/IAM (Capa 08), Redes (Capa 06) y Contenedores (Capa 04).
* **Salida (Contrato):** Plataformas de software desacopladas, motores de interfaz gráfica, pipelines CI/CD, infraestructura orquestada en clústeres elásticos y motores de observabilidad distribuida.

### 5. Exclusiones Estratégicas
* ❌ Cero renderizado gráfico 3D avanzado, Shaders o Ray Tracing (Capa 10).
* ❌ Cero diseño estético o artístico de colores/interfaces.

---

## 🟢 CAPA 10: Especializaciones Computacionales Aplicadas de Vanguardia

### 1. Naturaleza Ontológica de la Capa
La **aplicación computacional avanzada de frontera** sobre dominios específicos (Inteligencia Artificial, Renderizado 3D, Robótica, Supercomputación, Cómputo Cuántico, Genómica Computacional y Difusión Generativa).

### 2. Regla Generativa de Pertenencia
> *Un concepto $X$ pertenece a la Capa 10 si y solo si es un modelo/mecanismo de aprendizaje automático/redes neuronales, un motor de autograd/MLOps, un pipeline de renderizado gráfico 3D/visión, un servidor de inferencia de LLMs, un algoritmo de procesamiento de audio, un sistema de navegación robótica/SLAM, una técnica de supercomputación HPC, un modelo de circuito de computación cuántica, un algoritmo de genómica computacional o una arquitectura de difusión latente generativa.*

### 3. Arquetipos de Problemas que Resuelve
* Problemas de aprendizaje de representaciones complejas a partir de datos (Redes Neuronales, Transformers, Autograd Triton/FSDP).
* Problemas de automatización del ciclo de vida de modelos en producción (MLOps, Feature Stores, Data Drift).
* Problemas de inferencia masiva y servido optimizado de modelos de lenguaje (LLMs, vLLM, PagedAttention, KV-Cache, RAG).
* Problemas de simulación y renderizado fotorrealista 3D en tiempo real (Rasterización, Shaders, Ray Tracing, Engine ECS).
* Problemas de percepción visual, auditiva y procesamiento de formas de onda (Vision YOLO/U-Net, Audio espectral).
* Problemas de localización, mapeo y planificación espacial de agentes móviles (SLAM, Cinemática, EKF).
* Problemas de optimización de toma de decisiones autónomas por recompensa (Reinforcement Learning / PPO / RLHF).
* Problemas de computación masiva distribuida a escala Petaflop (HPC / MPI / OpenMP).
* Problemas de procesamiento sobre información en superposición/entrelazamiento (Circuitos Cuánticos, Grover/Shor).
* Problemas de alineamiento de secuencias genómicas e inferencia 3D de macromoléculas (Needleman-Wunsch, BLAST, AlphaFold).
* Problemas de generación sintética multimodal mediante procesos estocásticos de difusión (Score-Based SDEs, Latent Diffusion, DiT).

### 4. Contrato de Entrada y Salida
* **Entrada (Caja Negra):** Todo el stack de sistemas, plataformas, algoritmos, arquitectura e infraestructura previa (Capas 00 a 09).
* **Salida (Contrato):** Modelos de IA entrenados/servidos, motores gráficos 3D, agentes robóticos autónomos, algoritmos cuánticos/HPC ejecutables, ensambladores genómicos y generadores de difusión latente.

### 5. Exclusiones Estratégicas
* ❌ Cero física cuántica experimental de laboratorio (láseres, trampas de iones).
* ❌ Cero biología de laboratorio húmedo o química analítica.
* ❌ Cero diseño de piezas mecánicas o hidráulicas de robots.

---

# 📊 TABLA RESUMEN DE CRITERIOS DE CLASIFICACIÓN GENERATIVA

| Capa | Pregunta Clave de Pertenencia Generativa |
| :--- | :--- |
| **Capa 00** | ¿Es un circuito discreto, una ISA, una interfaz bare-metal o un control de potencia/reloj sin software previo? |
| **Capa 01** | ¿Es un paradigma de lenguaje, un tipo de datos, un allocator, un modelo de propiedad o un sistema de efectos en memoria? |
| **Capa 02** | ¿Es una estructura de datos (efímera o persistente) o un algoritmo caracterizado por su eficiencia Big-O o modelo I/O? |
| **Capa 03** | ¿Es un modelo autómata, una gramática, un analizador sintáctico, una SSA IR, un límite de decidibilidad o una clase de complejidad? |
| **Capa 04** | ¿Es un mecanismo del kernel para arbitrar, aislar, gestionar I/O o aplicar sandboxing/syscalls en un solo nodo? |
| **Capa 05** | ¿Es un ejecutable `ELF`, un enlazador, un motor de bytecode, un compilador JIT, un GC o un optimizador de Clases Ocultas? |
| **Capa 06** | ¿Es un protocolo de red, una capa de comunicación multi-nodo, una sincronización de tiempo físico o un algoritmo de consenso? |
| **Capa 07** | ¿Es un motor de almacenamiento (SQL/NoSQL/Grafos), un protocolo ACID, un Data Lakehouse o un pipeline de analítica masiva? |
| **Capa 08** | ¿Es una primitiva criptográfica, una vulnerabilidad binaria/web, una técnica de reversa, un cortafuegos DPI o un IAM? |
| **Capa 09** | ¿Es un patrón de arquitectura de aplicaciones, un motor de layout, una prueba de propiedades, un pipeline CI/CD, K8s o una telemetría TSDB? |
| **Capa 10** | ¿Es un modelo de IA/Autograd, un renderizador 3D, un algoritmo SLAM, un circuito cuántico, un alineador genómico o un modelo de difusión? |
