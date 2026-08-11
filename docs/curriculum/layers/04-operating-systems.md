# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 04

La Capa 04 establece la abstracción y gobierno de los recursos físicos de un solo nodo de cómputo por parte del sistema operativo. Su dominio abarca la arquitectura del kernel, la comunicación IPC, la planificación de tiempo de CPU de propósito general y tiempo real estricto, la gestión de memoria virtual paginada por software, la infraestructura de controladores de dispositivos e I/O de alto rendimiento, la física y controladores FTL de almacenamiento de estado sólido NVMe, la abstracción de almacenamiento local de archivos mediante VFS con registro de diario, los mecanismos de virtualización e hipervisores asistidos por hardware, el aislamiento de contenedores a nivel de kernel y el filtrado seguro de llamadas al sistema mediante sandboxing. Toda coordinación distribuida multi-nodo o virtualización de redes se asume totalmente abstraída por las capas superiores.

---

## 🟢 CAPA 04: Operating Systems, Low-Level Storage & Hardware Drivers
*(Ruta en sistema de archivos: `content/04-operating-systems/`)*

---

### 01. `operating-system-kernels` — Operating System Kernels

* **Assumed Prerequisites:** Datapath de CPU, modo protegido/usuario y vectores de interrupción de `00: 03. cpu-microarchitecture` y `00: 06. assembly-language-mechanics`.
* **Course Boundary:** Comienza en el arranque del sistema (*bootstrapping*) y paso a modo protegido/kernel y termina en la gestión del ciclo de vida de procesos, entrega de señales, comunicación IPC e hilos con sincronización en espacio de kernel.
* **Explicit Exclusions:** ❌ SIN tiempo real determinista (tratado en `02`), ❌ SIN sistemas de archivos en disco (tratados en `06`).
* **Problema Disparador:** Múltiples aplicaciones compiten por la misma CPU física y necesitan comunicarse sin interferir en la memoria de los demás. ¿Cómo gestionamos el tiempo de procesador de forma aislada, protegida y equitativa mediante el Kernel, proveyendo canales IPC eficientes y evitando bloqueos en contexto de interrupción?
* **Dominio Técnico Comprehendido:** Arquitectura del núcleo (Monolítico vs Microkernel), estados de un proceso, PCB, llamadas al sistema (*syscalls*), cambios de contexto (*context switching*), planificación de CPU (Round Robin, CFS, Multinivel con Retroalimentación), interrupciones de software, entrega de señales a procesos (`sigaction`), Comunicación Inter-Procesos (IPC: Pipes, Memoria Compartida, UNIX Domain Sockets), cerrojos rápidos en espacio de usuario (*Futex*) y sincronización en espacio de kernel (Spinlocks, cerrojos de interrupción, Mutexes de kernel y mecanismo RCU - *Read-Copy-Update*).
* **Artefacto / Modelo Mental Entregable:** Un planificador de CPU funcional en espacio de kernel con soporte para cambios de contexto, entrega de señales, canal IPC y cerrojos Futex sincronizados por Spinlocks/RCU.
* **Frontera de Entrada:** Comienza en el arranque del sistema (*bootstrapping*) y paso a modo protegido/kernel.
* **Frontera de Salida:** Termina en la gestión del ciclo de vida de procesos, señales, canales IPC e hilos de propósito general con sincronización interna de kernel.
* **Dependencias Directas:** `00: 03. cpu-microarchitecture`, `00: 06. assembly-language-mechanics`.

---

### 02. `real-time-operating-systems` — Real-Time Operating Systems

* **Assumed Prerequisites:** Arquitectura de kernel, llamadas al sistema e interrupciones de `01. operating-system-kernels`.
* **Course Boundary:** Comienza en la necesidad de determinismo temporal para tareas críticas y termina en la garantía matemática de cumplimiento de plazos (*deadlines*).
* **Explicit Exclusions:** ❌ SIN arquitectura de hipervisores (tratada en `07`).
* **Problema Disparador:** En sistemas críticos (frenos ABS, robótica médica), la latencia promedio no importa; la ejecución DEBE cumplir su plazo exacto sin excepciones. ¿Cómo garantizamos determinismo temporal estricto?
* **Dominio Técnico Comprehendido:** Sistemas operativos deterministas de tiempo real estricto (*Hard Real-Time*) y flexible (*Soft Real-Time*), latencia de interrupción acotada, planificación determinista (RMS - Rate Monotonic, EDF - Earliest Deadline First), problema de Inversión de Prioridades (*Priority Inversion*) y protocolos de herencia/techo de prioridad.
* **Artefacto / Modelo Mental Entregable:** Un planificador RTOS estricto por plazos (*Earliest Deadline First*) con mitigación de inversión de prioridades por herencia.
* **Frontera de Entrada:** Comienza en la ineficiencia de los kernels de tiempo compartido para tareas críticas.
* **Frontera de Salida:** Termina en la garantía matemática de cumplimiento de plazos (*deadlines*).
* **Dependencias Directas:** `01. operating-system-kernels`.

---

### 03. `virtual-memory-systems` — Virtual Memory Systems

* **Assumed Prerequisites:** Paginación por hardware, MMU y TLB de `00: 03. cpu-microarchitecture` e hilos/procesos de `01. operating-system-kernels`.
* **Course Boundary:** Comienza en la traducción de dirección virtual a física por el SO y termina en la gestión de memoria del kernel (Buddy System / SLUB) y espacio de direcciones de procesos con mapeo de memoria `mmap`.
* **Explicit Exclusions:** ❌ SIN recolectores de basura de lenguajes de programación (Capa 05).
* **Problema Disparador:** La RAM física es limitada y propensa a colisiones entre procesos. ¿Cómo proporcionamos a cada programa la ilusión de tener un espacio de direcciones contiguo, aislado e infinito, al tiempo que el kernel administra su propia memoria física?
* **Dominio Técnico Comprehendido:** Abstracción de memoria por el sistema operativo, espacio de direcciones virtuales, paginación, tablas de páginas multinivel, direccionamiento asistido por hardware (MMU y TLB), fallos de página (*Page Faults*), asignadores de memoria física interna del kernel (Buddy System, SLUB/SLAB Allocators - `kmalloc`/`kfree`), algoritmos de reemplazo de páginas (LRU, Clock), relojes del SO (Monotonic Clock vs Wall-Clock) y la API de mapeo de memoria `mmap`.
* **Artefacto / Modelo Mental Entregable:** Un manejador de fallos de página (*Page Fault Handler*) en kernel gestionando tablas de páginas multinivel, un asignador SLUB del kernel y mapeo de memoria `mmap`.
* **Frontera de Entrada:** Comienza en la traducción de dirección virtual a dirección física.
* **Frontera de Salida:** Termina en la gestión de memoria física del kernel (SLUB), intercambio de páginas a disco (*swapping*) y mapeo de archivos en memoria.
* **Dependencias Directas:** `00: 03. cpu-microarchitecture`, `01. operating-system-kernels`.

---

### 04. `device-driver-subsystems` — Device Driver Subsystems

* **Assumed Prerequisites:** Vectores de interrupción IRQ, DMA y registros de hardware de `00: 03. cpu-microarchitecture`, `00: 06. assembly-language-mechanics` y `01. operating-system-kernels`.
* **Course Boundary:** Comienza en la interfaz del controlador de hardware y termina en la infraestructura de drivers del kernel, I/O no bloqueante de alto rendimiento y observabilidad eBPF.
* **Explicit Exclusions:** ❌ SIN diseño de placas físicas de hardware, ❌ SIN controladores específicos de estado sólido NVMe (tratados en `05`).
* **Problema Disparador:** Cada periférico físico habla un lenguaje hardware diferente. ¿Cómo abstrae el kernel los dispositivos físicos mediante controladores estándar e I/O de cero copia sin saturar la CPU?
* **Dominio Técnico Comprehendido:** Arquitectura de entrada/salida del SO, controladores de dispositivos (*Device Drivers*), manejo de interrupciones físicas (IRQ), acceso directo a memoria (DMA), buffers de anillo (*Ring Buffers*), subsistema de bloque y carácter, I/O de Cero Copia (`sendfile`, `splice`), interfaz asíncrona de kernel `io_uring`, eBPF y observabilidad del kernel (`perf`, Flame Graphs).
* **Artefacto / Modelo Mental Entregable:** Un controlador de dispositivo de caracteres en espacio de kernel comunicado mediante DMA, buffers de anillo e interfaz `io_uring`.
* **Frontera de Entrada:** Comienza en la interfaz del controlador de hardware.
* **Frontera de Salida:** Termina en la interfaz de driver orientada al kernel, subsistema I/O `io_uring` y trazado de rendimiento.
* **Dependencias Directas:** `00: 03. cpu-microarchitecture`, `00: 06. assembly-language-mechanics`, `01. operating-system-kernels`.

---

### 05. `solid-state-storage-systems` — Solid State Storage Systems

* **Assumed Prerequisites:** Infraestructura de drivers e I/O de `04. device-driver-subsystems`.
* **Course Boundary:** Comienza en la interfaz del dispositivo físico SSD/NVMe y termina en la optimización del controlador FTL y colas de comandos en el controlador de bloques del kernel.
* **Explicit Exclusions:** ❌ SIN la capa de VFS e inodos del SO (tratada en `06`).
* **Problema Disparador:** Las memorias Flash SSD no pueden sobrescribir datos directamente y se desgastan con las escrituras. ¿Cómo traducimos bloques lógicos a físicos garantizando rendimiento y nivelación de desgaste en controladores NVMe?
* **Dominio Técnico Comprehendido:** Física del almacenamiento de estado sólido, celdas NAND Flash (SLC/MLC/TLC), capa de traducción Flash (*FTL*), nivelación de desgaste (*wear leveling*), recolección de basura interna, comando TRIM y arquitectura de colas de comandos en controladores **NVMe**.
* **Artefacto / Modelo Mental Entregable:** Un algoritmo de FTL (*Flash Translation Layer*) con recolección de basura y nivelación de desgaste (*wear leveling*) para controladores NVMe.
* **Frontera de Entrada:** Comienza en la interfaz del dispositivo físico de bloques de estado sólido.
* **Frontera de Salida:** Termina en la optimización del rendimiento de escritura/lectura de bloques en memoria Flash para el subsistema de bloques.
* **Dependencias Directas:** `04. device-driver-subsystems`.

---

### 06. `virtual-file-systems` — Virtual File Systems

* **Assumed Prerequisites:** Procesos de `01. operating-system-kernels`, memoria `mmap` de `03. virtual-memory-systems` y subsistema de bloques de `05. solid-state-storage-systems`.
* **Course Boundary:** Comienza en las llamadas `open()/read()/write()` de usuario y termina en la estructuración de bloques persistentes en disco resistente a apagones.
* **Explicit Exclusions:** ❌ SIN sistemas de archivos distribuidos multi-nodo (Capa 07).
* **Problema Disparador:** Los dispositivos de almacenamiento ven el disco como un array plano de bloques. ¿Cómo organizamos los datos persistentes en archivos, directorios y estructuras resistentes a apagones repentinos?
* **Dominio Técnico Comprehendido:** Abstracción de almacenamiento persistente mono-nodo, la capa VFS (Virtual File System), estructuras de archivos en disco (Inodos, Bloques, Extent-based), asignación de archivos, directorios, sistemas de archivos con registro de diario (*Journaling File Systems - ext4, NTFS*), almacenamiento en caché de bloques (*Buffer Cache*) y bloqueos de archivos.
* **Artefacto / Modelo Mental Entregable:** Un sistema de archivos en disco basado en Inodos con registro de diario (*Journaling*) para recuperación ante fallos.
* **Frontera de Entrada:** Comienza en las llamadas del sistema `open()/read()/write()`.
* **Frontera de Salida:** Termina en la estructura de bloques en el dispositivo físico mono-nodo.
* **Dependencias Directas:** `01. operating-system-kernels`, `03. virtual-memory-systems`, `05. solid-state-storage-systems`.

---

### 07. `hardware-virtualization-hypervisors` — Hardware Virtualization Hypervisors

* **Assumed Prerequisites:** Tablas de páginas de `03. virtual-memory-systems` y drivers I/O de `04. device-driver-subsystems`.
* **Course Boundary:** Comienza en la ejecución de un sistema operativo dentro de otro y termina en la gestión de máquinas virtuales invitadas con aislamiento asistido por hardware.
* **Explicit Exclusions:** ❌ SIN contenedores a nivel de SO (tratados en `08`).
* **Problema Disparador:** ¿Cómo ejecutamos múltiples sistemas operativos enteros sobre un mismo hardware físico sin que interfieran entre sí y con rendimiento cercano al nativo?
* **Dominio Técnico Comprehendido:** Virtualización asistida por hardware (Intel VT-x / AMD-V), Hipervisores Tipo-1 y Tipo-2, trampas de instrucciones (*Trap-and-Emulate*), tablas de páginas anidadas (EPT/NPT), paravirtualización (virtio) y passthrough de dispositivos (SR-IOV).
* **Artefacto / Modelo Mental Entregable:** Un hipervisor Tipo-2 educativo que intercepta e emula instrucciones privileged usando tablas EPT.
* **Frontera de Entrada:** Comienza en la ejecución de un sistema operativo dentro de otro.
* **Frontera de Salida:** Termina en la gestión de máquinas virtuales invitadas con aislamiento por hardware.
* **Dependencias Directas:** `03. virtual-memory-systems`, `04. device-driver-subsystems`.

---

### 08. `container-runtime-internals` — Container Runtime Internals

* **Assumed Prerequisites:** Procesos e hilos de `01. operating-system-kernels` y VFS/OverlayFS de `06. virtual-file-systems`.
* **Course Boundary:** Comienza en la creación de procesos aislados sobre el mismo kernel y termina en el motor de ejecución de imágenes de contenedores OCI.
* **Explicit Exclusions:** ❌ SIN orquestadores de contenedores multi-nodo (Kubernetes, Capa 09).
* **Problema Disparador:** Las máquinas virtuales pesan Gigabytes y consumen muchos recursos. ¿Cómo aislamos procesos livianos compartiendo el mismo kernel del sistema operativo?
* **Dominio Técnico Comprehendido:** Virtualización a nivel de SO (Linux), espacios de nombres (*Namespaces* - PID, NET, MNT, IPC, UTS, USER), grupos de control (*Cgroups* - límites CPU/RAM), chroot/pivot_root, sistemas de archivos de unión/capas (OverlayFS) y especificación OCI (runc/containerd).
* **Artefacto / Modelo Mental Entregable:** Un runtime de contenedores en C/Rust que crea un entorno aislado usando `unshare`, `namespaces`, `cgroups` y `OverlayFS`.
* **Frontera de Entrada:** Comienza en la creación de procesos aislados en el mismo kernel.
* **Frontera de Salida:** Termina en el motor de ejecución de imágenes de contenedores OCI.
* **Dependencias Directas:** `01. operating-system-kernels`, `06. virtual-file-systems`.

---

### 09. `system-security-sandboxing` — Kernel Security Sandboxing

* **Assumed Prerequisites:** Llamadas al sistema de `01. operating-system-kernels` y Memoria Virtual de `03. virtual-memory-systems`.
* **Course Boundary:** Comienza en la insuficiencia de los permisos tradicionales de usuario/grupo de Unix y termina en la restricción de privilegios mediante módulos de seguridad del Kernel (LSM), capacidades y filtrado de llamadas al sistema.
* **Explicit Exclusions:** ❌ SIN explotación de corrupciones de memoria en espacio de usuario (Capa 08).
* **Problema Disparador:** Un proceso que corre como un usuario normal aún puede leer archivos sensibles de ese usuario o abrir sockets maliciosos. ¿Cómo limitamos a un proceso únicamente a las llamadas al sistema y archivos estrictamente necesarios para su operación?
* **Dominio Técnico Comprehendido:** Control de Acceso Discrecional (DAC) vs Obligatorio (MAC), Módulos de Seguridad de Linux (LSM: SELinux, AppArmor), Capacidades de Linux (*Linux Capabilities* - división del poder de `root`), Filtrado de Syscalls mediante `seccomp-bpf` (BPF aplicado a llamadas del sistema), Sandboxing moderno (`Landlock`), y aislamiento de entornos sin privilegios.
* **Artefacto / Modelo Mental Entregable:** Un sandbox ejecutable en C/Rust que aplica filtros `seccomp-bpf` y restricciones `Landlock` para aislar un proceso restringiendo su acceso al sistema de archivos y red.
* **Frontera de Entrada:** Comienza en el principio de mínimo privilegio aplicado a procesos del sistema operativo.
* **Frontera de Salida:** Termina en la ejecución segura de software no confiable en entornos aislados a nivel Kernel.
* **Dependencias Directas:** `01. operating-system-kernels`, `03. virtual-memory-systems`.