# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 02

La Capa 02 establece la teoría formal del análisis asintótico y la organización eficiente de la información en memoria y almacenamiento secundario. Su dominio abarca la caracterización de complejidad espacio-temporal Big-O, las estructuras de datos lineales y jerárquicas auto-balanceadas, las estructuras persistentes inmutables, los algoritmos de ordenación y búsqueda, la teoría de grafos y flujo en redes, los paradigmas de optimización (Programación Dinámica, Algoritmos Voraces), los algoritmos espectrales (FFT), la compresión de datos sin pérdida, las estructuras probabilísticas sub-lineales, la geometría computacional, la indexación de cadenas de texto y las metaheurísticas combinatorias. Toda consideración de sintaxis de lenguaje, compilación o llamadas al sistema operativo se asume totalmente abstraída por las capas contiguas.

---

## 🟢 CAPA 02: Algorithmic Data Structures & Optimization
*(Ruta en sistema de archivos: `content/02-algorithmic-data-structures/`)*

---

### 01. `asymptotic-algorithm-analysis` — Asymptotic Algorithm Analysis

* **Assumed Prerequisites:** Punteros, referencias de memoria y control de flujo de `01: 01. imperative-programming-foundations`.
* **Course Boundary:** Comienza en la formalización matemática de cotas de complejidad espacio-temporal y termina en la caracterización formal de la ordenación por comparación, ordenación en tiempo lineal y ordenación externa.
* **Explicit Exclusions:** ❌ SIN recorridos complejos en grafos o flujo en redes (tratados en `04`), ❌ SIN programación dinámica (tratada en `05`).
* **Problema Disparador:** Medir el tiempo de ejecución en segundos depende del hardware y no escala. ¿Cómo caracterizamos matemáticamente la eficiencia de los algoritmos y demostramos los límites teóricos de ordenación?
* **Dominio Técnico Comprehendido:** Formalización asintótica (Notación Big-O, $\Omega$, $\Theta$), análisis de ecuaciones de recurrencia (Teorema Maestro, árbol de recursión), algoritmos de ordenación por comparación (Insertion, Selection, MergeSort, QuickSort), demostración matemática del límite inferior $\Omega(N \log N)$, ordenación en tiempo lineal en claves acotadas (Counting Sort, Radix Sort, Bucket Sort) y ordenación externa para datos que superan la RAM (*External MergeSort*).
* **Artefacto / Modelo Mental Entregable:** Demostración formal del límite inferior $\Omega(N \log N)$ e implementación de un motor de ordenación en tiempo lineal Radix Sort / External MergeSort.
* **Frontera de Entrada:** Comienza en la necesidad de medir la eficiencia algorítmica independientemente de la máquina.
* **Frontera de Salida:** Termina en la caracterización formal de complejidad de algoritmos y la suite completa de técnicas de ordenación.
* **Dependencias Directas:** `01: 01. imperative-programming-foundations`.

---

### 02. `fundamental-data-structures` — Fundamental Data Structures

* **Assumed Prerequisites:** Anotación y análisis asintótico de `01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la organización contigua e indirecta de datos lineales en memoria y termina en la construcción y análisis de operaciones atómicas sobre estructuras fundamentales y tablas hash.
* **Explicit Exclusions:** ❌ SIN algoritmos de ordenación (tratados en `01`), ❌ SIN árboles auto-balanceados complejos (AVL/Red-Black), ❌ SIN análisis asintótico avanzado de grafos.
* **Problema Disparador:** Guardar datos sin estructura hace que buscarlos requiera recorrer toda la memoria en $O(N)$. ¿Cómo organizamos los datos contigua e indirectamente para optimizar accesos atómicos y la expansión dinámica de memoria?
* **Dominio Técnico Comprehendido:** Arrays contiguos, arrays dinámicos, análisis amortizado de expansión de memoria (método del contable), listas enlazadas (simples, dobles, circulares), pilas (stacks), colas (queues), tablas hash (encadenamiento y direccionamiento abierto con sondeo lineal/cuadrático) y árboles binarios de búsqueda elementales (BST).
* **Artefacto / Modelo Mental Entregable:** Una tabla hash con direccionamiento abierto y sondeo cuadrático optimizada para acceso $O(1)$ y un array dinámico con análisis de expansión amortizada.
* **Frontera de Entrada:** Comienza en la representación contigua e indirecta en memoria de la Capa 01.
* **Frontera de Salida:** Termina en el análisis de complejidad de operaciones atómicas (inserción, borrado, búsqueda) sobre estructuras fundamentales.
* **Dependencias Directas:** `01. asymptotic-algorithm-analysis`.

---

### 03. `hierarchical-data-structures` — Hierarchical Data Structures

* **Assumed Prerequisites:** Estructuras lineales y árboles BST elementales de `02. fundamental-data-structures`.
* **Course Boundary:** Comienza en la necesidad de mantener el balanceo de árboles y optimizar transferencias de bloques de memoria y termina en las jerarquías auto-balanceadas complejas, colas de prioridad y modelos de complejidad I/O.
* **Explicit Exclusions:** ❌ SIN representaciones de grafos (tratadas en `04`), ❌ SIN estructuras probabilísticas sub-lineales, ❌ SIN estructuras espaciales 2D/3D.
* **Problema Disparador:** Los árboles BST se desbalancean perdiendo su rendimiento $O(\log N)$, y el acceso a memoria secundaria en jerarquías de almacenamiento requiere minimizar transferencias en bloque. ¿Cómo representamos jerarquías auto-balanceadas optimizadas para bloques $O(\log_B N)$ y colas de prioridad eficientes?
* **Dominio Técnico Comprehendido:** Árboles auto-balanceados (AVL, Red-Black Trees), árboles B y B+ Trees (división, fusión, rotaciones de nodos y modelo de complejidad I/O de Aggarwal-Vitter $O(\log_B N)$), maquetación *Cache-Oblivious* (van Emde Boas layout), Heaps / Colas de Prioridad (Binary Heap, Min/Max Heap, Fibonacci Heap), Tries (árboles de prefijos) y Disjoint-Set / Union-Find (compresión de caminos y unión por rango).
* **Artefacto / Modelo Mental Entregable:** Un árbol B+ Tree en memoria capaz de mantener su balanceo mediante divisiones y fusiones de nodos optimizado para I/O en bloque y una estructura Union-Find optimizada.
* **Frontera de Entrada:** Comienza en la necesidad de mantener el balanceo de árboles en tiempo $O(\log N)$.
* **Frontera de Salida:** Termina en estructuras complejas de búsqueda en memoria/bloques y conjuntos disjuntos.
* **Dependencias Directas:** `02. fundamental-data-structures`.

---

### 04. `graph-algorithms` — Graph Algorithms

* **Assumed Prerequisites:** Estructuras jerárquicas y conjuntos disjuntos de `03. hierarchical-data-structures` y análisis asintótico de `01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la representación de grafos y exploración sistemática de vértices/aristas y termina en la resolución de problemas de flujo máximo y cortes mínimos en redes dirigidas.
* **Explicit Exclusions:** ❌ SIN búsquedas heurísticas A* (tratadas en `10`), ❌ SIN demostraciones formales de NP-Completitud (Capa 03).
* **Problema Disparador:** Modelar conexiones en redes de transporte o datos genera problemas de rutas mínimas y cuellos de botella de capacidad. ¿Cómo representamos grafos y calculamos caminamientos óptimos y capacidad máxima de transferencia en redes masivas?
* **Dominio Técnico Comprehendido:** Representación de Grafos (matriz de adyacencia, lista de adyacencia, listas de aristas), recorridos fundamentales (BFS, DFS, ordenación topológica, componentes fuertemente conexas / Tarjan), caminos mínimos de origen único y todos contra todos (Dijkstra con Fibonacci Heap, Bellman-Ford, Floyd-Warshall), árboles de expansión mínima (Prim, Kruskal), flujo en redes (redes residuales, algoritmo de Ford-Fulkerson, Edmonds-Karp) y el Teorema del Corte Mínimo / Flujo Máximo (*Min-Cut / Max-Flow*).
* **Artefacto / Modelo Mental Entregable:** Un solver de flujo máximo en redes basado en Edmonds-Karp / Ford-Fulkerson con cálculo de cortes mínimos sobre un grafo dirigido.
* **Frontera de Entrada:** Comienza en las estructuras de representación de grafos (listas y matrices de adyacencia).
* **Frontera de Salida:** Termina en la resolución de problemas de conectividad, rutas mínimas y flujo óptimo en redes.
* **Dependencias Directas:** `01. asymptotic-algorithm-analysis`, `03. hierarchical-data-structures`.

---

### 05. `optimal-substructure-algorithms` — Optimal Substructure Algorithms

* **Assumed Prerequisites:** Análisis asintótico y recursión de `01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la ineficiencia de la evaluación recursiva de subproblemas solapados y termina en la construcción de soluciones óptimas mediante programación dinámica y decisiones voraces estructuradas.
* **Explicit Exclusions:** ❌ SIN metaheurísticas de búsqueda aproximada (tratadas en `10`).
* **Problema Disparador:** Calcular combinaciones mediante recursión naive genera explosión exponencial $O(2^N)$ por re-evaluar los mismos estados. ¿Cómo transformamos algoritmos exponenciales en tiempo polinomial reutilizando resultados intermedios o tomando decisiones voraces demostrables?
* **Dominio Técnico Comprehendido:** Principio de Subestructura Óptima, Paradigma Divide y Vencerás, Programación Dinámica (subproblemas solapados, enfoque Top-Down con memoización vs Bottom-Up con tabulación), optimización de espacio de estados, Algoritmos Voraces (*Greedy Choice Property*), matroides y pruebas de optimalidad voraz.
* **Artefacto / Modelo Mental Entregable:** Un motor de Programación Dinámica con tabulación y optimización de espacio de memoria para la resolución de un problema combinatorio complejo (ej. Knapsack / Edit Distance).
* **Frontera de Entrada:** Comienza en la explosión exponencial de la recursión naive sobre subproblemas solapados.
* **Frontera de Salida:** Termina en la reducción de problemas exponenciales a soluciones de tiempo polinomial óptimo.
* **Dependencias Directas:** `01. asymptotic-algorithm-analysis`.

---

### 06. `spectral-transform-algorithms` — Spectral Transform Algorithms

* **Assumed Prerequisites:** Arrays, arreglos bidimensionales y análisis asintótico de `01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la ineficiencia de la multiplicación cuadrática de polinomios y matrices y termina en el cálculo de la Transformada Rápida de Fourier ($O(N \log N)$) y algoritmos numéricos en tiempo sub-cuadrático.
* **Explicit Exclusions:** ❌ SIN renderizado gráfico por GPU (Capa 10), ❌ SIN física de ondas.
* **Problema Disparador:** Multiplicar polinomios de grado $N$ o matrices de $N \times N$ de forma directa requiere $O(N^2)$ u $O(N^3)$ operaciones, lo que imposibilita el procesamiento masivo de datos continuos. ¿Cómo transformamos el dominio de representación para operar en tiempo espectral $O(N \log N)$?
* **Dominio Técnico Comprehendido:** Multiplicación de enteros masivos y polinomios, la Transformada Discreta de Fourier (DFT), el algoritmo de la Transformada Rápida de Fourier (FFT - Cooley-Tukey $O(N \log N)$), convolución de señales discretas por FFT, multiplicación rápida de matrices (Algoritmo de Strassen) y técnicas de paralelismo a nivel de bit (*Bit-Parallelism*).
* **Artefacto / Modelo Mental Entregable:** Una implementación completa desde cero del algoritmo FFT (Cooley-Tukey) para la convolución y multiplicación de polinomios en $O(N \log N)$.
* **Frontera de Entrada:** Comienza en la ineficiencia de los métodos algebraicos cuadráticos tradicionales.
* **Frontera de Salida:** Termina en la capacidad de transformar y procesar datos discretos en el dominio frecuencial en tiempo $O(N \log N)$.
* **Dependencias Directas:** `01. asymptotic-algorithm-analysis`.

---

### 07. `probabilistic-data-structures` — Probabilistic Data Structures

* **Assumed Prerequisites:** Tablas hash de `02. fundamental-data-structures` y análisis de complejidad de `01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la saturación de RAM de las estructuras deterministas y termina en la estimación probabilística de cardinalidad, frecuencia y pertenencia en espacio sub-lineal $O(1)$.
* **Explicit Exclusions:** ❌ SIN compresión general de ficheros (tratada en `12`), ❌ SIN indexación vectorial de alta dimensión (Capa 07).
* **Problema Disparador:** Cuando los datos superan Terabytes de memoria, las tablas hash deterministas agotan la RAM. ¿Cómo estimamos pertenencia de elementos y cardinalidad de conjuntos usando espacio sub-lineal a cambio de un margen de error acotado?
* **Dominio Técnico Comprehendido:** Estructuras de datos sub-lineales con margen de error acotado: Filtros de Bloom (pertenencia con falsos positivos), Cuckoo Filters, Count-Min Sketch (frecuencia de elementos en flujos), HyperLogLog (cardinalidad de conjuntos disjuntos mediante estimación de bits de ceros a la izquierda), Skip Lists y muestreo reservorio (*Reservoir Sampling*).
* **Artefacto / Modelo Mental Entregable:** Un Filtro de Bloom funcional configurado para garantizar una probabilidad de falsos positivos inferior al $1\%$ y un estimador de cardinalidad HyperLogLog.
* **Frontera de Entrada:** Comienza en el límite de memoria donde las tablas hash deterministas no caben en RAM.
* **Frontera de Salida:** Termina en la estimación de cardinalidad, pertenencia y frecuencia en $O(1)$ sobre flujos masivos.
* **Dependencias Directas:** `01. asymptotic-algorithm-analysis`, `02. fundamental-data-structures`.

---

### 08. `computational-geometry` — Computational Geometry

* **Assumed Prerequisites:** Árboles de `03. hierarchical-data-structures` y análisis asintótico de `01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en las primitivas geométricas 2D/3D y termina en la subdivisión espacial y localización de puntos eficiente.
* **Explicit Exclusions:** ❌ SIN renderizado gráfico 3D por GPU o sombreadores GLSL (Capa 10).
* **Problema Disparador:** Buscar objetos cercanos en espacios de 2D/3D mediante comparaciones todos contra todos es $O(N^2)$. ¿Cómo subdividimos el espacio geométrico para realizar consultas de proximidad eficientes?
* **Dominio Técnico Comprehendido:** Algoritmos geométricos 2D/3D, Cierre Convexo (*Convex Hull* - Graham Scan, Jarvis March), Intersección por barrido (*Line Sweep / Bentley-Ottmann*), Triangulación de Delaunay, Diagramas de Voronoi, localización de puntos y estructuras espaciales (k-d Trees, R-Trees, Quadtrees, Octrees).
* **Artefacto / Modelo Mental Entregable:** Una estructura espacial k-d Tree / R-Tree para la búsqueda acelerada de los $K$ vecinos más cercanos en espacios 2D/3D.
* **Frontera de Entrada:** Comienza en las primitivas geométricas (puntos, vectores, segmentos).
* **Frontera de Salida:** Termina en la subdivisión espacial eficiente del plano y el espacio para consultas de proximidad.
* **Dependencias Directas:** `01. asymptotic-algorithm-analysis`, `03. hierarchical-data-structures`.

---

### 09. `string-indexing-algorithms` — String Indexing Algorithms

* **Assumed Prerequisites:** Codificación UTF-8/ASCII de `01: 02. binary-data-representations` y análisis algorítmico de `01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la ineficiencia de la búsqueda de subcadenas naive y termina en la indexación comprimida de texto en tiempo lineal $O(N)$.
* **Explicit Exclusions:** ❌ SIN compresión general de archivos ZIP/Zstd (tratada en `12`), ❌ SIN procesamiento de lenguaje natural semántico (NLP, Capa 10).
* **Problema Disparador:** Buscar subcadenas o patrones en genomas o textos masivos en $O(N \times M)$ es inviable. ¿Cómo indexamos y procesamos secuencias de texto en tiempo lineal $O(N)$?
* **Dominio Técnico Comprehendido:** Búsqueda exacta de patrones (Knuth-Morris-Pratt, Boyer-Moore, Rabin-Karp), Autómatas de Aho-Corasick para múltiples patrones, Árboles de Sufijos (*Suffix Trees*), Arrays de Sufijos (*Suffix Arrays*), Matriz LCP y la Transformada de Burrows-Wheeler (BWT / FM-Index).
* **Artefacto / Modelo Mental Entregable:** Un índice comprimido FM-Index basado en Burrows-Wheeler Transform para la búsqueda instantánea de patrones en grandes textos.
* **Frontera de Entrada:** Comienza en la ineficiencia de la búsqueda de subcadenas naive $O(N \times M)$.
* **Frontera de Salida:** Termina en la indexación comprimida de texto en tiempo lineal $O(N)$.
* **Dependencias Directas:** `01: 02. binary-data-representations`, `01. asymptotic-algorithm-analysis`.

---

### 10. `heuristic-combinatorial-optimization` — Heuristic Combinatorial Optimization

* **Assumed Prerequisites:** Algoritmos sobre grafos de `04. graph-algorithms` y estructuras óptimas de `05. optimal-substructure-algorithms`.
* **Course Boundary:** Comienza en los límites de los algoritmos exactos ante problemas NP-Duros y termina en metaheurísticas de optimización global.
* **Explicit Exclusions:** ❌ SIN modelos de aprendizaje automático / redes neuronales (Capa 10).
* **Problema Disparador:** Muchos problemas reales de ingeniería son NP-Duros y no pueden resolverse de forma exacta en tiempo razonable. ¿Cómo encontramos soluciones casi óptimas mediante búsqueda heurística en espacios combinatorios masivos?
* **Dominio Técnico Comprehendido:** Búsqueda en espacios combinatorios masivos (TSP, Knapsack, Graph Coloring), Búsqueda Local, Algoritmo A*, Ramificación y Acotación (*Branch and Bound*), Metaheurísticas (Enfriamiento Simulado, Búsqueda Tabú) y Algoritmos Genéticos / Evolutivos.
* **Artefacto / Modelo Mental Entregable:** Un motor de optimización heurística basado en Algoritmos Genéticos para la resolución del Problema del Viajante (TSP).
* **Frontera de Entrada:** Comienza en la abordabilidad de problemas NP-Duros mediante aproximación.
* **Frontera de Salida:** Termina en algoritmos de optimización global para problemas combinatorios complejos.
* **Dependencias Directas:** `04. graph-algorithms`, `05. optimal-substructure-algorithms`.

---

### 11. `persistent-data-structures` — Persistent Data Structures

* **Assumed Prerequisites:** Estructuras lineales de `02. fundamental-data-structures` e Inmutabilidad de `01: 07. functional-programming-paradigm`.
* **Course Boundary:** Comienza en la ineficiencia de copiar datos completos para garantizar inmutabilidad y termina en la construcción de estructuras de datos totalmente persistentes (*Fully Persistent*) con acceso $O(\log N)$ u $O(1)$ amortizado mediante compartición estructural de memoria.
* **Explicit Exclusions:** ❌ SIN motores de bases de datos persistentes en disco (Capa 07).
* **Problema Disparador:** En entornos inmutables y concurrentes, modificar un elemento en un array o árbol requiere duplicar toda la estructura, destruyendo el rendimiento de la memoria. ¿Cómo mantenemos acceso a todas las versiones históricas de una estructura modificándola sin hacer copias completas?
* **Dominio Técnico Comprehendido:** Compartición estructural de nodos (*Structural Node Sharing / Path Copying*), Ephemeral vs Persistent Data Structures, Parcialmente Persistente vs Totalmente Persistente vs Confluente, Árboles de Dedos (*Finger Trees*), *Hash Array Mapped Tries* (HAMT), *Bitmapped Vector Tries* (usados en la memoria inmutable de Clojure/Scala) y técnicas de recolección de basura de nodos inalcanzables.
* **Artefacto / Modelo Mental Entregable:** Un vector inmutable de alto rendimiento basado en *Bitmapped Vector Tries* de 32 vías con compartición estructural de caminos (*Path Copying*).
* **Frontera de Entrada:** Comienza en el coste $O(N)$ de copiar estructuras de datos para preservar el estado anterior.
* **Frontera de Salida:** Termina en la mutación persistente en $O(\log_B N)$ garantizando la integridad de versiones históricas.
* **Dependencias Directas:** `01: 07. functional-programming-paradigm`, `02. fundamental-data-structures`.

---

### 12. `data-compression-algorithms` — Data Compression Algorithms

* **Assumed Prerequisites:** Representación binaria de bytes de `01: 02. binary-data-representations` y análisis algorítmico de `01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la transmisión y almacenamiento de bytes no estructurados y termina en la reducción de entropía mediante algoritmos de compresión sin pérdida basados en estadística y diccionarios.
* **Explicit Exclusions:** ❌ SIN compresión con pérdida de audio/vídeo/imagen (Capa 10), ❌ SIN cifrado o encriptación criptográfica (Capa 08).
* **Problema Disparador:** Transmitir y almacenar streams de bytes crudos consume un ancho de banda y espacio de memoria prohibitivos. ¿Cómo reducimos la entropía de los datos sin perder un solo bit de información identificando patrones estadísticos y redundancia de secuencias?
* **Dominio Técnico Comprehendido:** Teoría de la Información y entropía de Shannon, codificación estadística (Codificación de Huffman, Codificación Aritmética), codificación por diccionario (LZ77, LZ78, LZW), Run-Length Encoding (RLE), la Transformada Move-To-Front (MTF) y la combinación de transformadas en pipelines de compresión (LZ77 + Huffman / DEFLATE).
* **Artefacto / Modelo Mental Entregable:** Un motor de compresión y descompresión de datos sin pérdida (*Lossless Compressor*) en C/Rust que implementa el algoritmo LZ77 acoplado a un codificador de entropía de Huffman.
* **Frontera de Entrada:** Comienza en el stream contiguo de bytes crudos con redundancia de información.
* **Frontera de Salida:** Termina en el empaquetado comprimido determinista con descompresión exacta bit a bit.
* **Dependencias Directas:** `01: 02. binary-data-representations`, `01. asymptotic-algorithm-analysis`.