# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 01

La Capa 01 establece la abstracción del software ejecutable sobre el procesador, abstrayendo la manipulación directa de registros de ensamblador en favor de lenguajes estructurados, mecanismos de gestión de memoria direccionable y paradigmas de computación. Su dominio abarca desde la mutación imperativa de variables en la pila y la representación binaria exacta de tipos en memoria, hasta la asignación dinámica en el Heap, la gestión determinista de recursos, los modelos de seguridad de memoria por propiedad, la Orientación a Objetos, el Diseño Orientado a Datos y los paradigmas de programación (Funcional, Lógico, Concurrente, Asíncrono, Metaprogramación y Manejadores de Efectos Algebraicos). Toda llamada directa a servicios del Kernel o paginación por hardware se asume totalmente abstraída por las capas contiguas.

---

## 🟢 CAPA 01: Programming Paradigms, Memory Mechanics & Execution
*(Ruta en sistema de archivos: `content/01-programming-paradigms/`)*

---

### 01. `imperative-programming-foundations` — Imperative Programming Foundations

* **Assumed Prerequisites:** Instrucciones de ensamblador, registros del procesador y direcciones de memoria direccionables de `00: 06. assembly-language-mechanics`.
* **Course Boundary:** Comienza en la sustitución del ensamblador por sintaxis imperativa de alto nivel y termina en la gestión del estado de memoria en pila, paso de parámetros y operaciones binarias a nivel de bit.
* **Explicit Exclusions:** ❌ SIN asignadores manuales de Heap complejos (`malloc` internals), ❌ SIN Orientación a Objetos, ❌ SIN estructuras de datos compuestas (árboles/grafos).
* **Problema Disparador:** ¿Cómo construimos algoritmos expresivos mutando el estado de la memoria de forma estructurada sin tener que lidiar con registros de ensamblador a mano?
* **Dominio Técnico Comprehendido:** Mutación de estado, variables, tipos de datos primitivos, operaciones a nivel de bit (máscaras, desplazamientos `<<`/`>>`, `AND`, `OR`, `XOR`, `NOT`), estructuras de control (condicionales, bucles), funciones, alcance (*scope*), paso de parámetros por valor y por referencia, punteros, direcciones de memoria abstracta y disposición de estructuras en memoria (*Struct Padding* y Alineamiento).
* **Artefacto / Modelo Mental Entregable:** Un modelo mental del estado de la memoria en pila durante la ejecución recursiva de funciones con manipulación de punteros y máscaras de bits.
* **Frontera de Entrada:** Comienza en la abstracción de una secuencia de instrucciones C-like que modifican un estado de memoria.
* **Frontera de Salida:** Termina en la gestión básica de referencias de memoria en la pila, alineamiento de estructuras y operaciones binarias.
* **Dependencias Directas:** `00: 06. assembly-language-mechanics`.

---

### 02. `binary-data-representations` — Binary Data Representations

* **Assumed Prerequisites:** Punteros, tipos primitivos y operaciones a nivel de bit de `01. imperative-programming-foundations`.
* **Course Boundary:** Comienza en la necesidad de estructurar arrays de bytes para tipos escalares y compuestos en memoria de software y termina en la decodificación exacta de streams UTF-8 y el análisis binario de coma flotante IEEE 754.
* **Explicit Exclusions:** ❌ SIN aritmética entera de hardware (tratada en Capa 00), ❌ SIN algoritmos de parsing sintáctico de texto (Capa 03), ❌ SIN asignación dinámica en Heap.
* **Problema Disparador:** La memoria de software solo almacena bytes ($0-255$). ¿Cómo maquetamos números reales y texto internacional en arrays de bytes sin perder precisión por sesgos de arquitectura o romper el código ante caracteres multibyte?
* **Dominio Técnico Comprehendido:** Disposición binaria de datos en software, orden de bytes (*Endianness*: Big/Little Endian), representación de coma fija por software, Coma Flotante IEEE 754 (signo, exponente, mantisa, denormales, NaNs, infinidades, pérdida de precisión en operaciones) y codificación de texto (ASCII, Unicode Code Points, codificaciones de longitud variable UTF-8 / UTF-16, validación de límites de secuencias de bytes).
* **Artefacto / Modelo Mental Entregable:** Un decodificador manual en C de streams de bytes UTF-8 y un analizador del formato flotante IEEE 754 mediante máscaras de bits y alineamiento de bytes.
* **Frontera de Entrada:** Comienza en la necesidad de maquetar texto y números reales en arrays contiguos de bytes en memoria.
* **Frontera de Salida:** Termina en la manipulación binaria exacta, ordenación de bytes y validación de streams UTF-8 y valores flotantes por software.
* **Dependencias Directas:** `01. imperative-programming-foundations`.

---

### 03. `heap-memory-allocators` — Heap Memory Allocators

* **Assumed Prerequisites:** Punteros, alineamiento de estructuras y direcciones de memoria de `01. imperative-programming-foundations`.
* **Course Boundary:** Comienza en la solicitud de bloques de memoria de tamaño dinámico en el Heap y termina en el diseño e implementación de asignadores de memoria de alto rendimiento en espacio de usuario.
* **Explicit Exclusions:** ❌ SIN recolectores de basura automáticos rastreadores (Tracing GC, Capa 05), ❌ SIN paginación por hardware o llamadas de kernel (Capa 04).
* **Problema Disparador:** El tamaño de los datos en tiempo de ejecución es dinámico y solicitar memoria ilimitada fragmenta el espacio direccionable. ¿Cómo diseñamos asignadores de memoria en espacio de usuario que minimicen la latencia y la fragmentación?
* **Dominio Técnico Comprehendido:** Gestión explícita de memoria en el Heap, la API de asignación (`malloc`, `free`, `realloc`), alineamiento de bloques, fragmentación interna vs externa, estrategias de búsqueda de bloques (*First Fit, Best Fit*), asignadores por listas libres (*Free Lists*), asignadores Buddy (*Buddy Allocators*), asignadores de tamaño fijo (*Slab Allocators*) y asignadores de arena de alta velocidad (*Arena Allocators*).
* **Artefacto / Modelo Mental Entregable:** Un asignador de memoria funcional en espacio de usuario (*Arena/Slab Allocator*) con control de alineamiento y reutilización de bloques.
* **Frontera de Entrada:** Comienza en la solicitud de bloques contiguos de memoria de tamaño variable en el Heap.
* **Frontera de Salida:** Termina en la entrega de un motor de asignación dinámica de memoria optimizado y reutilizable.
* **Dependencias Directas:** `01. imperative-programming-foundations`.

---

### 04. `memory-ownership-semantics` — Memory Ownership Semantics

* **Assumed Prerequisites:** Punteros y referencias de `01. imperative-programming-foundations` y asignadores Heap de `03. heap-memory-allocators`.
* **Course Boundary:** Comienza en las corrupciones de memoria producidas por la liberación manual (`use-after-free`, `double-free`) y termina en la gestión determinista de recursos mediante semántica de propiedad, préstamos y tiempos de vida en tiempo de compilación.
* **Explicit Exclusions:** ❌ SIN recolectores de basura en tiempo de ejecución (GC, Capa 05).
* **Problema Disparador:** Liberar memoria manualmente con `free` produce corrupciones y fugas invisibles. ¿Cómo garantizamos la seguridad de memoria sin pagar el costo de rendimiento de un recolector de basura en tiempo de ejecución?
* **Dominio Técnico Comprehendido:** Patrón de gestión determinista RAII (*Resource Acquisition Is Initialization*), destructores automáticos por ámbito, punteros inteligentes (*Unique/Shared Pointers*), semántica de movimiento (*Move semantics*), semántica de copia vs movimiento, modelo de propiedad (*Ownership*), transferencia de propiedad, préstamos mutables e inmutables (*Borrowing*) y tiempos de vida de referencias (*Lifetimes*).
* **Artefacto / Modelo Mental Entregable:** Un contenedor RAII desacoplado que implementa semántica de movimiento estricta, propiedad única y verificación de préstamos para prevenir fugas de recursos.
* **Frontera de Entrada:** Comienza en la necesidad de asociar el ciclo de vida de los recursos del Heap al ámbito de las variables.
* **Frontera de Salida:** Termina en la gestión de memoria Heap 100% libre de fugas y corrupciones mediante semántica de propiedad determinista.
* **Dependencias Directas:** `01. imperative-programming-foundations`, `03. heap-memory-allocators`.

---

### 05. `object-oriented-software-design` — Object-Oriented Software Design

* **Assumed Prerequisites:** Funciones, punteros y estructuras de datos de `01. imperative-programming-foundations`.
* **Course Boundary:** Comienza en la unificación de datos y funciones en clases y termina en arquitecturas orientadas a objetos desacopladas con manejo de excepciones y polimorfismo dinámico.
* **Explicit Exclusions:** ❌ SIN concurrencia multihilo, ❌ SIN acceso a bases de datos.
* **Problema Disparador:** A medida que el software crece, las funciones y datos aislados generan alto acoplamiento. ¿Cómo unificamos estado y comportamiento mediante abstracciones reutilizables, polimórficas y con propagación estructurada de errores?
* **Dominio Técnico Comprehendido:** Encapsulamiento, abstracción, clases e instancias, herencia vs composición, polimorfismo dinámico de subtipado (tablas VTable), interfaces, principios SOLID, patrones de diseño (creacionales, estructurales, de comportamiento) y modelo de propagación de errores mediante Excepciones (*Try/Catch/Throw*, desempaquetado de pila / *stack unwinding*).
* **Artefacto / Modelo Mental Entregable:** Un diseño de software orientado a objetos desacoplado apoyado en jerarquías de interfaces, tablas VTable y flujo de excepciones.
* **Frontera de Entrada:** Comienza en la unificación de datos y funciones aisladas en estructuras con estado y comportamiento.
* **Frontera de Salida:** Termina en arquitecturas de software orientadas a objetos desacopladas y mantenibles.
* **Dependencias Directas:** `01. imperative-programming-foundations`.

---

### 06. `data-oriented-design` — Data-Oriented Design

* **Assumed Prerequisites:** Structs y alineamiento de `01. imperative-programming-foundations` y tablas VTable de `05. object-oriented-software-design`.
* **Course Boundary:** Comienza en la ineficiencia del acceso disperso a memoria producido por jerarquías de objetos y tablas VTable y termina en la reestructuración de software optimizada para las líneas de caché de la CPU.
* **Explicit Exclusions:** ❌ SIN frameworks de motores de juegos completos (Capa 10).
* **Problema Disparador:** La Orientación a Objetos agrupa datos heterogéneos por entidad (AoS), provocando saltos de puntero y fallos de caché continuos al procesar colecciones masivas. ¿Cómo reorganizamos los datos para maximizar la localización espacial de la CPU?
* **Dominio Técnico Comprehendido:** Paradigma Orientado a Datos (DOD), la jerarquía de memoria desde la perspectiva de las estructuras de código, la línea de caché y el *prefetcher*, disposición Array de Estructuras (AoS) vs Estructura de Arrays (SoA), alineamiento y empaquetado para evitar *false sharing*, transformación de jerarquías de objetos en layouts continuos y optimización de procesamiento por lotes contiguos.
* **Artefacto / Modelo Mental Entregable:** Una reestructuración completa de un dominio orientado a objetos (AoS) hacia un formato orientado a datos (SoA) amigable con la caché, demostrando la reducción de fallos de memoria.
* **Frontera de Entrada:** Comienza en la discontinuidad de memoria provocada por el diseño orientado a objetos sobre colecciones de datos.
* **Frontera de Salida:** Termina en la maquetación contigua de datos en memoria optimizada para la lectura secuencial de la CPU.
* **Dependencias Directas:** `01. imperative-programming-foundations`, `05. object-oriented-software-design`.

---

### 07. `functional-programming-paradigm` — Functional Programming Paradigm

* **Assumed Prerequisites:** Funciones de orden superior y tipos primitivos de `01. imperative-programming-foundations`.
* **Course Boundary:** Comienza en la sustitución de la mutación de estado por transformaciones puras y termina en el manejo monádico de efectos secundarios, clausuras léxicas y tipos algebraicos.
* **Explicit Exclusions:** ❌ SIN bucles imperativos mutables, ❌ SIN variables globales mutables.
* **Problema Disparador:** La mutación global de estado produce efectos secundarios difíciles de razonar en programas complejos. ¿Cómo construimos software usando transformaciones matemáticas puras, inmutables, captura de entornos mediante clausuras léxicas y manejo explícito de errores sin excepciones impuras?
* **Dominio Técnico Comprehendido:** Inmutabilidad, funciones puras, transparencia referencial, funciones de orden superior, currificación, evaluación perezosa (*lazy evaluation*), clausuras léxicas (*Lexical Closures*), captura de entornos de variables, tipos de datos algebraicos (ADT), coincidencia de patrones (*pattern matching*), manejo monádico de errores y efectos (`Result`/`Option`, Mónadas).
* **Artefacto / Modelo Mental Entregable:** Pipeline de transformación de datos puramente funcional gestionado mediante clausuras léxicas, tipos algebraicos y combinadores monádicos `Result`/`Option`.
* **Frontera de Entrada:** Comienza en la sustitución de la mutación de estado por transformaciones funcionales matemáticas.
* **Frontera de Salida:** Termina en el manejo puramente funcional de E/S y efectos sin romper la transparencia referencial.
* **Dependencias Directas:** `01. imperative-programming-foundations`.

---

### 08. `declarative-logic-programming` — Declarative Logic Programming

* **Assumed Prerequisites:** Control de flujo y funciones de `01. imperative-programming-foundations`.
* **Course Boundary:** Comienza en la declaración de hechos y reglas lógicas y termina en la resolución de problemas combinatorios mediante motores de inferencia y restricciones.
* **Explicit Exclusions:** ❌ SIN resolutores SAT/SMT a nivel de compilador/verificación (Capa 03).
* **Problema Disparador:** En problemas de deducción o planificación, especificar *cómo* calcular la solución es extremadamente complejo. ¿Cómo declaramos las reglas de verdad y dejamos que el motor infiera la solución?
* **Dominio Técnico Comprehendido:** Programación declarativa en lógica de primer orden, unificación de términos, resolución SLD, motor con backtracking, Prolog, Datalog para consultas en grafos y Programación por Restricciones (CSP) expresada mediante relaciones lógicas.
* **Artefacto / Modelo Mental Entregable:** Un motor de inferencia lógica en Prolog para la resolución de un problema de satisfacción de restricciones (CSP).
* **Frontera de Entrada:** Comienza en la sustitución del "cómo calcular" por la declaración de relaciones de verdad.
* **Frontera de Salida:** Termina en la resolución de problemas de deducción lógica y satisfacción de restricciones complejas.
* **Dependencias Directas:** `01. imperative-programming-foundations`.

---

### 09. `concurrent-programming-mechanics` — Concurrent Programming Mechanics

* **Assumed Prerequisites:** Punteros, direcciones de memoria y funciones de `01. imperative-programming-foundations`.
* **Course Boundary:** Comienza en la ejecución paralela de hilos sobre memoria compartida y termina en el Modelo de Memoria del lenguaje y la sincronización atómica sin bloqueos (*lock-free*).
* **Explicit Exclusions:** ❌ SIN concurrencia asíncrona no bloqueante por eventos, ❌ SIN llamadas de planificación del Kernel de SO.
* **Problema Disparador:** Ejecutar múltiples hilos sobre una misma memoria compartida produce condiciones de carrera, inconsistencia de datos y reordenamiento de instrucciones por el compilador/CPU. ¿Cómo sincronizamos el acceso y ordenamos operaciones en memoria sin caer en bloqueos mutuos (*deadlocks*)?
* **Dominio Técnico Comprehendido:** Concurrencia en memoria compartida, hilos de ejecución (*threads*), condiciones de carrera, secciones críticas, exclusión mutua (mutexes), semáforos, variables de condición, deadlocks, Modelo de Memoria del Lenguaje (*Language Memory Model*: C++11/Rust Memory Ordering - `Relaxed`, `Acquire`/`Release`, `SeqCst`), relación *Happens-Before*, barreras/fences de memoria en código, operaciones atómicas y algoritmos sin bloqueos (*lock-free*).
* **Artefacto / Modelo Mental Entregable:** Una cola concurrente de mensajes sin cerrojos (*lock-free queue*) sincronizada mediante ordenamiento de memoria `Acquire`/`Release` y primitivas atómicas CAS (*Compare-And-Swap*).
* **Frontera de Entrada:** Comienza en la ejecución paralela de múltiples hilos sobre una misma memoria compartida.
* **Frontera de Salida:** Termina en estructuras de datos atómicas y sin cerrojos con garantías formales de ordenamiento de memoria.
* **Dependencias Directas:** `01. imperative-programming-foundations`.

---

### 10. `asynchronous-event-execution` — Asynchronous Event Execution

* **Assumed Prerequisites:** Hilos y modelos de concurrencia de `09. concurrent-programming-mechanics`.
* **Course Boundary:** Comienza en el modelo de ejecución no bloqueante y termina en el control de flujos asíncronos mediante Event Loop y corrutinas.
* **Explicit Exclusions:** ❌ SIN multiplexado de llamadas al sistema de kernel (`epoll`/`kqueue`/`io_uring`) (Capa 04).
* **Problema Disparador:** Bloquear un hilo entero esperando respuestas de entrada/salida lentas no escala a miles de clientes. ¿Cómo procesamos I/O de forma no bloqueante dirigida por eventos en un solo hilo?
* **Dominio Técnico Comprehendido:** Entrada/salida no bloqueante en espacio de usuario, bucle de eventos (*Event Loop*), arquitectura dirigida por eventos, promesas (*Promises/Futures*), corrutinas *stackless* (*async/await*), generadores y programación reactiva de flujos (*Reactive Streams*).
* **Artefacto / Modelo Mental Entregable:** Un motor de Event Loop asíncrono con soporte para corrutinas `async/await` y promesas.
* **Frontera de Entrada:** Comienza en la ineficiencia del bloqueo por hilo para I/O masiva.
* **Frontera de Salida:** Termina en la gestión de miles de conexiones concurrentes en un único hilo.
* **Dependencias Directas:** `09. concurrent-programming-mechanics`.

---

### 11. `metaprogramming-systems` — Metaprogramming Systems

* **Assumed Prerequisites:** Tipos de `01. imperative-programming-foundations`, Objetos de `05. object-oriented-software-design` y Tipos Algebraicos de `07. functional-programming-paradigm`.
* **Course Boundary:** Comienza en la inspección de tipos en tiempo de ejecución y termina en la expansión de macros sintácticas y metaprogramación en tiempo de compilación del propio lenguaje.
* **Explicit Exclusions:** ❌ SIN estructuras de datos de compilador como Árboles Sintácticos Abstractos (AST) o grafos CFG (Capa 03), ❌ SIN análisis gramatical formal (Lexer/Parser) ni pases de compilador SSA IR (Capa 03).
* **Problema Disparador:** Escribir código repetitivo e inspeccionar tipos manualmente en tiempo de ejecución resulta rígido. ¿Cómo hacemos que el código se inspeccione, modifique y genere a sí mismo dentro del sistema de tipos y tokens del lenguaje?
* **Dominio Técnico Comprehendido:** Inspección en tiempo de ejecución (reflexión), expansión de macros sintácticas y sustitución de tokens en tiempo de compilación, metaprogramación con plantillas/genéricos (polimorfismo paramétrico), anotaciones/decoradores y generación dinámica de código dentro de los límites del lenguaje.
* **Artefacto / Modelo Mental Entregable:** Un sistema de macros en tiempo de compilación que inspecciona tipos e inyecta código de serialización automáticamente sustituyendo tokens en la sintaxis del lenguaje.
* **Frontera de Entrada:** Comienza en la distinción entre código que procesa datos y código que procesa o genera código.
* **Frontera de Salida:** Termina en la creación de lenguajes de dominio específico (DSLs) internos y marcos autogenerados.
* **Dependencias Directas:** `01. imperative-programming-foundations`, `05. object-oriented-software-design`, `07. functional-programming-paradigm`.

---

### 12. `algebraic-effect-handlers` — Algebraic Effect Handlers

* **Assumed Prerequisites:** Funciones de orden superior y clausuras léxicas de `07. functional-programming-paradigm` y modelos asíncronos de `10. asynchronous-event-execution`.
* **Course Boundary:** Comienza en la captura explícita del estado de ejecución futuro de un programa y termina en la gestión de efectos secundarios desacoplados mediante Efectos Algebraicos y Manejadores (*Algebraic Effects & Handlers*).
* **Explicit Exclusions:** ❌ SIN llamadas de cambio de contexto del Kernel de SO (`context switch` de Capa 04).
* **Problema Disparador:** Los modelos de `async/await` y callbacks imponen estructuras de código rígidas que infectan las firmas de las funciones ("problema de la función de color"). ¿Cómo desacoplamos la *declaración de un efecto secundario* de su *ejecución*, capturando el resto de la computación como un valor de primera clase?
* **Dominio Técnico Comprehendido:** Continuaciones de primera clase, Estilo de Paso de Continuaciones (*Continuation-Passing Style - CPS*), Continuaciones Delimitadas (`shift`/`reset`), Corrutinas *stackful* vs *stackless*, Generadores, Sistemas de Efectos Algebraicos (*Algebraic Effects & Handlers*), e inversión de control de flujos de ejecución sin mutación de estado global.
* **Artefacto / Modelo Mental Entregable:** Un motor de Efectos Algebraicos en espacio de usuario capaz de manejar I/O, excepciones y estado mutable reanudando continuaciones delimitadas.
* **Frontera de Entrada:** Comienza en la necesidad de manipular el flujo de control sin alterar las estructuras del lenguaje.
* **Frontera de Salida:** Termina en la separación total entre la emisión de un efecto secundario y su estrategia de resolución.
* **Dependencias Directas:** `07. functional-programming-paradigm`, `10. asynchronous-event-execution`.