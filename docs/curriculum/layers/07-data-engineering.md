# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 07

La Capa 07 establece la persistencia, indexación, procesamiento transaccional y analítico de datos masivos a escala local y distribuida. Su dominio abarca la arquitectura de motores relacionales (Buffer Pool, B+ Trees, optimizadores CBO), el procesamiento transaccional ACID (2PL, MVCC, WAL/ARIES), los sistemas de archivos distribuidos de escala petabyte, las bases de datos NoSQL particionadas (LSM-Trees, Dynamo), los motores de almacenamiento en memoria de ultra-baja latencia, los motores de bases de datos de grafos (Index-Free Adjacency), el procesamiento batch distribuido sobre grafos DAG, los formatos transaccionales Data Lakehouse (Iceberg/Delta), los motores de búsqueda de texto completo e índices invertidos, las bases de datos vectoriales de alta dimensión, los motores analíticos columnares OLAP vectorizados y el procesamiento de flujos continuos (*Stream Processing*).

---

## 🟢 CAPA 07: Data Engineering, Database Engines & Distributed Storage
*(Ruta en sistema de archivos: `content/07-data-engineering/`)*

---

### 01. `relational-database-engines` — Relational Database Engines

* **Assumed Prerequisites:** Árboles B+ de `02: 03. hierarchical-data-structures` y almacenamiento de archivos local VFS de `04: 06. virtual-file-systems`.
* **Course Boundary:** Comienza en la estructura del archivo de base de datos en disco VFS y termina en la optimización de planes de consulta por costes y ejecución física Volcano.
* **Explicit Exclusions:** ❌ SIN transacciones ACID ni concurrencia (tratadas en `02`).
* **Problema Disparador:** Guardar datos en archivos de texto no permite búsquedas ni agregaciones eficientes. ¿Cómo construimos un motor de almacenamiento orientado a páginas, con caché en RAM (Buffer Pool) y un optimizador que elija el plan de ejecución de menor coste?
* **Dominio Técnico Comprehendido:** Arquitectura interna de un motor SQL relacional, almacenamiento orientado a páginas, Buffer Pool Manager, B+ Trees en disco, álgebra relacional, Optimizador de Consultas Basado en Costes (*Cost-Based Optimizer - CBO*, reglas de equivalencia, estimación de cardinalidad, algoritmo de Selinger), Volcano Iterator Model, ordenación externa y Joins (Nested Loop, Hash Join, Sort-Merge Join).
* **Artefacto / Modelo Mental Entregable:** Un motor de base de datos relacional con gestor de páginas, índice B+ Tree, optimizador CBO por costes y ejecutor de consultas Volcano.
* **Frontera de Entrada:** Comienza en el archivo de base de datos en disco VFS.
* **Frontera de Salida:** Termina en la ejecución física optimizada por CBO de un plan de consulta sobre tablas relacionales.
* **Dependencias Directas:** `02: 03. hierarchical-data-structures`, `04: 06. virtual-file-systems`.

---

### 02. `transaction-processing-engines` — Transaction Processing Engines

* **Assumed Prerequisites:** Concurrencia de `01: 09. concurrent-programming-mechanics` y motor relacional de `01. relational-database-engines`.
* **Course Boundary:** Comienza en la ejecución atómica de consultas sobre tablas y termina en las garantías de durabilidad y aislamiento ACID tras fallos catastróficos del sistema.
* **Explicit Exclusions:** ❌ SIN escalado distribuido multi-nodo (NoSQL, tratado en `04`).
* **Problema Disparador:** Modificar datos concurrentemente o sufrir apagones arruina la integridad de la base de datos. ¿Cómo garantizamos las propiedades ACID ante accesos paralelos y fallos del sistema?
* **Dominio Técnico Comprehendido:** El modelo de transacciones relacionales, propiedades ACID, Niveles de Aislamiento SQL y anomalías, control de concurrencia pesimista (2PL), control optimista (OCC), aislamiento por instantáneas, MVCC y recuperación ante fallos con WAL y algoritmo ARIES.
* **Artefacto / Modelo Mental Entregable:** Un motor de transacciones ACID con aislamiento MVCC y recuperación de crash con ARIES WAL.
* **Frontera de Entrada:** Comienza en el concepto de transacción atómica sobre tablas.
* **Frontera de Salida:** Termina en la garantía de durabilidad y consistencia tras un apagón del servidor.
* **Dependencias Directas:** `01: 09. concurrent-programming-mechanics`, `01. relational-database-engines`.

---

### 03. `distributed-file-systems` — Distributed File Systems

* **Assumed Prerequisites:** Sistemas de archivos VFS de `04: 06. virtual-file-systems` y sistemas resistentes a fallos de `06: 07. fault-tolerant-replication`.
* **Course Boundary:** Comienza en las limitaciones de capacidad de un solo disco local y termina en una capa unificada de almacenamiento de bloques distribuido a escala de petabytes.
* **Explicit Exclusions:** ❌ SIN motores NoSQL documentales ni sintaxis SQL (tratados en `04`).
* **Problema Disparador:** Los archivos de Petabytes no caben en el disco duro de un solo servidor. ¿Cómo los dividimos en bloques replicados a través de miles de discos por red de forma transparente?
* **Dominio Técnico Comprehendido:** Sistemas de archivos distribuidos a escala multi-nodo (HDFS, Ceph, Lustre), separación de servidor de metadatos y DataNodes, replicación de bloques en red, consistencia distribuida y recuperación mediante checksums.
* **Artefacto / Modelo Mental Entregable:** Un sistema de archivos distribuido multi-nodo con separación de metadatos y replicación automática de bloques.
* **Frontera de Entrada:** Comienza en los límites del almacenamiento en un solo servidor local.
* **Frontera de Salida:** Termina en un sistema de archivos unificado persistente de escala petabyte sobre red.
* **Dependencias Directas:** `04: 06. virtual-file-systems`, `06: 07. fault-tolerant-replication`.

---

### 04. `distributed-nosql-databases` — Distributed NoSQL Databases

* **Assumed Prerequisites:** Transacciones MVCC de `02. transaction-processing-engines`, almacenamiento distribuido de `03. distributed-file-systems` y replicación de `06: 07. fault-tolerant-replication`.
* **Course Boundary:** Comienza en los límites de escritura de una base de datos relacional y termina en un clúster NoSQL particionado de rendimiento petabyte.
* **Explicit Exclusions:** ❌ SIN procesamiento analítico OLAP (tratado en `08`).
* **Problema Disparador:** Las bases de datos relacionales mono-nodo no escalan ante millones de escrituras por segundo. ¿Cómo particionamos datos y optimizamos motores orientados a escritura (LSM-Trees)?
* **Dominio Técnico Comprehendido:** Escalado horizontal de bases de datos, modelos NoSQL (Clave-Valor, Documental, Columnar), fragmentación de datos (*Sharding* / Consistent Hashing), LSM-Trees (Memtable, SSTable, estrategias de compactación *Size-Tiered* vs *Leveled Compaction*), arquitectura Dynamo (Vector Clocks, Quorums, Cassandra).
* **Artefacto / Modelo Mental Entregable:** Un motor NoSQL basado en LSM-Trees con compactación *Leveled* y fragmentación por Consistent Hashing sobre un clúster distribuido.
* **Frontera de Entrada:** Comienza en los límites de una base de datos mono-nodo.
* **Frontera de Salida:** Termina en un clúster NoSQL de rendimiento petabyte.
* **Dependencias Directas:** `02. transaction-processing-engines`, `03. distributed-file-systems`, `06: 07. fault-tolerant-replication`.

---

### 05. `distributed-batch-processing` — Distributed Batch Processing

* **Assumed Prerequisites:** Almacenamiento distribuido HDFS de `03. distributed-file-systems` y fundamentos distribuidos de `06: 06. distributed-systems-fundamentals`.
* **Course Boundary:** Comienza en la ineficiencia del procesamiento secuencial sobre un solo nodo y termina en la ejecución de trabajos analíticos paralelos sobre grafos DAG en clúster.
* **Explicit Exclusions:** ❌ SIN streaming continuo en tiempo real (tratado en `09`).
* **Problema Disparador:** Procesar Terabytes de datos secuencialmente llevaría días. ¿Cómo dividimos el cómputo masivo en fases paralelas sobre clústeres distribuidos con tolerancia a fallos por recomputación de linaje?
* **Dominio Técnico Comprehendido:** Procesamiento masivo de datos en lote (*Batch*), MapReduce, modelo BSP, computación distribuida sobre memoria (Apache Spark - RDDs, DataFrames, DAGs de linaje), particionamiento de datos y tolerancia a fallos por recomputación de linaje.
* **Artefacto / Modelo Mental Entregable:** Un motor de procesamiento batch tipo Spark ejecutando transformaciones sobre un DAG de linaje en memoria.
* **Frontera de Entrada:** Comienza en la ineficiencia de procesar petabytes de datos en un solo nodo.
* **Frontera de Salida:** Termina en la ejecución optimizada de trabajos DAG distribuidos sobre miles de máquinas.
* **Dependencias Directas:** `03. distributed-file-systems`, `06: 06. distributed-systems-fundamentals`.

---

### 06. `full-text-search-engines` — Full-Text Search Engines

* **Assumed Prerequisites:** Indexación de cadenas de `02: 09. string-indexing-algorithms` y VFS de `04: 06. virtual-file-systems`.
* **Course Boundary:** Comienza en la toma de colecciones de texto no estructurado y termina en un motor de búsqueda de texto completo con ranking de relevancia.
* **Explicit Exclusions:** ❌ SIN búsquedas vectoriales por embeddings (IA, tratadas en `07`).
* **Problema Disparador:** Buscar palabras en millones de documentos mediante consultas `LIKE %word%` es inviable. ¿Cómo indexamos texto para responder consultas de relevancia en milisegundos?
* **Dominio Técnico Comprehendido:** Motores de búsqueda de texto completo, tokenización, *stemming*, stopwords, Índices Invertidos (*Inverted Indexes*), compresión de Postings Lists (Elias-Fano), algoritmos de ranking (TF-IDF, Okapi BM25) y consultas frase/booleanas.
* **Artefacto / Modelo Mental Entregable:** Un motor de búsqueda de texto completo con Índice Invertido comprimido y ranking Okapi BM25.
* **Frontera de Entrada:** Comienza en el texto no estructurado.
* **Frontera de Salida:** Termina en un motor de búsqueda capaz de responder consultas de relevancia en milisegundos.
* **Dependencias Directas:** `02: 09. string-indexing-algorithms`, `04: 06. virtual-file-systems`.

---

### 07. `vector-database-engines` — Vector Database Engines

* **Assumed Prerequisites:** Estructuras jerárquicas de `02: 03. hierarchical-data-structures` y almacenamiento en páginas de `01. relational-database-engines`.
* **Course Boundary:** Comienza en la representación vectorial de datos y termina en la indexación y búsqueda por similitud en espacios de alta dimensión.
* **Explicit Exclusions:** ❌ SIN entrenamiento de modelos de IA (Capa 10).
* **Problema Disparador:** Los datos no estructurados (imágenes, texto) se representan como vectores de 1,536 dimensiones. ¿Cómo buscamos por similitud semántica cuando los índices B+ Tree no funcionan en alta dimensión?
* **Dominio Técnico Comprehendido:** Búsqueda vectorial de alta dimensión, representaciones densas (*Embeddings*), algoritmos de búsqueda aproximada del vecino más cercano (ANN: HNSW, IVF-PQ, LSH), cuantización de vectores e indexación de grafos navegables de alta dimensión.
* **Artefacto / Modelo Mental Entregable:** Un motor de búsqueda vectorial basado en grafos HNSW (*Hierarchical Navigable Small World*) con cuantización de producto.
* **Frontera de Entrada:** Comienza en la imposibilidad matemática de usar B+ Trees o Índices Invertidos en espacios de 1,536 dimensiones.
* **Frontera de Salida:** Termina en la arquitectura interna de un motor de búsqueda por similitud vectorial distribuido de baja latencia.
* **Dependencias Directas:** `02: 03. hierarchical-data-structures`, `01. relational-database-engines`.

---

### 08. `analytical-query-engines` — Analytical Query Engines

* **Assumed Prerequisites:** Motores relacionales de `01. relational-database-engines` y procesamiento batch de `05. distributed-batch-processing`.
* **Course Boundary:** Comienza en la ineficiencia de los motores por filas para analítica y termina en la ejecución de agregaciones masivas vectorizadas sobre formato columnar.
* **Explicit Exclusions:** ❌ SIN streaming en tiempo real (tratado en `09`).
* **Problema Disparador:** Las bases de datos orientadas a filas son lentas procesando agregaciones (`SUM`, `AVG`) sobre miles de millones de registros. ¿Cómo almacenamos y procesamos datos por columnas usando instrucciones SIMD?
* **Dominio Técnico Comprehendido:** Almacenamiento y procesamiento analítico de datos (OLAP), formatos orientados a columnas (Apache Parquet), esquemas de compresión (RLE, Bit-Packing), procesamiento de consultas vectorizado (SIMD execution engine) y ejecución de consultas en memoria.
* **Artefacto / Modelo Mental Entregable:** Un motor de consultas analíticas OLAP con formato columnar comprimido por RLE y ejecución vectorizada SIMD.
* **Frontera de Entrada:** Comienza en la ineficiencia de los motores orientados a filas para analítica.
* **Frontera de Salida:** Termina en la ejecución de agregaciones masivas en segundos sobre Terabytes de datos.
* **Dependencias Directas:** `01. relational-database-engines`, `05. distributed-batch-processing`.

---

### 09. `stream-processing-systems` — Stream Processing Systems

* **Assumed Prerequisites:** Clústeres tolerantes a fallos de `06: 07. fault-tolerant-replication` y NoSQL de `04. distributed-nosql-databases`.
* **Course Boundary:** Comienza en el flujo ininterrumpido de eventos y termina en el cálculo de agregaciones continuas con estado y tolerancia a fallos.
* **Explicit Exclusions:** ❌ SIN bases de datos relacionales estáticas.
* **Problema Disparador:** Esperar a que los datos se guarden en disco para procesarlos introduce minutos de latencia. ¿Cómo calculamos agregaciones analíticas en tiempo real sobre flujos ininterrumpidos de eventos?
* **Dominio Técnico Comprehendido:** Procesamiento continuo de datos en tiempo real, log append-only distribuido (Kafka), semántica de mensajería (Exactly-once), ventanas de tiempo (Tumbling, Sliding, Session), marcadores (*Watermarks*) y estado gestionado con puntos de control (*Checkpoints / Chandy-Lamport*).
* **Artefacto / Modelo Mental Entregable:** Un motor de procesamiento de streams en tiempo real sobre Kafka con soporte para ventanas deslizantes y marcadores *Watermarks*.
* **Frontera de Entrada:** Comienza en el flujo ininterrumpido de eventos de entrada.
* **Frontera de Salida:** Termina en el cálculo de agregaciones analíticas continuas con estado y tolerancia a fallos.
* **Dependencias Directas:** `06: 07. fault-tolerant-replication`, `04. distributed-nosql-databases`.

---

### 10. `graph-database-engines` — Graph Database Engines

* **Assumed Prerequisites:** Algoritmos de Grafos de `02: 04. graph-algorithms` y Motores Relacionales de `01. relational-database-engines`.
* **Course Boundary:** Comienza en la ineficiencia de los Joins relacionales para consultar relaciones de $N$-saltos y termina en la construcción de motores de almacenamiento con Adyacencia Libre de Índice (*Index-Free Adjacency*).
* **Explicit Exclusions:** ❌ SIN bases de datos clave-valor simples (NoSQL).
* **Problema Disparador:** Consultar relaciones de múltiples saltos en bases de datos relacionales requiere Joins recursivos masivos que destruyen el rendimiento. ¿Cómo diseñamos motores de almacenamiento donde las relaciones sean punteros físicos directos entre registros?
* **Dominio Técnico Comprehendido:** El modelo de Grafos de Propiedades (*Property Graph Model*) vs RDF/Triplestores, Adyacencia Libre de Índice (*Index-Free Adjacency*), Disposición de datos en disco para nodos y aristas, Lenguajes de consulta de grafos (Cypher / SPARQL), Algoritmos de recorrido físico sobre disco e índices dobles.
* **Artefacto / Modelo Mental Entregable:** Un motor de base de datos de grafos orientado a disco con *Index-Free Adjacency* y ejecutor de consultas de recorridos en anchura/profundidad.
* **Frontera de Entrada:** Comienza en la ineficiencia de las consultas relacionales con múltiples Joins.
* **Frontera de Salida:** Termina en recorridos de grafos masivos en tiempo proporcional únicamente al tamaño del subgrafo visitado ($O(k)$).
* **Dependencias Directas:** `02: 04. graph-algorithms`, `01. relational-database-engines`.

---

### 11. `lakehouse-table-architectures` — Lakehouse Table Formats

* **Assumed Prerequisites:** Sistemas de archivos distribuidos de `03. distributed-file-systems` y Motores Columnares OLAP de `08. analytical-query-engines`.
* **Course Boundary:** Comienza en la falta de garantías ACID de los Data Lakes tradicionales sobre almacenamiento de objetos de red y termina en motores de almacenamiento analítico con transacciones ACID, viajes en el tiempo (*Time Travel*) y evolución de esquemas sobre archivos Parquet.
* **Explicit Exclusions:** ❌ SIN bases de datos relacionales OLTP mono-nodo.
* **Problema Disparador:** Almacenar archivos Parquet directamente en S3/HDFS no soporta escrituras concurrentes, actualizaciones ni borrados sin corromper las lecturas analíticas. ¿Cómo implementamos una capa de transacciones ACID sobre almacenamiento distribuido de objetos de red?
* **Dominio Técnico Comprehendido:** Arquitecturas Data Lakehouse, Formatos de tabla transaccionales (Delta Lake, Apache Iceberg, Apache Hudi), Registros de commits (*Commit Logs*) sobre almacenamiento de objetos, Aislamiento de lecturas/escrituras Optimista (OCC), Evolución de esquemas, Evolución de particiones sin reescritura de datos y Consultas de viaje en el tiempo (*Time-Travel Queries*).
* **Artefacto / Modelo Mental Entregable:** Un motor de formato de tabla Lakehouse sobre Parquet con registro de transacciones ACID (Commit Log) y soporte para Time Travel y aislamiento OCC.
* **Frontera de Entrada:** Comienza en la corrupción de datos resultante de modificar archivos Parquet directamente en almacenamiento de objetos.
* **Frontera de Salida:** Termina en un Data Lakehouse distribuido con garantías transaccionales ACID y evolutivas.
* **Dependencias Directas:** `03. distributed-file-systems`, `08. analytical-query-engines`.

---

### 12. `in-memory-caching-engines` — In-Memory Caching Engines

* **Assumed Prerequisites:** Asignadores de memoria en Heap de `01: 03. heap-memory-allocators` y Motores Relacionales de `01. relational-database-engines`.
* **Course Boundary:** Comienza en la latencia de acceso a bases de datos en disco y termina en la construcción de motores de caché en RAM de ultra-alta velocidad con políticas deterministas de evicción y persistencia asíncrona.
* **Explicit Exclusions:** ❌ SIN almacenamiento en bloques de disco VFS (Capa 04).
* **Problema Disparador:** Consultar bases de datos en disco o clústeres distribuidos para lecturas de alta frecuencia genera latencias de milisegundos inaceptables. ¿Cómo maquetamos almacenes de datos clave-valor en RAM con evicción automática de memoria y persistencia en segundo plano?
* **Dominio Técnico Comprehendido:** Motores de datos en RAM (estilo Redis/Memcached), layouts de estructuras de datos en memoria (dict, skiplists, ziplists), estrategias de caché (*Write-Through, Write-Back, Write-Around, Cache-Aside*), políticas de evicción de memoria (*LRU - Least Recently Used, LFU, ARC - Adaptive Replacement Cache, SLRU*), expiración con aleatorización y patrones de persistencia asíncrona en RAM (Instantáneas RDB, Append-Only Files AOF).
* **Artefacto / Modelo Mental Entregable:** Un motor de caché en memoria de ultra-baja latencia con políticas de evicción ARC/LRU y persistencia asíncrona en archivo AOF.
* **Frontera de Entrada:** Comienza en la latencia de acceso a disco/red de las bases de datos persistentes.
* **Frontera de Salida:** Termina en la respuesta a consultas de lectura en sub-milisegundos desde RAM con gestión estricta del límite de memoria.
* **Dependencias Directas:** `01: 03. heap-memory-allocators`, `01. relational-database-engines`.