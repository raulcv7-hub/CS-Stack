# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 06

La Capa 06 establece la comunicación de paquetes a través de medios no fiables y la coordinación/acuerdo entre múltiples nodos independientes. Su dominio abarca la arquitectura de redes en capas (Enlace, Red, Transporte y Aplicación), las redes programables por software (SDN), los protocolos cliente-servidor de alta velocidad, los fundamentos de sistemas distribuidos (ausencia de memoria compartida), la sincronización de tiempo físico acotado (PTP, TrueTime), los esquemas de replicación y detección de fallos por quórum, los algoritmos de consenso distribuido ante fallos de parada (Paxos/Raft) y adversariales (BFT), y las arquitecturas P2P descentralizadas.

---

## 🟢 CAPA 06: Computer Networks & Distributed Systems Fundamentals
*(Ruta en sistema de archivos: `content/06-networks-and-distributed-systems/`)*

---

### 01. `computer-network-architecture` — Computer Network Architecture

* **Assumed Prerequisites:** Drivers de red I/O, interrupciones hardware y Ring Buffers de `04: 04. device-driver-subsystems`.
* **Course Boundary:** Comienza en la emisión física de bits por un canal no seguro y termina en la entrega de tramas dentro de una misma red local (LAN) mediante direcciones MAC y conmutación.
* **Explicit Exclusions:** ❌ SIN enrutamiento IP entre redes distintas (Capa de Red).
* **Problema Disparador:** ¿Cómo enviamos tramas de datos digitales entre dos máquinas físicas conectadas al mismo medio sin colisionar ni corromper los datos?
* **Dominio Técnico Comprehendido:** Fundamentos de redes, topologías, modelos OSI y TCP/IP, Capa Física, Capa de Enlace, tramado, direccionamiento MAC, conmutación (*Switches*), protocolo Ethernet, Wi-Fi (802.11) y detección/corrección de errores (CRCs, Checksums).
* **Artefacto / Modelo Mental Entregable:** Un emulador de conmutador (*Switch*) Ethernet con aprendizaje de tablas MAC y algoritmos de detección de errores.
* **Frontera de Entrada:** Comienza en la emisión de bits por un medio físico.
* **Frontera de Salida:** Termina en la entrega de tramas dentro de una misma red local (LAN).
* **Dependencias Directas:** `04: 04. device-driver-subsystems`.

---

### 02. `network-layer-routing` — Network Layer Routing

* **Assumed Prerequisites:** Tramado y direccionamiento de capa de enlace de `01. computer-network-architecture`.
* **Course Boundary:** Comienza en la entrega de tramas en red local y termina en el enrutamiento de paquetes IP a través de redes heterogéneas globales y traducción de direcciones NAT.
* **Explicit Exclusions:** ❌ SIN protocolos de transporte con conexión (TCP/UDP).
* **Problema Disparador:** Entregar tramas dentro de una red local no sirve para comunicar máquinas a escala global. ¿Cómo enrutamos paquetes a través de miles de redes heterogéneas interconectadas y atravesamos enrutadores con direcciones privadas?
* **Dominio Técnico Comprehendido:** Capa de Red, Protocolo IP (v4 y v6), subredes, CIDR, traducción de direcciones de red (NAT/NAPT), protocolos de travesía (STUN), algoritmos y protocolos de enrutamiento distribuidos (OSPF, BGP, RIP) e ICMP.
* **Artefacto / Modelo Mental Entregable:** Un simulador de router IP con tablas de enrutamiento dinámicas basadas en BGP/OSPF y tabla de traducción NAT.
* **Frontera de Entrada:** Comienza en la entrega de tramas dentro de una red local.
* **Frontera de Salida:** Termina en la entrega de paquetes IP a través de múltiples redes interconectadas (WAN) y cruce de fronteras NAT.
* **Dependencias Directas:** `01. computer-network-architecture`.

---

### 03. `transport-layer-protocols` — Transport Layer Protocols

* **Assumed Prerequisites:** Entrega de paquetes IP de `02. network-layer-routing`.
* **Course Boundary:** Comienza en la llegada del paquete IP al host y termina en la abstracción de sockets de transporte fiables con control de flujo y congestión.
* **Explicit Exclusions:** ❌ SIN enrutamiento IP de routers.
* **Problema Disparador:** La capa IP pierde, desordena y duplica paquetes. ¿Cómo creamos una abstracción de socket que proporcione un flujo de datos continuo, ordenado y sin pérdidas adaptándose al ancho de banda disponible?
* **Dominio Técnico Comprehendido:** Capa de Transporte, sockets de red, UDP, TCP (handshake 3-way, ventanas deslizantes, retransmisión adaptativa, control de flujo y algoritmos de control de congestión CUBIC/BBR) y QUIC sobre UDP.
* **Artefacto / Modelo Mental Entregable:** Una implementación simplificada del protocolo TCP con control de congestión por estimación de retardo (BBR) sobre sockets UDP no fiables.
* **Frontera de Entrada:** Comienza en la llegada del paquete IP al host.
* **Frontera de Salida:** Termina en el canal de comunicación fiable y ordenado entre dos procesos.
* **Dependencias Directas:** `02. network-layer-routing`.

---

### 04. `software-defined-networking` — Software-Defined Networking

* **Assumed Prerequisites:** Sockets y capas de red de `03. transport-layer-protocols`.
* **Course Boundary:** Comienza en la rigidez del enrutamiento distribuido por hardware y termina en la programación del plano de control de red desde controladores centralizados.
* **Explicit Exclusions:** ❌ SIN capas de aplicación web.
* **Problema Disparador:** Reconfigurar la lógica de enrutamiento dispositivo a dispositivo en hardware distribuido es lento y rígido. ¿Cómo programamos la red dinámicamente desde un plano de control centralizado?
* **Dominio Técnico Comprehendido:** Arquitectura de redes programables, separación del Plano de Control y Plano de Datos, controladores SDN centrales, protocolo OpenFlow, lenguaje P4 y Virtualización de Funciones de Red (NFV).
* **Artefacto / Modelo Mental Entregable:** Un controlador SDN que inyecta reglas de enrutamiento dinámicas sobre conmutadores programables P4.
* **Frontera de Entrada:** Comienza en la rigidez de las tablas de enrutamiento distribuidas por hardware.
* **Frontera de Salida:** Termina en la orquestación de red dinámicamente programable por software.
* **Dependencias Directas:** `03. transport-layer-protocols`.

---

### 05. `application-layer-protocols` — Application Layer Protocols

* **Assumed Prerequisites:** Sockets TCP/UDP/QUIC de `03. transport-layer-protocols`.
* **Course Boundary:** Comienza en la conexión de socket abierta y termina en la semántica de datos estructurados entre cliente y servidor.
* **Explicit Exclusions:** ❌ SIN cifrado criptográfico TLS/SSL (Capa 08).
* **Problema Disparador:** Una vez establecido un canal de transporte de bytes, ¿cómo estructuramos los formatos y semánticas de mensajería para aplicaciones cliente-servidor y la Web?
* **Dominio Técnico Comprehendido:** Protocolos de aplicación, DNS, SMTP, FTP, HTTP (1.1, 2, 3), WebSockets, SSH y diseño de APIs (REST, gRPC/Protobuf, GraphQL).
* **Artefacto / Modelo Mental Entregable:** Un servidor HTTP/2 y cliente gRPC de alto rendimiento sobre multiplexación de streams.
* **Frontera de Entrada:** Comienza en la conexión de socket abierta.
* **Frontera de Salida:** Termina en la semántica de datos estructurados entre cliente y servidor.
* **Dependencias Directas:** `03. transport-layer-protocols`.

---

### 06. `distributed-systems-fundamentals` — Distributed Systems Fundamentals

* **Assumed Prerequisites:** I/O Asíncrono de `01: 10. asynchronous-event-execution` y Sockets de `03. transport-layer-protocols`.
* **Course Boundary:** Comienza en la ejecución de algoritmos multi-nodo sin memoria compartida y termina en los límites teóricos de la consistencia y disponibilidad.
* **Explicit Exclusions:** ❌ SIN algoritmos de consenso específicos (Paxos/Raft).
* **Problema Disparador:** En un sistema multi-nodo no hay memoria compartida ni un reloj físico común. ¿Cómo ordenamos eventos y razonamos sobre el estado global de un sistema distante?
* **Dominio Técnico Comprehendido:** Ausencia de memoria compartida y reloj global, relojes físicos vs lógicos (Lamport, Vector Clocks), ordenación de eventos, estados globales distribuidos (Chandy-Lamport), modelos de fallos, Teorema CAP y PACELC.
* **Artefacto / Modelo Mental Entregable:** Un algoritmo de toma de instantáneas globales (*Snapshots*) mediante Chandy-Lamport y seguimiento de eventos con Vector Clocks.
* **Frontera de Entrada:** Comienza en la ejecución de algoritmos a través de múltiples nodos independientes por red.
* **Frontera de Salida:** Termina en los límites teóricos de la consistencia y disponibilidad.
* **Dependencias Directas:** `01: 10. asynchronous-event-execution`, `03. transport-layer-protocols`.

---

### 07. `fault-tolerant-replication` — Fault-Tolerant Replication

* **Assumed Prerequisites:** Relojes lógicos e instantáneas globales de `06. distributed-systems-fundamentals`.
* **Course Boundary:** Comienza en la pérdida arbitraria de nodos y termina en un clúster autoreparable tolerante a particiones mediante quórums y detectores de fallos.
* **Explicit Exclusions:** ❌ SIN consenso determinista Raft/Paxos (tratado en `08`).
* **Problema Disparador:** Las máquinas se caen y las redes se particionan. ¿Cómo diseñamos clústeres masivos que reparen su estado automáticamente sin perder datos ni sufrir particionamiento de red (*Brain-Split*)?
* **Dominio Técnico Comprehendido:** Construcción de sistemas masivos resistentes a fallos, estrategias de replicación (Primary-Backup, Active-Active, Quorums R/W $R+W>N$), detectores de fallos (*Heartbeats*, *Phi Accrual Failure Detector*), prevención de particionamiento de red (*Brain-Split*), autoreparación y recuperación anti-entropía.
* **Artefacto / Modelo Mental Entregable:** Un sistema distribuido replicado por quórum de lectura/escritura ($R + W > N$) con detector de fallos *Phi Accrual* y reparación anti-entropía automática.
* **Frontera de Entrada:** Comienza en los límites de disponibilidad de un solo nodo.
* **Frontera de Salida:** Termina en un clúster distribuido replicado por quórums tolerante a caídas de máquinas.
* **Dependencias Directas:** `06. distributed-systems-fundamentals`.

---

### 08. `distributed-consensus-algorithms` — Distributed Consensus Algorithms

* **Assumed Prerequisites:** Replicación y quórums de `07. fault-tolerant-replication`.
* **Course Boundary:** Comienza en la necesidad de acuerdo único en presencia de fallos de parada y termina en la implementación de una máquina de estados replicada con truncado de log.
* **Explicit Exclusions:** ❌ SIN consenso Bizantino ante nodos maliciosos (tratado en `09`).
* **Problema Disparador:** ¿Cómo garantizamos que un conjunto de nodos independientes acuerden una secuencia idéntica de operaciones en presencia de caídas de red, elecciones ilícitas y fallos de máquinas?
* **Dominio Técnico Comprehendido:** El problema del acuerdo distribuido en presencia de fallos de parada (*Crash-Stop*), Paxos (Basic/Multi-Paxos), Raft (elección de líder, replicación de registros, seguridad, truncado de logs e instantáneas/snapshots) y Zab (ZooKeeper).
* **Artefacto / Modelo Mental Entregable:** Un clúster con algoritmo de consenso **Raft** completo (elección de líder, replicación de logs, compactación por snapshots y reconexión ante particiones).
* **Frontera de Entrada:** Comienza en la necesidad de mantener un registro ordenado único entre $N$ nodos no fiables.
* **Frontera de Salida:** Termina en la implementación de una máquina de estados replicada determinista.
* **Dependencias Directas:** `07. fault-tolerant-replication`.

---

### 09. `byzantine-fault-tolerance` — Byzantine Fault Tolerance

* **Assumed Prerequisites:** Máquina de estados replicada de `08. distributed-consensus-algorithms`.
* **Course Boundary:** Comienza en el consenso bajo nodos maliciosos y termina en la ejecución de transacciones inmutables sobre redes no fiables.
* **Explicit Exclusions:** ❌ SIN desarrollo de aplicaciones financieras web.
* **Problema Disparador:** Cuando los nodos distribuidos pueden actuar maliciosamente o mentir, Raft/Paxos fallan. ¿Cómo logramos consenso determinista en entornos adversariales?
* **Dominio Técnico Comprehendido:** Consenso distribuido en presencia de nodos maliciosos (*Byzantine Faults*), PBFT, Proof-of-Work (PoW), Proof-of-Stake (PoS), Máquinas de estado de Contratos Inteligentes y estructuras de datos en cadena/DAG distribuido.
* **Artefacto / Modelo Mental Entregable:** Un motor de consenso Bizantino PBFT tolerante a traiciones de nodos adversarios.
* **Frontera de Entrada:** Comienza en la insuficiencia de Raft/Paxos frente a ataques deliberados.
* **Frontera de Salida:** Termina en la ejecución de transacciones inmutables sobre redes no fiables adversariales.
* **Dependencias Directas:** `08. distributed-consensus-algorithms`.

---

### 10. `peer-to-peer-architectures` — Peer-to-Peer Network Architectures

* **Assumed Prerequisites:** Replicación y detectores de fallos de `07. fault-tolerant-replication`.
* **Course Boundary:** Comienza en la conexión de nodos iguales y termina en la búsqueda y transferencia descentralizada de archivos.
* **Explicit Exclusions:** ❌ SIN especulación de criptomonedas.
* **Problema Disparador:** Los servidores centrales son puntos únicos de fallo y cuellos de botella de ancho de banda. ¿Cómo organizamos redes donde cada nodo actúa como cliente y servidor simultáneamente atravesando cortafuegos y NATs?
* **Dominio Técnico Comprehendido:** Sistemas distribuidos descentralizados sin servidor central, Tablas Hash Distribuidas (Kademlia DHT), travesía de NATs (STUN, TURN, ICE), Gossip Protocols, BitTorrent y estructuras de datos acíclicas dirigidas por contenido (Merkle Trees / Merkle DAGs).
* **Artefacto / Modelo Mental Entregable:** Una red P2P basada en la Tabla Hash Distribuida Kademlia con perforación de puertos NAT (*Hole Punching*) para enrutamiento por distancia XOR.
* **Frontera de Entrada:** Comienza en la conexión de nodos iguales (*peers*).
* **Frontera de Salida:** Termina en la búsqueda y transferencia de archivos sin punto único de fallo.
* **Dependencias Directas:** `07. fault-tolerant-replication`.

---

### 11. `clock-synchronization-protocols` — Physical Clock Synchronization

* **Assumed Prerequisites:** Sockets UDP de `03. transport-layer-protocols` y Relojes Lógicos de `06. distributed-systems-fundamentals`.
* **Course Boundary:** Comienza en la deriva física de los osciladores de cuarzo (*Clock Drift*) y termina en la sincronización de tiempo físico con incertidumbre acotada mediante algoritmos de red y hardware atómico (*TrueTime*).
* **Explicit Exclusions:** ❌ SIN ordenación lógica sin tiempo físico (Lamport/Vector Clocks de `06`).
* **Problema Disparador:** Los relojes físicos de los servidores derivan milisegundos por día debido a factores térmicos, imposibilitando ordenar transacciones distribuidas globales por tiempo real. ¿Cómo sincronizamos el tiempo físico entre miles de nodos acotando el error?
* **Dominio Técnico Comprehendido:** Física de osciladores y deriva de reloj (*Clock Drift*), Algoritmos de sincronización de tiempo en red (Cristian's Algorithm, Berkeley Algorithm, Marzullo's Algorithm), Protocolos de Tiempo de Red (NTP, PTP IEEE 1588 de alta precisión por hardware), la API TrueTime de Google Spanner (uso de GPS y Relojes Atómicos) y ordenación de datos mediante intervalos de incertidumbre $[t_{early}, t_{late}]$.
* **Artefacto / Modelo Mental Entregable:** Un simulador de sincronización de tiempo físico basado en el algoritmo de Marzullo y un cliente PTP con marcas de tiempo en tarjeta de red.
* **Frontera de Entrada:** Comienza en la falta de precisión de los relojes físicos individuales de cada servidor.
* **Frontera de Salida:** Termina en la provisión de un tiempo físico distribuido con margen de error matemáticamente acotado.
* **Dependencias Directas:** `03. transport-layer-protocols`, `06. distributed-systems-fundamentals`.