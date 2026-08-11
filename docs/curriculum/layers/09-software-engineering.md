# ESPECIFICACIÓN TÉCNICA DE ASIGNATURAS — CAPA 09

La Capa 09 establece la síntesis, desacoplamiento, prueba, despliegue, orquestación y operación de plataformas de software complejas a escala industrial. Su dominio abarca los patrones de arquitectura de software a gran escala (Hexagonal, Clean Architecture, DDD, CQRS), la arquitectura interna de motores de interfaz gráfica (Layout, Render Tree, composición GPU), los principios de interacción humano-computadora (ergonomía cognitiva, GOMS), las metodologías de prueba y validación automatizada (*Property-Based Testing*), las cadenas de entrega y despliegue continuo (CI/CD, GitOps, migraciones de esquema sin caída), las mallas de microservicios (*Service Mesh*, mTLS), la orquestación declarativa elástica de clústeres de contenedores y los motores de telemetría y observabilidad distribuida.

---

## 🟢 CAPA 09: Software Engineering, System Architecture & Platform Engines
*(Ruta en sistema de archivos: `content/09-software-engineering/`)*

---

### 01. `software-architecture-patterns` — Software Architecture Patterns

* **Assumed Prerequisites:** Principios de Orientación a Objetos de `01: 05. object-oriented-software-design` y Paradigma Funcional de `01: 07. functional-programming-paradigm`.
* **Course Boundary:** Comienza en la organización de sistemas de código compuesto por miles de módulos y termina en la especificación de fronteras de dominio totalmente desacopladas.
* **Explicit Exclusions:** ❌ SIN orquestación de infraestructura en la nube (Kubernetes, tratada en `07`).
* **Problema Disparador:** Construir grandes aplicaciones sin patrones de arquitectura produce código monolítico "espagueti" e imposible de mantener. ¿Cómo organizamos los límites de dominio para permitir evolución independiente?
* **Dominio Técnico Comprehendido:** Principios de arquitectura a gran escala, Monolitos modulares, Arquitectura Hexagonal / Puertos y Adaptadores, Clean Architecture, Arquitecturas Dirigidas por Eventos (EDA), Domain-Driven Design (DDD, Bounded Contexts) y consistencia (CQRS, Event Sourcing).
* **Artefacto / Modelo Mental Entregable:** Una arquitectura de software bajo patrón Hexagonal y CQRS con separación de modelos de lectura y escritura.
* **Frontera de Entrada:** Comienza en la organización de un sistema de software compuesto por miles de módulos.
* **Frontera de Salida:** Termina en la especificación de fronteras de dominio desacopladas.
* **Dependencias Directas:** `01: 05. object-oriented-software-design`, `01: 07. functional-programming-paradigm`.

---

### 02. `gui-layout-engines` — GUI Layout Engines

* **Assumed Prerequisites:** Estructuras de datos de `02: 02. fundamental-data-structures` y diseño orientado a objetos de `01: 05. object-oriented-software-design`.
* **Course Boundary:** Comienza en el árbol de componentes lógicos de UI y termina en la generación de comandos de composición enviados a la GPU para visualización.
* **Explicit Exclusions:** ❌ SIN diseño estético o composición de color artística.
* **Problema Disparador:** Renderizar interfaces de usuario dinámicas recalculando la pantalla en cada cambio es muy lento. ¿Cómo calculamos geometría, layout y composición acelerada por GPU de forma eficiente?
* **Dominio Técnico Comprehendido:** Arquitectura interna de motores de interfaz gráfica, el Render Tree, algoritmos de Layout (Box Model, Flexbox, Grid), reflow/repaint, composición acelerada por GPU y despacho de eventos de entrada.
* **Artefacto / Modelo Mental Entregable:** Un motor de layout UI estilo Flexbox que transforma árboles de nodos en comandos de composición para GPU.
* **Frontera de Entrada:** Comienza en el árbol de componentes lógicos de UI.
* **Frontera de Salida:** Termina en el envío de capas compuestas a la GPU para su visualización.
* **Dependencias Directas:** `01: 05. object-oriented-software-design`, `02: 02. fundamental-data-structures`.

---

### 03. `human-computer-interaction` — Human Computer Interaction

* **Assumed Prerequisites:** Arquitectura de motores GUI y eventos de `02. gui-layout-engines`.
* **Course Boundary:** Comienza en la interfaz entre la mente humana y la pantalla digital y termina en la especificación de interacciones ergonómicas sin fricción cognitiva.
* **Explicit Exclusions:** ❌ SIN diseño gráfico de logotipos.
* **Problema Disparador:** Las interfaces mal diseñadas provocan carga cognitiva y errores de usuario. ¿Cómo diseñamos interacciones digitales optimizadas para el procesamiento mental humano y la accesibilidad?
* **Dominio Técnico Comprehendido:** Principios de diseño de interfaces desde el procesamiento cognitivo, Ley de Fitts, Ley de Hick, modelo GOMS, Árboles de Accesibilidad y evaluación de usabilidad.
* **Artefacto / Modelo Mental Entregable:** Un modelo de evaluación ergonómica GOMS para optimizar el tiempo de ejecución cognitiva de tareas de usuario.
* **Frontera de Entrada:** Comienza en la interfaz entre la mente humana y la pantalla digital.
* **Frontera de Salida:** Termina en la especificación de una arquitectura de interacción sin fricción cognitiva.
* **Dependencias Directas:** `02. gui-layout-engines`.

---

### 04. `software-testing-validation` — Software Testing Validation

* **Assumed Prerequisites:** Patrones de arquitectura de `01. software-architecture-patterns` y verificación formal de `03: 10. formal-model-checking`.
* **Course Boundary:** Comienza en la aserción básica de una función y termina en la verificación automatizada de propiedades e invariantes de software mediante suites de pruebas.
* **Explicit Exclusions:** ❌ SIN pipelines de despliegue continuo (CI/CD, tratadas en `05`), ❌ SIN inyección de fallos de red en producción (tratada en `06`).
* **Problema Disparador:** Modificar el código sin pruebas automatizadas introduce regresiones constantes. ¿Cómo garantizamos la calidad mediante pruebas unitarias, de integración y basadas en propiedades (*Property-Based Testing*)?
* **Dominio Técnico Comprehendido:** Validaciones de calidad, pirámide de pruebas, unit/integration testing, Property-Based Testing (QuickCheck), análisis de cobertura de código, Mocks/Stubs y comprobación automatizada de invariantes de dominio.
* **Artefacto / Modelo Mental Entregable:** Una suite de pruebas basadas en propiedades (*Property-Based Testing*) para la verificación automatizada de invariantes de código.
* **Frontera de Entrada:** Comienza en la aserción básica de una función.
* **Frontera de Salida:** Termina en la demostración empírica automatizada de que un código satisface su especificación.
* **Dependencias Directas:** `03: 10. formal-model-checking`, `01. software-architecture-patterns`.

---

### 05. `continuous-deployment-pipelines` — Continuous Deployment Pipelines

* **Assumed Prerequisites:** Runtime de contenedores OCI de `04: 08. container-runtime-internals` y suite de pruebas de `04. software-testing-validation`.
* **Course Boundary:** Comienza en el `git push` del desarrollador y termina en la promoción automatizada de código a producción con migraciones de base de datos sin caída.
* **Explicit Exclusions:** ❌ SIN desarrollo de código de aplicación.
* **Problema Disparador:** Desplegar software manualmente en servidores produce errores de configuración e interrupciones del servicio. ¿Cómo automatizamos la validación, compilación y despliegue continuo ejecutando migraciones de base de datos sin caída (*Zero-Downtime Schema Migrations*) y análisis de métricas en desplegables Canary?
* **Dominio Técnico Comprehendido:** Sistemas de integración continua (CI), gestión automatizada de compilaciones y artefactos, estrategias de despliegue continuo (Blue-Green, Canary con análisis automatizado de métricas, Rolling Updates), patrones de migración de esquema sin caída (*Expand-Contract Pattern*), Infraestructura como Código (IaC) y patrones GitOps.
* **Artefacto / Modelo Mental Entregable:** Un pipeline de CI/CD automatizado bajo patrón GitOps con despliegue Canary, análisis automatizado de métricas y esquema de migración *Expand-Contract*.
* **Frontera de Entrada:** Comienza en el `git push` del desarrollador.
* **Frontera de Salida:** Termina en la promoción automatizada y segura del código a producción.
* **Dependencias Directas:** `04: 08. container-runtime-internals`, `04. software-testing-validation`.

---

### 06. `service-mesh-architecture` — Service Mesh Architecture

* **Assumed Prerequisites:** Protocolos de aplicación de `06: 05. application-layer-protocols`, replicación tolerante a fallos de `06: 07. fault-tolerant-replication` y pipelines de `05. continuous-deployment-pipelines`.
* **Course Boundary:** Comienza en la división de una aplicación en decenas de servicios independientes y termina en la gestión del tráfico, resiliencia, seguridad mTLS, inyección de caos y trazado distribuido mediante mallas de servicios.
* **Explicit Exclusions:** ❌ SIN detalles de almacenamiento de base de datos mono-nodo (Capa 07).
* **Problema Disparador:** Un monolito gigante impide escalar equipos e infraestructura de forma independiente. ¿Cómo gestionamos el tráfico, resiliencia, seguridad mTLS, inyección proactiva de fallos (*Chaos Engineering*) y observabilidad entre decenas de microservicios distribuidos?
* **Dominio Técnico Comprehendido:** Arquitectura de microservicios, descubrimiento de servicios, API Gateways, Service Mesh (Envoy, Istio), proxies sidecar, mTLS automático, resiliencia (Circuit Breakers, Rate Limiting) e Ingeniería del Caos (*Chaos Engineering* / inyección de fallos en producción).
* **Artefacto / Modelo Mental Entregable:** Una malla de microservicios (*Service Mesh*) con proxies sidecar Envoy, cifrado mTLS automático, resiliencia por Circuit Breaker e inyección de caos.
* **Frontera de Entrada:** Comienza en la división de una aplicación en decenas de servicios independientes.
* **Frontera de Salida:** Termina en la gestión y monitorización del tráfico entre microservicios a escala.
* **Dependencias Directas:** `06: 05. application-layer-protocols`, `06: 07. fault-tolerant-replication`, `05. continuous-deployment-pipelines`.

---

### 07. `container-orchestration-engines` — Container Orchestration Engines

* **Assumed Prerequisites:** Runtimes OCI de `04: 08. container-runtime-internals`, consenso distribuido de `06: 08. distributed-consensus-algorithms` y mallas de servicios de `06. service-mesh-architecture`.
* **Course Boundary:** Comienza en el límite de gestionar contenedores individualmente y termina en la orquestación declarativa de clústeres con autoescalado automático.
* **Explicit Exclusions:** ❌ SIN virtualización mono-nodo (namespaces/cgroups) (asumida de Capa 04).
* **Problema Disparador:** Desplegar y reiniciar manualmente miles de contenedores a través de cientos de servidores es imposible. ¿Cómo mantenemos declarativamente el estado deseado de un clúster masivo ajustando automáticamente la capacidad ante variaciones de carga?
* **Dominio Técnico Comprehendido:** Arquitectura interna de orquestadores de clústeres (Kubernetes), bucle de reconciliación de estado declarativo (*Operators/Controllers*), Ingress Controllers, algoritmos de programación de clúster (*Cluster Schedulers / Bin Packing*), almacenamiento distribuido etcd, autoescalado de pods (*Horizontal Pod Autoscaler - HPA*) e interfaces CNI, CSI y CRI.
* **Artefacto / Modelo Mental Entregable:** Un operador declarativo de Kubernetes con bucle de reconciliación personalizado, asignación bin-packing sobre etcd y autoescalado HPA.
* **Frontera de Entrada:** Comienza en el límite de gestionar contenedores individualmente en una sola máquina.
* **Frontera de Salida:** Termina en un motor de orquestación capaz de mantener el estado deseado declarativo sobre miles de nodos con autoescalado elástico.
* **Dependencias Directas:** `04: 08. container-runtime-internals`, `06: 08. distributed-consensus-algorithms`, `06. service-mesh-architecture`.

---

### 08. `distributed-telemetry-engines` — Distributed Telemetry Engines

* **Assumed Prerequisites:** Protocolos de aplicación de `06: 05. application-layer-protocols` y Mallas de microservicios de `06. service-mesh-architecture`.
* **Course Boundary:** Comienza en la imposibilidad de depurar sistemas distribuidos mediante logs aislados y termina en la arquitectura de motores de recolección, correlación e indexación de Métricas, Trazas y Logs en tiempo real.
* **Explicit Exclusions:** ❌ SIN dashboards de diseño gráfico sin infraestructura subyacente.
* **Problema Disparador:** En un clúster de miles de microservicios, una petición atraviesa docenas de nodos antes de fallar. ¿Cómo rastreamos la ruta exacta de la petición y correlacionamos latencias con métricas del sistema sin saturar la red?
* **Dominio Técnico Comprehendido:** Los tres pilares de la observabilidad (Métricas, Trazas Distribuidas, Logs), Propagación de Contexto W3C Trace Context, Estándar OpenTelemetry, Arquitectura de bases de datos de series temporales (TSDB - Inverted Indexes por etiquetas, compresión Gorilla), muestreo de trazas (*Tail-based vs Head-based Sampling*) e indexación masiva de logs.
* **Artefacto / Modelo Mental Entregable:** Un motor de telemetría distribuida basado en OpenTelemetry con propagación de encabezados W3C Trace Context e indexación de métricas TSDB.
* **Frontera de Entrada:** Comienza en la pérdida de visibilidad del comportamiento interno de aplicaciones distribuidas.
* **Frontera de Salida:** Termina en la correlación instantánea de trazas, métricas y logs a escala masiva.
* **Dependencias Directas:** `06: 05. application-layer-protocols`, `06. service-mesh-architecture`.