# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 10

La Capa 10 establece la aplicación computacional avanzada de frontera sobre dominios específicos. Su dominio abarca los modelos de aprendizaje profundo y Transformers, la mecánica interna de motores de diferenciación automática (*Autograd*), la ingeniería de sistemas de aprendizaje automático (MLOps), los pipelines de renderizado gráfico 3D acelerados por hardware, la arquitectura interna de motores de videojuegos, las canalizaciones de procesamiento de lenguaje natural y servido de LLMs cuantizados, el procesamiento computacional de audio y voz, los algoritmos de visión por computador, la navegación espacial y control robótico (SLAM/MPC), el aprendizaje por refuerzo y alineamiento de agentes, la supercomputación masivamente paralela (HPC), los modelos de computación cuántica, la genómica computacional y las arquitecturas generativas de difusión estocástica.

---

## 🟢 CAPA 10: Applied Specializations: AI, Graphics, Robotics & Supercomputing
*(Ruta en sistema de archivos: `content/10-applied-specializations/`)*

---

### 01. `neural-network-architectures` — Neural Network Architectures

* **Assumed Prerequisites:** Microarquitectura CPU/GPU de `00: 03. cpu-microarchitecture` y análisis asintótico de `02: 01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la combinación lineal de entradas y pesos y termina en la arquitectura bloque a bloque de modelos Transformer y mecanismos de atención.
* **Explicit Exclusions:** ❌ SIN implementación interna del autograd del framework (tratada en `02`).
* **Problema Disparador:** Algoritmos tradicionales no pueden aprender representaciones complejas no lineales. ¿Cómo construimos y optimizamos redes neuronales profundas mediante gradientes y mecanismos de atención?
* **Dominio Técnico Comprehendido:** Fundamentos de redes neuronales, el Perceptrón, capas Dense, funciones de activación (ReLU/GELU), loss functions, optimización (SGD/Adam), CNNs (filtros/pooling), RNNs/LSTMs y Mecanismos de Atención y Transformers (Self/Multi-Head Attention).
* **Artefacto / Modelo Mental Entregable:** Un bloque Transformer (*Multi-Head Attention*) completo implementado desde cero para aprendizaje de representaciones.
* **Frontera de Entrada:** Comienza en la combinación lineal de entradas y pesos.
* **Frontera de Salida:** Termina en la arquitectura de un Transformer bloque a bloque.
* **Dependencias Directas:** `00: 03. cpu-microarchitecture`, `02: 01. asymptotic-algorithm-analysis`.

---

### 02. `deep-learning-framework-internals` — Deep Learning Framework Internals

* **Assumed Prerequisites:** Arquitecturas de redes neuronales de `01. neural-network-architectures`.
* **Course Boundary:** Comienza en la abstracción del tensor y termina en la ejecución paralela multi-GPU y aceleración por matrices sistólicas NPU.
* **Explicit Exclusions:** ❌ SIN entrenamiento de modelos de texto específicos (NLP, tratados en `06`).
* **Problema Disparador:** Calcular gradientes a mano para miles de millones de parámetros en clústeres multi-GPU es imposible. ¿Cómo funcionan los motores de diferenciación automática (*Autograd*), la fusión de kernels y la distribución de tensores?
* **Dominio Técnico Comprehendido:** Mecánica interna de motores de Deep Learning (PyTorch internals), grafos de computación dinámica vs estática, diferenciación automática (*Autograd - Forward/Reverse Mode*), kernels personalizados CUDA/Triton, kernels fusionados, precisión mixta (FP16/BF16), matrices sistólicas (*Systolic Arrays*) en NPUs y entrenamiento distribuido multi-GPU (FSDP - Fully Sharded Data Parallel, Paralelismo de Tensor y Pipeline).
* **Artefacto / Modelo Mental Entregable:** Un motor de diferenciación automática (*Autograd*) con grafo dinámico, kernel personalizado Triton/CUDA y distribución de tensores FSDP.
* **Frontera de Entrada:** Comienza en la abstracción del tensor.
* **Frontera de Salida:** Termina en la ejecución de pasadas hacia adelante/atrás (*Forward/Backward*) hiper-optimizadas en GPU/NPU multi-nodo.
* **Dependencias Directas:** `01. neural-network-architectures`.

---

### 03. `machine-learning-systems-engineering` — Machine Learning Systems Engineering

* **Assumed Prerequisites:** Motores analíticos OLAP de `07: 08. analytical-query-engines`, patrones de arquitectura de `09: 01. software-architecture-patterns` e internos de DL de `02. deep-learning-framework-internals`.
* **Course Boundary:** Comienza en los datos crudos en producción y termina en la automatización del ciclo de vida de ingestión, registro, despliegue y detección de deriva de modelos ML.
* **Explicit Exclusions:** ❌ SIN derivaciones matemáticas abstractas de modelos.
* **Problema Disparador:** Los modelos de aprendizaje automático degradan su rendimiento cuando los datos del mundo real cambian (*Data Drift*). ¿Cómo automatizamos el ciclo de vida de ingestión, entrenamiento y servido de ML?
* **Dominio Técnico Comprehendido:** MLOps, ingestión y limpieza de datos, almacenes de características (*Feature Stores*), registro y versión de modelos (MLflow), validación de datos, despliegue de inferencia y detección de deriva de datos (*Data Drift*).
* **Artefacto / Modelo Mental Entregable:** Un pipeline MLOps con Feature Store automatizado, monitoreo de Data Drift y reentrenamiento continuo.
* **Frontera de Entrada:** Comienza en los datos crudos en producción.
* **Frontera de Salida:** Termina en el mantenimiento de modelos de ML sirviendo predicciones fiables con monitorización continua.
* **Dependencias Directas:** `07: 08. analytical-query-engines`, `09: 01. software-architecture-patterns`, `02. deep-learning-framework-internals`.

---

### 04. `computer-graphics-pipelines` — Computer Graphics Pipelines

* **Assumed Prerequisites:** Microarquitectura CPU/GPU de `00: 03. cpu-microarchitecture` y algoritmos geométricos de `02: 08. computational-geometry`.
* **Course Boundary:** Comienza en la representación de mallas 3D de vértices y termina en la rasterización y sombreado fotorrealista en tiempo real por GPU.
* **Explicit Exclusions:** ❌ SIN visión por computador / análisis de imágenes del mundo real (tratado en `08`).
* **Problema Disparador:** ¿Cómo transformamos mallas de vértices 3D en imágenes bidimensionales fotorrealistas en tiempo real mediante la pipeline acelerada por hardware de la GPU?
* **Dominio Técnico Comprehendido:** Gráficos 3D, pipeline de rasterización por hardware, transformaciones 3D, Shaders (Vertex/Fragment en GLSL/HLSL), Z-Buffering, iluminación PBR y Ray Tracing por hardware.
* **Artefacto / Modelo Mental Entregable:** Un pipeline de renderizado 3D acelerado por hardware con sombreador PBR y motor de Ray Tracing en GPU.
* **Frontera de Entrada:** Comienza en la representación matemática de una malla 3D de vértices.
* **Frontera de Salida:** Termina en la rasterización y sombreado de fotogramas en tiempo real en la GPU.
* **Dependencias Directas:** `00: 03. cpu-microarchitecture`, `02: 08. computational-geometry`.

---

### 05. `game-engine-architecture` — Game Engine Architecture

* **Assumed Prerequisites:** Pipeline de renderizado 3D de `04. computer-graphics-pipelines`.
* **Course Boundary:** Comienza en la toma del pipeline gráfico y el bucle de eventos y termina en la simulación interactiva determinista de mundos virtuales 3D.
* **Explicit Exclusions:** ❌ SIN modelado de imágenes por IA generativa (tratada en `14`).
* **Problema Disparador:** Gestionar el estado, la física y el renderizado de miles de objetos interactivos en tiempo real requiere un desacoplamiento extremo. ¿Cómo estructuramos un motor de videojuegos interactivo?
* **Dominio Técnico Comprehendido:** Arquitectura interna de motores de juegos en tiempo real, Game Loop, patrón Entity-Component-System (ECS), detección de colisiones 3D y simuladores de física de cuerpos rígidos.
* **Artefacto / Modelo Mental Entregable:** Un motor de juego interactivo en tiempo real basado en arquitectura ECS con simulador de física de cuerpos rígidos.
* **Frontera de Entrada:** Comienza en la toma del pipeline de renderizado y el bucle de eventos.
* **Frontera de Salida:** Termina en la simulación interactiva determinista de mundos virtuales 3D.
* **Dependencias Directas:** `04. computer-graphics-pipelines`.

---

### 06. `natural-language-processing-pipelines` — Natural Language Processing Pipelines

* **Assumed Prerequisites:** Motores de búsqueda de texto de `07: 06. full-text-search-engines` e internos de autograd/DL de `02. deep-learning-framework-internals`.
* **Course Boundary:** Comienza en el texto plano de entrada y termina en la infraestructura de inferencia y servido distribuido de LLMs cuantizados a gran escala.
* **Explicit Exclusions:** ❌ SIN visión por computador (tratada en `08`).
* **Problema Disparador:** Inferir modelos de lenguaje de 70 mil millones de parámetros agota la VRAM de la GPU. ¿Cómo optimizamos la atención, la cuantización, el paralelismo de tensores y la gestión de memoria (*PagedAttention*) para servirlos a escala?
* **Dominio Técnico Comprehendido:** Procesamiento de lenguaje natural y LLMs, tokenización BPE, Embeddings, GPT/T5, Fine-Tuning (LoRA, QLoRA), cuantización de modelos (AWQ, GPTQ, INT8/INT4), paralelismo de tenores para inferencia distribuida, optimización de inferencia de LLMs (vLLM, PagedAttention, KV-Cache) y RAG.
* **Artefacto / Modelo Mental Entregable:** Un servidor de inferencia de LLM distribuido de alta velocidad con cuantización AWQ, PagedAttention, KV-Cache y motor RAG vectorial.
* **Frontera de Entrada:** Comienza en el texto plano de entrada.
* **Frontera de Salida:** Termina en la infraestructura de inferencia y servido de un LLM optimizado a gran escala.
* **Dependencias Directas:** `07: 06. full-text-search-engines`, `02. deep-learning-framework-internals`.

---

### 07. `computational-audio-processing` — Computational Audio Processing

* **Assumed Prerequisites:** Internos de autograd y DL de `02. deep-learning-framework-internals`.
* **Course Boundary:** Comienza en la forma de onda de audio discreta y termina en la transcripción y generación de voz en tiempo real.
* **Explicit Exclusions:** ❌ SIN visión por computador.
* **Problema Disparador:** Las ondas de audio son señales temporales continuas con ruido. ¿Cómo las transformamos en representaciones espectrales para transcripción y síntesis de voz en tiempo real?
* **Dominio Técnico Comprehendido:** Procesamiento computacional de voz y sonido, espectrogramas, MFCCs, ASR (Whisper), TTS (FastSpeech) y vocoders neuronales.
* **Artefacto / Modelo Mental Entregable:** Un pipeline de transcripción de voz (ASR) y síntesis vocal (TTS) en tiempo real mediante vocoders neuronales.
* **Frontera de Entrada:** Comienza en la forma de onda de audio discreta.
* **Frontera de Salida:** Termina en la transcripción y generación de voz en tiempo real.
* **Dependencias Directas:** `02. deep-learning-framework-internals`.

---

### 08. `computer-vision-algorithms` — Computer Vision Algorithms

* **Assumed Prerequisites:** Internos de DL de `02. deep-learning-framework-internals` y gráficos 3D de `04. computer-graphics-pipelines`.
* **Course Boundary:** Comienza en el array de píxeles de una cámara y termina en la comprensión espacial y detección/segmentación en tiempo real.
* **Explicit Exclusions:** ❌ SIN modelos de difusión generativos (tratados en `14`).
* **Problema Disparador:** ¿Cómo extraemos significado espacial, segmentamos escenas y detectamos objetos a partir de arrays bidimensionales de píxeles en tiempo real?
* **Dominio Técnico Comprehendido:** Procesamiento de imágenes/vídeo, convolución 2D/3D, YOLO, U-Net, estimación de pose, segmentación semántica/panóptica, cuantización para Edge AI.
* **Artefacto / Modelo Mental Entregable:** Un sistema de visión por computador para detección de objetos y segmentación semántica en tiempo real (YOLO / U-Net).
* **Frontera de Entrada:** Comienza en el array de píxeles de una cámara.
* **Frontera de Salida:** Termina en la comprensión espacial y segmentación en tiempo real.
* **Dependencias Directas:** `02. deep-learning-framework-internals`, `04. computer-graphics-pipelines`.

---

### 09. `spatial-robot-navigation` — Spatial Robot Navigation

* **Assumed Prerequisites:** Algoritmos geométricos de `02: 08. computational-geometry` y visión por computador de `08. computer-vision-algorithms`.
* **Course Boundary:** Comienza en la señal sensorial de sensores espaciales (LIDAR, cámaras) y termina en la trayectoria de navegación autónoma y control digital de actuadores sobre mapas 3D.
* **Explicit Exclusions:** ❌ SIN diseño de actuadores hidráulicos o piezas mecánicas.
* **Problema Disparador:** Un agente móvil en un entorno desconocido no sabe dónde está ni cómo traducir la trayectoria deseada en señales de control precisas para sus motores. ¿Cómo construimos mapas 3D, estimamos la posición y aplicamos bucles de control digital bajo incertidumbre sensorial?
* **Dominio Técnico Comprehendido:** Navegación espacial de agentes autónomos, cinemática directa e inversa, espacio de configuración, SLAM, Filtros de Kalman Extendidos (EKF), Filtros de Partículas (*Monte Carlo Localization*), planificación de trayectorias y Teoría de Control Discreto (Controladores PID, LQR y Control Predictivo basado en Modelos - MPC).
* **Artefacto / Modelo Mental Entregable:** Un sistema de navegación robótica autónoma SLAM con Filtro de Kalman Extendido (EKF), Filtro de Partículas, planificación de trayectorias y bucle de control discreto PID/MPC.
* **Frontera de Entrada:** Comienza en la señal sensorial de sensores espaciales (LIDAR, cámaras).
* **Frontera de Salida:** Termina en la trayectoria de movimiento segura y autónoma ejecutada por control digital.
* **Dependencias Directas:** `02: 08. computational-geometry`, `08. computer-vision-algorithms`.

---

### 10. `reinforcement-learning-systems` — Reinforcement Learning Systems

* **Assumed Prerequisites:** Internos de DL y diferenciación automática de `02. deep-learning-framework-internals`.
* **Course Boundary:** Comienza en la interacción Agente-Entorno (Estado, Acción, Recompensa) y termina en el alineamiento y toma de decisiones autónomas en entornos complejos.
* **Explicit Exclusions:** ❌ SIN robótica de hardware físico industrial.
* **Problema Disparador:** En entornos dinámicos no existen datos supervisados etiquetados. ¿Cómo enseñamos a un agente a tomar secuencias de decisiones óptimas mediante prueba, error y recompensa?
* **Dominio Técnico Comprehendido:** Toma de decisiones autónomas por recompensa, MDPs, Q-Learning, DQN, PPO, SAC, simulación paralela en GPU y alineamiento mediante RLHF / DPO.
* **Artefacto / Modelo Mental Entregable:** Un agente de Aprendizaje por Refuerzo entrenado mediante PPO / RLHF para toma de decisiones en entornos complejos.
* **Frontera de Entrada:** Comienza en la interacción Agente-Entorno (Estado, Acción, Recompensa).
* **Frontera de Salida:** Termina en el entrenamiento de agentes complejos para robótica, juegos y alineamiento de LLMs.
* **Dependencias Directas:** `02. deep-learning-framework-internals`.

---

### 11. `high-performance-computing` — High Performance Computing

* **Assumed Prerequisites:** Microarquitectura CPU de `00: 03. cpu-microarchitecture` y análisis asintótico de `02: 01. asymptotic-algorithm-analysis`.
* **Course Boundary:** Comienza en la saturación de un solo nodo de computación y termina en el escalado paralelo masivo a escala Petaflop con MPI y OpenMP.
* **Explicit Exclusions:** ❌ SIN teoría cuántica (tratada en `12`).
* **Problema Disparador:** Las aplicaciones de simulación científica agotan los recursos de un solo supernodo. ¿Cómo escalamos cómputo en paralelo a través de miles de nodos con comunicación InfiniBand?
* **Dominio Técnico Comprehendido:** Supercomputación, MPI (Message Passing Interface), OpenMP, optimización NUMA, interconexiones InfiniBand y algoritmos paralelos a escala Petaflop.
* **Artefacto / Modelo Mental Entregable:** Un algoritmo de simulación paralelo masivo programado en MPI + OpenMP para ejecución en supercomputadores.
* **Frontera de Entrada:** Comienza en la saturación de un solo nodo de computación.
* **Frontera de Salida:** Termina en el escalado de aplicaciones científicas e industriales a través de miles de nodos en supercomputadores.
* **Dependencias Directas:** `00: 03. cpu-microarchitecture`, `02: 01. asymptotic-algorithm-analysis`.

---

### 12. `quantum-computing-models` — Quantum Computing Models

* **Assumed Prerequisites:** Puertas lógicas discretas de `00: 01. digital-logic-design`, Computabilidad de `03: 07. computability-theory` y Complejidad de `03: 08. computational-complexity-theory`.
* **Course Boundary:** Comienza en la representación vectorial de qubits y termina en la ejecución de circuitos algorítmicos cuánticos con ventaja clásica.
* **Explicit Exclusions:** ❌ SIN física cuántica experimental de laboratorio (láseres, trampas de iones).
* **Problema Disparador:** Existen problemas de factorización y simulación molecular que llevarían miles de años a supercomputadores clásicos. ¿Cómo calculamos usando superposición y entrelazamiento cuántico?
* **Dominio Técnico Comprehendido:** Información cuántica, Qubit, superposición, entrelazamiento, puertas cuánticas (Hadamard, CNOT, Pauli), circuitos cuánticos, Algoritmos de Grover y Shor, corrección de errores cuánticos y simuladores en hardware clásico.
* **Artefacto / Modelo Mental Entregable:** Un circuito cuántico ejecutable en simulador clásico implementando el Algoritmo de Grover para búsqueda no estructurada.
* **Frontera de Entrada:** Comienza en la representación vectorial de un qubit en la esfera de Bloch.
* **Frontera de Salida:** Termina en la ejecución de algoritmos cuánticos con ventaja sobre la computación clásica.
* **Dependencias Directas:** `00: 01. digital-logic-design`, `03: 07. computability-theory`, `03: 08. computational-complexity-theory`.

---

### 13. `computational-genomics` — Computational Genomics

* **Assumed Prerequisites:** Análisis asintótico de `02: 01. asymptotic-algorithm-analysis`, Indexación de cadenas de `02: 09. string-indexing-algorithms` y Redes Neuronales de `01. neural-network-architectures`.
* **Course Boundary:** Comienza en la secuencia de nucleótidos/aminoácidos cruda y termina en la alineación masiva de genomas e inferencia computacional de estructuras tridimensionales de macromoléculas.
* **Explicit Exclusions:** ❌ SIN biología de laboratorio húmedo o química analítica.
* **Problema Disparador:** El código genético consta de miles de millones de pares de bases procesados con errores de lectura. ¿Cómo alineamos, buscamos e inferimos la estructura 3D de macromoléculas biológicas en tiempo ejecutable?
* **Dominio Técnico Comprehendido:** Algoritmos de alineamiento de secuencias (Needleman-Wunsch, Smith-Waterman), matrices de sustitución (BLOSUM/PAM), búsqueda heurística en bases de datos genómicas (BLAST), Grafos de de Bruijn para ensamblaje *de novo* de lecturas cortas y modelos de aprendizaje profundo para predicción de plegamiento de proteínas (AlphaFold / ESMFold mechanics).
* **Artefacto / Modelo Mental Entregable:** Un motor de alineación de genomas de alto rendimiento basado en Smith-Waterman acelerado por vectorización SIMD y ensamblador de lecturas por Grafos de de Bruijn.
* **Frontera de Entrada:** Comienza en las secuencias digitales de datos genómicos no estructurados.
* **Frontera de Salida:** Termina en el procesamiento algorítmico e inferencia de estructuras biomoleculares complejas.
* **Dependencias Directas:** `02: 01. asymptotic-algorithm-analysis`, `02: 09. string-indexing-algorithms`, `01. neural-network-architectures`.

---

### 14. `generative-diffusion-architectures` — Generative Diffusion Architectures

* **Assumed Prerequisites:** Internos de Frameworks DL de `02. deep-learning-framework-internals` y Visión por Computador de `08. computer-vision-algorithms`.
* **Course Boundary:** Comienza en la distribución de ruido Gaussiano puro y termina en el muestreo iterativo condicionado para generación sintética multimodal (imagen, audio, estructuras 3D).
* **Explicit Exclusions:** ❌ SIN edición o diseño artístico de medios.
* **Problema Disparador:** Los modelos discriminativos solo clasifican datos existentes. ¿Cómo aprendemos la distribución de probabilidad subyacente del mundo para generar muestras sintéticas fotorrealistas e inéditas destruyendo y reconstruyendo información mediante procesos estocásticos?
* **Dominio Técnico Comprehendido:** Modelos Generativos, Autoencoders Variacionales (VAEs), Redes Generativas Adversarias (GANs), Modelos de Difusión Probabilística (DDPM, DDIM), Ecuaciones Diferenciales Estocásticas (SDEs Score-Based), Guiado Libre de Clasificador (*Classifier-Free Guidance - CFG*), Difusión en Espacio Latente (*Latent Diffusion Models / Stable Diffusion*), y Transformers de Difusión (*Diffusion Transformers - DiT*).
* **Artefacto / Modelo Mental Entregable:** Un modelo de difusión latente (*Latent Diffusion Model*) completo con muestreador DDIM e inyección de condicionado por texto mediante mecanismos de *Cross-Attention*.
* **Frontera de Entrada:** Comienza en la adición progresiva de ruido a representaciones de datos.
* **Frontera de Salida:** Termina en la generación determinista/estocástica de medios sintéticos de alta fidelidad.
* **Dependencias Directas:** `02. deep-learning-framework-internals`, `08. computer-vision-algorithms`.