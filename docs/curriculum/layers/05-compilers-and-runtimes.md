# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 05

La Capa 05 establece el ensamblador binario nativo para el sistema operativo y la ejecución administrada mediante entornos de bytecode, interpretación dinámica y optimización de runtimes. Su dominio abarca la optimización de código intermedio SSA IR, la asignación de registros físicos, la generación de código objeto, el enlazado estático y dinámico de formatos binarios ejecutables (`ELF`/`PE`), la automatización determinista de cadenas de montaje (*toolchains*), la arquitectura de máquinas virtuales de bytecode, los motores de compilación Just-In-Time (JIT), los recolectores de basura automáticos concurrentes, la optimización dinámica de lenguajes mediante Clases Ocultas e *Inline Caches*, y la ejecución aislada en sandbox a velocidad casi nativa mediante WebAssembly.

---

## 🟢 CAPA 05: Compiler Backends, Executable Formats & Managed Runtimes
*(Ruta en sistema de archivos: `content/05-compilers-and-runtimes/`)*

---

### 01. `code-generation-backends` — Code Generation Backends

* **Assumed Prerequisites:** Representación Intermedia SSA IR y análisis de flujo de control de `03: 06. intermediate-representation-design` y sintaxis de ensamblador de `00: 06. assembly-language-mechanics`.
* **Course Boundary:** Comienza en la toma del código intermedio SSA IR optimizado de la Capa 03 y termina en la emisión de código objeto no enlazado `.o` con asignación de registros físicos.
* **Explicit Exclusions:** ❌ SIN máquinas virtuales ni intérpretes de bytecode, ❌ SIN resolución de símbolos entre múltiples archivos (Linker).
* **Problema Disparador:** El código intermedio (SSA IR) no se ejecuta eficientemente en la CPU real. ¿Cómo aplicamos pases de optimización agresivos y asignamos los registros limitados de la CPU de forma óptima?
* **Dominio Técnico Comprehendido:** Optimizaciones sobre IR en forma SSA (Inlining, Loop Unrolling, Dead Code Elimination, Constant Propagation), selección de instrucciones de arquitectura, programación de instrucciones (*Instruction Scheduling*), asignación de registros físicos por coloreado de grafos de interferencia y emisión de código objeto ensamblado para la ISA objetivo.
* **Artefacto / Modelo Mental Entregable:** Un asignador de registros por coloreado de grafos de interferencia y un emisor de código objeto no enlazado `.o` para la ISA objetivo.
* **Frontera de Entrada:** Comienza en la toma de la IR SSA optimizada de la Capa 03.
* **Frontera de Salida:** Termina en la emisión de código objeto no enlazado `.o`.
* **Dependencias Directas:** `00: 06. assembly-language-mechanics`, `03: 06. intermediate-representation-design`.

---

### 02. `binary-linking-mechanics` — Binary Linking Mechanics

* **Assumed Prerequisites:** Memoria virtual `mmap` del SO de `04: 03. virtual-memory-systems` y archivos objeto `.o` de `01. code-generation-backends`.
* **Course Boundary:** Comienza en los archivos objeto emitidos por el compilador y termina en la imagen de memoria ejecutable estructurada bajo formato `ELF`/`PE` lista para la carga del Kernel.
* **Explicit Exclusions:** ❌ SIN parsing sintáctico de código fuente (Capa 03).
* **Problema Disparador:** Los archivos objeto `.o` tienen referencias a funciones no resueltas. ¿Cómo unificamos múltiples objetos en un ejecutable `ELF` que el Kernel pueda cargar en memoria virtual e invocar bibliotecas dinámicas?
* **Dominio Técnico Comprehendido:** Transformación de archivos objeto `.o` en binarios ejecutables, formatos `ELF`, `PE` y `Mach-O`, resolución de símbolos, relocalización de memoria, enlazado estático vs dinámico (`.so` / `.dll`), cargador del kernel (`ld.so`), carga perezosa de símbolos, tablas GOT/PLT e Interfaz de Funciones Foráneas (FFI) a nivel de C-ABI.
* **Artefacto / Modelo Mental Entregable:** Un enlazador (*Linker*) estático funcional que combina archivos `.o` resolviendo tablas de símbolos, relocalizaciones y tablas GOT/PLT.
* **Frontera de Entrada:** Comienza en los archivos objeto emitidos por el compilador.
* **Frontera de Salida:** Termina en la imagen de memoria lista para ser ejecutada por el Kernel.
* **Dependencias Directas:** `04: 03. virtual-memory-systems`, `01. code-generation-backends`.

---

### 03. `build-system-automation` — Build System Automation

* **Assumed Prerequisites:** Archivos objeto `.o` de `01. code-generation-backends` y enlazado binario de `02. binary-linking-mechanics`.
* **Course Boundary:** Comienza en la gestión de proyectos compuestos por múltiples archivos objeto y termina en la automatización determinista de la compilación e hiper-optimización de proyectos nativos.
* **Explicit Exclusions:** ❌ SIN pipelines de despliegue en la nube (CI/CD, Capa 09).
* **Problema Disparador:** Compilar manualmente decenas de miles de archivos de código fuente uno a uno es ineficiente y no ejecutable. ¿Cómo automatizamos el grafo de dependencias de compilación deterministamente?
* **Dominio Técnico Comprehendido:** Ingeniería de cadenas de montaje (*Toolchains*), grafos de dependencias de compilación (`Make`, `CMake`), compilación cruzada (*Cross-Compilation*), gestores de paquetes nativos (`Cargo`) y reproducción determinista de binarios.
* **Artefacto / Modelo Mental Entregable:** Un sistema de construcción determinista basado en grafos acíclicos de dependencias para proyectos de código nativo.
* **Frontera de Entrada:** Comienza en la gestión de proyectos compuestos por múltiples archivos objeto.
* **Frontera de Salida:** Termina en la automatización determinista de la compilación e hiper-optimización de proyectos nativos.
* **Dependencias Directas:** `01. code-generation-backends`, `02. binary-linking-mechanics`.

---

### 04. `bytecode-virtual-machines` — Bytecode Virtual Machines

* **Assumed Prerequisites:** Carga de binarios y FFI de `02. binary-linking-mechanics` y asignación de memoria virtual `mmap`/`mprotect` de `04: 03. virtual-memory-systems`.
* **Course Boundary:** Comienza en la lectura de bytecode de usuario y termina en la compilación nativa dinámica JIT en memoria con inserción de puntos de parada segura (*Safepoints*).
* **Explicit Exclusions:** ❌ SIN recolección de basura de memoria (tratada en `05`).
* **Problema Disparador:** Compilar binarios nativos para cada arquitectura de procesador limita la portabilidad. ¿Cómo ejecutamos bytecode portátil e hiper-optimizamos el código caliente mediante compilación JIT conectándonos a bibliotecas nativas vía FFI?
* **Dominio Técnico Comprehendido:** Ejecución de código gestionado, arquitecturas basadas en pila vs registros, diseño de bytecode, intérpretes de bucle despachador, compilación Just-In-Time (JIT), desoptimización, On-Stack Replacement (OSR), inserción de Safepoints y tablas de mapa de pila (*Stack Maps / OopMaps*), e Interfaz de Funciones Foráneas (FFI) para llamadas a C-ABI nativo.
* **Artefacto / Modelo Mental Entregable:** Una Máquina Virtual de Bytecode con motor de interpretación, compilador JIT con OSR e integración FFI para llamadas nativas C-ABI.
* **Frontera de Entrada:** Comienza en la lectura del Bytecode de usuario.
* **Frontera de Salida:** Termina en la compilación nativa dinámica en memoria durante la ejecución usando `mmap`/`mprotect` del SO e inserción de Safepoints.
* **Dependencias Directas:** `04: 03. virtual-memory-systems`, `02. binary-linking-mechanics`.

---

### 05. `garbage-collection-mechanics` — Garbage Collection Mechanics

* **Assumed Prerequisites:** Asignadores de memoria de `01: 03. heap-memory-allocators` y Safepoints/Stack Maps de `04. bytecode-virtual-machines`.
* **Course Boundary:** Comienza en la asignación de objetos en la memoria gestionada del runtime y termina en la recolección automática concurrente libre de pausas sin corrupción de punteros.
* **Explicit Exclusions:** ❌ SIN paginación por hardware (Kernel/MMU).
* **Problema Disparador:** La gestión manual de memoria (`free`/`delete`) produce errores graves de corrupción. ¿Cómo rastreamos e identificamos automáticamente la memoria inalcanzable mediante mapas de pila (*Stack Maps*) sin detener la ejecución de la aplicación?
* **Dominio Técnico Comprehendido:** Gestión automática de memoria en runtimes, conteo de referencias (manejo de ciclos), recolectores rastreadores (*Tracing GC*), algoritmo Mark-and-Sweep, recolectores de copia, GC Generacional (Nursery/Tenured), barreras de escritura (*Write Barriers* para rastreo Tenured-to-Nursery), inspección de raíces mediante Stack Maps (OopMaps) en Safepoints y recolectores concurrentes de baja latencia.
* **Artefacto / Modelo Mental Entregable:** Un Recolector de Basura Generacional y concurrente (*Mark-and-Sweep*) integrado en una memoria gestionada apoyado en Write Barriers y Stack Maps.
* **Frontera de Entrada:** Comienza en la asignación de objetos en la memoria del runtime gestionado.
* **Frontera de Salida:** Termina en la recolección concurrente sin pausas de ejecución perceptible.
* **Dependencias Directas:** `01: 03. heap-memory-allocators`, `04. bytecode-virtual-machines`.

---

### 06. `webassembly-runtime-engines` — WebAssembly Runtime Engines

* **Assumed Prerequisites:** Bytecode VMs y JIT de `04. bytecode-virtual-machines`.
* **Course Boundary:** Comienza en el Bytecode JavaScript/WASM descargado y termina en la ejecución en sandbox aislado a velocidad nativa con optimización JIT.
* **Explicit Exclusions:** ❌ SIN protocolos de red HTTP (Capa 06), ❌ SIN cálculo de layout GUI, DOM Tree, Flexbox o renderizado GPU de ventanas (Capa 09).
* **Problema Disparador:** Ejecutar código arbitrario descargado de internet requiere aislamiento absoluto y velocidad casi nativa. ¿Cómo funciona la compilación JIT multinivel de JavaScript y el aislamiento de memoria en WebAssembly?
* **Dominio Técnico Comprehendido:** Arquitectura interna del motor JavaScript V8, intérprete de bytecode (Ignition), compilador JIT especulativo (TurboFan), desoptimización por violación de tipos, especificación de bytecode ejecutable WebAssembly (WASM), modelo de memoria lineal contigua de WASM, páginas guard de aislamiento y sandbox.
* **Artefacto / Modelo Mental Entregable:** Un entorno de ejecución de Bytecode WebAssembly (WASM) en un sandbox aislado con compilación JIT y memoria lineal contigua.
* **Frontera de Entrada:** Comienza en el Bytecode JavaScript/WASM descargado.
* **Frontera de Salida:** Termina en la ejecución aislada en sandbox de binarios WASM a velocidad casi nativa.
* **Dependencias Directas:** `04. bytecode-virtual-machines`.

---

### 07. `dynamic-language-runtimes` — Dynamic Language Runtimes

* **Assumed Prerequisites:** Tablas VTable de `01: 05. object-oriented-software-design` y Bytecode/JIT de `04. bytecode-virtual-machines`.
* **Course Boundary:** Comienza en la ineficiencia de la resolución de tipos en tiempo de ejecución para lenguajes dinámicos y termina en la optimización especulativa mediante estructuras internas, *Inline Caches* y desoptimización.
* **Explicit Exclusions:** ❌ SIN parsing de código fuente (Capa 03).
* **Problema Disparador:** En lenguajes dinámicos (JavaScript, Python), el tipo de un objeto puede cambiar en cualquier momento, haciendo que buscar propiedades requiera exploraciones lentas de diccionarios. ¿Cómo ejecutamos lenguajes dinámicos a velocidad casi nativa?
* **Dominio Técnico Comprehendido:** Representación de objetos dinámicos en memoria, Formas/Clases Ocultas (*Shapes / Hidden Classes / Map Transitions* en V8), Resolución de Propiedades (*Property Access*), Cachés en Línea (*Inline Caches - ICs*), estados de IC (Monomórfico, Polimórfico, Megamórfico), Compilación JIT Especulativa basada en tipos observados y Guardianes de Desoptimización (*Bailout / Deoptimization Checks*).
* **Artefacto / Modelo Mental Entregable:** Un motor de objetos dinámicos con soporte para *Hidden Classes*, transiciones de forma y *Inline Caches* monomórficos/polimórficos.
* **Frontera de Entrada:** Comienza en el sobrecoste del acceso a propiedades en diccionarios dinámicos.
* **Frontera de Salida:** Termina en la ejecución especulativa y optimizada de código dinámico.
* **Dependencias Directas:** `01: 05. object-oriented-software-design`, `04. bytecode-virtual-machines`.