# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 00

La Capa 00 constituye el sustrato físico-discreto e indivisible sobre el cual se erige la totalidad de la computación. Su dominio abarca la transformación del axioma del bit ($0$ y $1$) y la conmutación de puertas lógicas en una arquitectura de hardware capaz de ejecutar instrucciones binarias en serie sobre memoria contigua, comunicarse con el entorno mediante registros físicos, administrar límites térmico-energéticos en el silicio y defenderse ante fugas microarquitectónicas. Toda consideración de electrónica analógica, voltajes y física de materiales se asume totalmente abstraída, mientras que las herramientas matemáticas necesarias (Álgebra de Boole, ecuaciones de tiempos de reloj, representación numérico-binaria) se absorben de forma estrictamente operacional dentro de la construcción del hardware digital.

---

## 🟢 CAPA 00: Digital Hardware Architecture & Bare-Metal Substrate
*(Ruta en sistema de archivos: `content/00-digital-hardware-foundations/`)*

---

### 01. `digital-logic-design` — Digital Logic Design

* **Assumed Prerequisites:** Axioma discreto del bit ($0$ y $1$) y comportamiento funcional de puertas lógicas básicas (`AND`, `OR`, `NOT`).
* **Course Boundary:** Comienza en la combinación de puertas lógicas discretas y termina en la construcción de una Unidad Aritmético-Lógica (ALU) binaria con representación en complemento a dos y una Máquina de Estados Finitos (FSM) de control secuencial.
* **Explicit Exclusions:** ❌ SIN electrónica analógica/voltajes, ❌ SIN lenguajes de descripción de hardware (Verilog/VHDL), ❌ SIN código de programación de alto nivel, ❌ SIN transistores ni voltajes; todo debe ser lógico; casi nada electrónico.
* **Problema Disparador:** ¿Cómo construimos circuitos capaces de realizar cálculos aritméticos, representar números enteros con signo y tomar decisiones lógicas binarias por hardware a partir de la conmutación discreta de estados $0$ y $1$?
* **Dominio Técnico Comprehendido:** Álgebra de Boole operacional, tablas de verdad, formas canónicas (SOP/POS), minimización por Mapas de Karnaugh, representación numérica en complemento a dos, aritmética binaria (sumadores, restadores, propagación de acarreo), banderas de estado ($Z, C, N, V$), lógica combinacional (MUXes, decodificadores, comparadores), lógica secuencial (latches, flip-flops D, contadores, registros), máquinas de estados finitos (FSM) cableadas y Unidad Aritmético-Lógica (ALU) elemental.
* **Artefacto / Modelo Mental Entregable:** Diseño e implementación esquemática de una ALU binaria de 8 bits con soporte para aritmética en complemento a dos acoplada a una FSM de control secuencial.
* **Frontera de Entrada:** Comienza en la abstracción discreta del bit ($0$ y $1$) y puertas lógicas funcionales (`AND`, `OR`, `NOT`).
* **Frontera de Salida:** Termina en la construcción de una ALU y FSM de control funcional en hardware con banderas de condición.
* **Dependencias Directas:** Ninguna (Nodo Raíz de Hardware).

---

### 02. `rtl-hardware-design` — RTL Hardware Design

* **Assumed Prerequisites:** Lógica combinacional, lógica secuencial, flip-flops D y FSMs de `01. digital-logic-design`.
* **Course Boundary:** Comienza en la descripción de circuitos mediante código de nivel de transferencia de registros (RTL) y termina en la simulación orientada a eventos con retardos físicos y síntesis a malla de puertas FPGA/ASIC.
* **Explicit Exclusions:** ❌ SIN física de semiconductores, ❌ SIN arquitecturas complejas de CPU.
* **Problema Disparador:** Diseñar circuitos dibujando esquemas a mano no escala para millones de puertas. Además, la interacción entre diferentes relojes produce metaestabilidad. ¿Cómo describimos, simulamos y sintetizamos hardware usando código fuente concurrente libre de fallos de tiempo?
* **Dominio Técnico Comprehendido:** Representación RTL de hardware en Verilog y SystemVerilog, cola de eventos de simulación, asignaciones bloqueantes (`=`) vs no-bloqueantes (`<=`), bloques procedimentales, metaestabilidad, violaciones de setup/hold, sincronizadores de 2 etapas, cruzamiento de dominios de reloj (*Clock Domain Crossing - CDC*), testbenches no sintetizables, aserciones SVA y síntesis lógica hacia FPGAs (LUTs/CLBs/BRAMs) y ASICs.
* **Artefacto / Modelo Mental Entregable:** Un modelo RTL sintetizable en SystemVerilog de un módulo con sincronizadores CDC verificado mediante un testbench orientado a eventos.
* **Frontera de Entrada:** Comienza en la traducción de circuitos booleanos esquemáticos a código de descripción concurrente RTL.
* **Frontera de Salida:** Termina en la simulación con retardos físicos (SDF) y la síntesis a malla de puertas.
* **Dependencias Directas:** `01. digital-logic-design`.

---

### 03. `cpu-microarchitecture` — CPU Microarchitecture

* **Assumed Prerequisites:** ALUs, registros binarios y multiplexores de `01. digital-logic-design`.
* **Course Boundary:** Comienza en la integración de la ALU y registros para formar el datapath escalar de una CPU y termina en procesadores superescalares fuera de orden con predicción de saltos.
* **Explicit Exclusions:** ❌ SIN sintaxis de ensamblador para programador de software, ❌ SIN controladores de memoria DRAM complejos, ❌ SIN código C/C++.
* **Problema Disparador:** Ejecutar una instrucción por ciclo limita el rendimiento del procesador. ¿Cómo organizamos el datapath de la CPU para solapar la ejecución de múltiples instrucciones por segundo resolviendo los cuellos de botella y riesgos de datos y control?
* **Dominio Técnico Comprehendido:** La máquina de Von Neumann, ciclo Fetch-Decode-Execute, datapath de ciclo único y multiciclo, unidad de control, datapath de Unidad de Coma Flotante (FPU) por hardware, segmentación (*pipelining*) de 5 etapas, resolución de hazards (estructurales, de datos y control), forwarding, stalls, predicción dinámica de saltos (Branch Target Buffer) y ejecución superescalar fuera de orden (Tomasulo / Reorder Buffer).
* **Artefacto / Modelo Mental Entregable:** El modelo mental y diagrama de bloques de un procesador superescalar segmentado de 5 etapas con FPU, unidad de forwarding y predicción dinámica de saltos.
* **Frontera de Entrada:** Comienza en la ALU y registros binarios para construir el datapath del procesador.
* **Frontera de Salida:** Termina en la microarquitectura de una CPU superescalar fuera de orden lista para conectarse a jerarquías de memoria.
* **Dependencias Directas:** `01. digital-logic-design`.

---

### 04. `memory-subsystems` — Memory Subsystems

* **Assumed Prerequisites:** Datapath de CPU y ciclos de bus de `03. cpu-microarchitecture`.
* **Course Boundary:** Comienza en el Muro de la Memoria y la diferencia de velocidad entre la CPU y la RAM y termina en la gestión física de controladores DRAM y topologías NUMA por hardware.
* **Explicit Exclusions:** ❌ SIN memoria virtual por software o paginación de kernel (van en OS), ❌ SIN asignadores de memoria C.
* **Problema Disparador:** La CPU es miles de veces más rápida que la memoria principal, creando un cuello de botella crítico. ¿Cómo diseñamos jerarquías de caché y controladores de memoria DRAM para maximizar la tasa de aciertos y la velocidad de transferencia física?
* **Dominio Técnico Comprehendido:** El Muro de la Memoria (*Memory Wall*), celdas SRAM de caché vs celdas DRAM con refresco de capacitores, jerarquías de caché (L1/L2/L3), mapeo de caché (directo, asociativo por conjuntos, totalmente asociativo), políticas de reemplazo y escritura, protocolos de coherencia de caché (MESI/MOESI), arquitectura interna de DRAM (bancos, rangos, filas, columnas, Row Buffers), latencias físicas (CAS/RAS, Precharge) y controladores de memoria con soporte NUMA.
* **Artefacto / Modelo Mental Entregable:** Un diagrama de arquitectura de un controlador de memoria DDR multi-canal acoplado a un sistema de caché asociativa por conjuntos con protocolo MESI.
* **Frontera de Entrada:** Comienza en las peticiones de lectura/escritura emitidas por el datapath de la CPU hacia la memoria.
* **Frontera de Salida:** Termina en la entrega determinista de bloques de memoria desde DRAM/Caché mediante controladores físicos.
* **Dependencias Directas:** `03. cpu-microarchitecture`.

---

### 05. `parallel-hardware-architectures` — Parallel Hardware Architectures

* **Assumed Prerequisites:** Pipelining y FPU de `03. cpu-microarchitecture` e interfaces de memoria de `04. memory-subsystems`.
* **Course Boundary:** Comienza en la ineficiencia de las CPUs de propósito general para cómputo masivamente paralelo y termina en la microarquitectura de procesadores SIMT (GPUs) y matrices sistólicas por hardware (TPUs/NPUs).
* **Explicit Exclusions:** ❌ SIN lenguajes de programación de GPU (CUDA/OpenCL van en Capa 10), ❌ SIN marcos de Deep Learning.
* **Problema Disparador:** Las CPUs tradicionales están optimizadas para latencia secuencial y fallan al procesar miles de operaciones matriciales simultáneas. ¿Cómo diseñamos silicio especializado para rendimiento masivamente paralelo por hardware?
* **Dominio Técnico Comprehendido:** Computación vectorial vs escalar, procesamiento SIMD de ancho fijo, arquitectura GPU y modelo de ejecución SIMT (*Single Instruction, Multiple Threads*), Shader Cores, planificación de Warps/Wavefronts, memoria compartida de alta velocidad (*Scratchpad SRAM*), Matrices Sistólicas (*Systolic Arrays*) por hardware para multiplicación matricial, Tensor Cores y procesadores de dominio específico (DSA / TPUs / NPUs).
* **Artefacto / Modelo Mental Entregable:** El modelo microarquitectónico de un núcleo de cómputo SIMT acoplado a una Matriz Sistólica por hardware para aceleración de productos tensoriales.
* **Frontera de Entrada:** Comienza en los límites de la ejecución secuencial de la CPU para cargas de datos masivas.
* **Frontera de Salida:** Termina en la especificación de hardware de procesadores paralelos y aceleradores tensoriales en silicio.
* **Dependencias Directas:** `03. cpu-microarchitecture`, `04. memory-subsystems`.

---

### 06. `assembly-language-mechanics` — Assembly Language Mechanics

* **Assumed Prerequisites:** Datapath de CPU y ciclo de instrucción de `03. cpu-microarchitecture`.
* **Course Boundary:** Comienza en la interfaz del Conjunto de Instrucciones (ISA) de la CPU y termina en la manipulación manual del marco de pila, convenciones de llamada e instrucciones privileged.
* **Explicit Exclusions:** ❌ SIN lenguajes de alto nivel (C/C++), ❌ SIN memoria virtual por software.
* **Problema Disparador:** El procesador solo ejecuta código binario ejecutable. ¿Cómo expresamos algoritmos de forma simbólica e interactuamos directamente con los registros del procesador y la pila de memoria sin abstracciones de lenguaje?
* **Dominio Técnico Comprehendido:** Conjuntos de Instrucciones (ISA - RISC-V y x86-64), filosofía RISC vs CISC, registros del procesador (propósito general, puntero de instrucción, puntero de pila), modos de direccionamiento de memoria, la pila (*Stack Frame*), convenciones de llamada (*Calling Conventions / ABI*), vectores de interrupción por software/hardware e instrucciones de control de estado del procesador.
* **Artefacto / Modelo Mental Entregable:** Un programa completo en ensamblador RISC-V/x86-64 que gestiona manualmente el marco de pila, el paso de argumentos por registros y el desempaquetado de llamadas.
* **Frontera de Entrada:** Comienza en la interfaz de la ISA expuesta por el procesador.
* **Frontera de Salida:** Termina en la capacidad de programar directamente la CPU y controlar el estado de sus registros y pila.
* **Dependencias Directas:** `03. cpu-microarchitecture`.

---

### 07. `hardware-interconnects` — Hardware Interconnects

* **Assumed Prerequisites:** Microarquitectura de CPU de `03. cpu-microarchitecture` y controladores de memoria de `04. memory-subsystems`.
* **Course Boundary:** Comienza en la necesidad de interconectar la CPU con dispositivos periféricos y aceleradores a gigabytes por segundo y termina en transferencias DMA seguras y buses coherentes de alta velocidad.
* **Explicit Exclusions:** ❌ SIN controladores de dispositivos en espacio de kernel (van en OS).
* **Problema Disparador:** Conectar componentes mediante buses paralelos compartidos produce colisiones y limita el ancho de banda. ¿Cómo diseñamos interconexiones punto a punto de alta velocidad e integración en SoC que permitan transferencias directas a memoria sin saturar la CPU?
* **Dominio Técnico Comprehendido:** Evolución de buses (compartidos vs seriales punto a punto), topología de paquetes en bus PCIe, protocolo CXL (*Compute Express Link*), integración de IP Cores en SoC, transferencias por Acceso Directo a Memoria (DMA) gestionadas por hardware, aislamiento y traducción de memoria por IOMMU y protocolos de interconexión coherente entre zócalos de CPU.
* **Artefacto / Modelo Mental Entregable:** Un mapa de flujo de paquetes en bus PCIe con aislamiento IOMMU y transferencia DMA de cero copia por hardware.
* **Frontera de Entrada:** Comienza en la interfaz de entrada/salida del procesador y la memoria.
* **Frontera de Salida:** Termina en la transferencia directa de datos a alta velocidad entre aceleradores, periféricos y memoria.
* **Dependencias Directas:** `03. cpu-microarchitecture`, `04. memory-subsystems`.

---

### 08. `bare-metal-systems` — Bare-Metal Systems

* **Assumed Prerequisites:** Sintaxis de ensamblador, registros y marco de pila de `06. assembly-language-mechanics`.
* **Course Boundary:** Comienza en el vector de interrupciones de un microcontrolador y termina en el control determinista de periféricos físicos en Ensamblador sobre registros MMIO sin sistema operativo.
* **Explicit Exclusions:** ❌ SIN código C/C++ (punteros y estructuras C pertenecen estrictamente a Capa 01), ❌ SIN sistemas operativos de tiempo real (RTOS).
* **Problema Disparador:** En microcontroladores de bajos recursos no existe sistema operativo ni abstracción de código C. ¿Cómo controlamos sensores, motores y temporizadores directamente manipulando registros mapeados en memoria mediante ensamblador conducido por interrupciones?
* **Dominio Técnico Comprehendido:** Programación de microcontroladores sin SO (ARM Cortex-M y RISC-V MCU), Entrada/Salida Mapeada en Memoria (MMIO) mediante instrucciones puras de carga/almacenamiento (`LDR`/`STR`), temporizadores hardware/PWM, controladores de interrupciones vectorizadas (NVIC), ahorro de energía por hardware y protocolos de bus serie en placa (I2C, SPI, UART).
* **Artefacto / Modelo Mental Entregable:** Un driver bare-metal conducido por interrupciones escrito exclusivamente en Ensamblador para la gestión de periféricos SPI/I2C mediante registros MMIO.
* **Frontera de Entrada:** Comienza en el mapa de direcciones de memoria MMIO y la tabla de vectores de interrupción del microcontrolador.
* **Frontera de Salida:** Termina en el control determinista de dispositivos físicos mediante ensamblador directo sobre el silicio.
* **Dependencias Directas:** `06. assembly-language-mechanics`.

---

### 09. `platform-bootstrapping` — Platform Bootstrapping

* **Assumed Prerequisites:** Controladores de memoria de `04. memory-subsystems`, Ensamblador de `06. assembly-language-mechanics` e interconexiones de `07. hardware-interconnects`.
* **Course Boundary:** Comienza en la señal eléctrica de encendido (*Power-On Reset*) y la ejecución de la primera instrucción en ROM y termina en la entrega del hardware inicializado al cargador de arranque o kernel.
* **Explicit Exclusions:** ❌ SIN cargadores de arranque de sistema operativo en espacio de disco (GRUB/Bootloaders de SO pertenecientes a Capa 04), ❌ SIN código C en espacio de usuario ni controladores ejecutables en espacio de firmware.
* **Problema Disparador:** Al presionar el botón de encendido, la memoria RAM no está configurada, los buses están inactivos y la CPU no tiene código que ejecutar. ¿Cómo inicializa la plataforma física su propio silicio desde la ROM de arranque hasta dejar la máquina lista para ejecutar software?
* **Dominio Técnico Comprehendido:** La secuencia de arranque físico (*Power-On Reset / POR*), ejecución del vector de reset desde ROM/Flash de plataforma, autodiagnóstico de hardware (POST), inicialización física de la memoria RAM (*DRAM Training* / calibración PHY), enumeración básica de bus PCIe, generación en ROM de tablas de descripción de hardware (ACPI / SMBIOS), autenticación de firma de firmware por hardware (*Root of Trust / Secure Boot*) y la interfaz de paso de control del sistema de firmware de plataforma.
* **Artefacto / Modelo Mental Entregable:** La especificación de una secuencia completa de arranque de plataforma (*Boot Sequence*) que entrena la memoria DRAM, genera tablas ACPI y transfiere el control en estado seguro.
* **Frontera de Entrada:** Comienza en la señal de encendido (*Power-On Reset*) y el vector de reset fijado en la ROM física del chip.
* **Frontera de Salida:** Termina en la máquina totalmente inicializada en hardware lista para recibir un cargador de arranque o kernel.
* **Dependencias Directas:** `04. memory-subsystems`, `06. assembly-language-mechanics`, `07. hardware-interconnects`.

---

### 10. `microarchitectural-security` — Microarchitectural Security

* **Assumed Prerequisites:** Pipelining fuera de orden de `03. cpu-microarchitecture`, cachés de `04. memory-subsystems` e interconexiones de `07. hardware-interconnects`.
* **Course Boundary:** Comienza en las fugas involuntarias producidas por las optimizaciones físicas del silicio y la memoria y termina en la mitigación por hardware y diseño en tiempo constante resistente a ataques físicos.
* **Explicit Exclusions:** ❌ SIN exploits de aislamiento de páginas de Kernel por software (como Meltdown tradicional), ❌ SIN exploits web/C en memoria de usuario.
* **Problema Disparador:** Las optimizaciones microarquitectónicas (tiempos de acceso a caché, ejecución especulativa en el pipeline) y la física de celdas DRAM filtran información secreta o permiten alterar bits de memoria. ¿Cómo auditamos y mitigamos estas vulnerabilidades en el silicio?
* **Dominio Técnico Comprehendido:** Fugas físicas y microarquitectónicas, ataques de canal lateral por tiempos de acceso a caché (*Flush+Reload, Prime+Probe*), análisis de consumo de potencia (DPA/SPA), perturbación física de celdas DRAM (*Rowhammer* y mitigaciones Target Row Refresh), inyección de fallos por reloj/tensión y enclaves de seguridad hardware (*Root of Trust*, TPM, Intel SGX, ARM TrustZone).
* **Artefacto / Modelo Mental Entregable:** Un modelo de ataque de canal lateral basado en tiempos de caché y un análisis de perturbación de celdas DRAM Rowhammer con sus mitigaciones en hardware.
* **Frontera de Entrada:** Comienza en las fugas de información y perturbaciones físicas derivadas del diseño microarquitectónico.
* **Frontera de Salida:** Termina en el diseño de primitivas RTL, algoritmos en tiempo constante y hardware resistente a ataques físicos y de canal lateral.
* **Dependencias Directas:** `03. cpu-microarchitecture`, `04. memory-subsystems`, `07. hardware-interconnects`.

---

### 11. `energy-efficient-microarchitecture` — Energy-Efficient Microarchitecture

* **Assumed Prerequisites:** FSMs y Lógica Combinacional de `01. digital-logic-design` y Datapath de CPU de `03. cpu-microarchitecture`.
* **Course Boundary:** Comienza en los límites térmicos del silicio (*Dark Silicon*) y termina en la gestión por hardware de dominios de reloj, *Clock Gating*, *Power Gating* y estados P/C del procesador.
* **Explicit Exclusions:** ❌ SIN gobernadores de energía por software en espacio de Kernel (Capa 04).
* **Problema Disparador:** Aumentar la frecuencia de reloj de un procesador incrementa el consumo de potencia de forma cúbica, provocando estrangulamiento térmico. ¿Cómo diseñamos hardware que apague dinámicamente bloques inactivos de transistores y ajuste voltajes en nanosegundos sin perder el estado de los registros?
* **Dominio Técnico Comprehendido:** Potencia dinámica ($P = C \cdot V^2 \cdot f$) vs estática (fugas de corriente), *Dark Silicon*, *Clock Gating* (desactivación de mallas de reloj), *Power Gating* (aislamiento de transistores de cabecera/pie), Dominios de Voltaje y Reloj independientes, Cruzamiento de Dominios de Potencia (*Power Domain Crossing - PDC*), Escalado Dinámico de Voltaje y Frecuencia por hardware (*DVFS*) y estados de reposo microarquitectónicos (C-States y P-States).
* **Artefacto / Modelo Mental Entregable:** Un módulo RTL en SystemVerilog de un controlador DVFS por hardware con lógica de *Clock Gating* y celdas de aislamiento para dominios de potencia.
* **Frontera de Entrada:** Comienza en los límites de disipación térmica y densidad de potencia de los circuitos digitales.
* **Frontera de Salida:** Termina en la entrega de un procesador con gestión energética y térmica nativa en silicio orientada a recibir la interfaz del SO.
* **Dependencias Directas:** `01. digital-logic-design`, `03. cpu-microarchitecture`.