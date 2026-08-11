# Especificación Maestra de la Estructura Estándar de Lección (EEL)

Esta especificación define la arquitectura cognitiva, los invariantes de calidad y la estructura adaptativa para la redacción de lecciones en la biblioteca.

---

## 1. PRINCIPIOS DE ARQUITECTURA COGNITIVA

La estructura de las lecciones está diseñada en torno a los 6 pilares de la ciencia cognitiva del aprendizaje:

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ 1. ANCLAJE COGNITIVO    ► Problema disparador directo en la Línea 1.      │
│ 2. ESCALERA DE FEYNMAN  ► Analogía intuitiva ──► Mecánica ──► Formal.     │
│ 3. CODIFICACIÓN DOBLE   ► Texto + 1 Diagrama Unicode cada ~800 palabras.  │
│ 4. REALIDAD INDUSTRIAL  ► Casos de borde, condiciones de carrera y ruido. │
│ 5. EVOCACIÓN ACTIVA     ► Ejercicio cuantitativo resuelto paso a paso.    │
│ 6. CHUNKING DAG         ► Primitivos de salida empaquetados como API.     │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.1. Invariante "Problem-First" (Anclaje Cognitivo)
Toda lección comienza **DIRECTAMENTE en la primera línea** presentando la fricción técnica, cuello de botella de rendimiento, límite físico o vulnerabilidad que motiva el tema. Quedan estrictamente prohibidas las introducciones conversacionales o de rellenado (*"In this lesson we will explore...", "Welcome..."*).

### 1.2. Integración Visual Multicanal (Teoría de Codificación Doble)
El aprendizaje visual es un canal cognitivo paralelo e indispensable, no un anexo secundario.

* **Cadencia Visual Transversal:** Toda lección debe incorporar **un diagrama o esquema Unicode/ASCII por cada 800-1000 palabras de texto** de forma distribuida a lo largo de la narración.
* **Estándares Estrictos de Diagramación:**
  1. **Pegados al margen izquierdo:** Cero espacios de sangría iniciales dentro del bloque ````text```.
  2. **Ancho máximo acotado < 70 caracteres:** Para evitar el scroll horizontal.
  3. **Sin marcos envolventes decorativos:** Prohibido envolver todo el bloque con cajas decorativas gigantes (`┌──────┐`). Las cajas se usan **únicamente dentro del diagrama** para representar componentes reales (registros, buffers, procesos, nodos).
  4. **Prohibido KaTeX en diagramas:** No incluyas símbolos o ecuaciones LaTeX (`$$`) dentro de bloques de texto Unicode.

### 1.3. Notación Matemática Explícita
Toda variable utilizada en fórmulas LaTeX (`$ ... $` o `$$ ... $$`) **DEBE ser definida formalmente justo debajo de la ecuación**. Queda prohibido el uso de citas internas de pizarra como `[1.1.1]`.

---

## 2. ESTRUCTURA ADAPTATIVA POR DOMINIO (MODELO HÍBRIDO)

Para evitar la monotonía narrativa y adaptar la lección a la naturaleza específica de cada asignatura, los **títulos de las secciones H2 (`##`) deben ser siempre originales, semánticos y cohesivos con el tema** (ej. en lugar de titular `## 1. The Driving Problem`, titula `## 1. The 16-Bit Address Space Bottleneck`).

Toda lección se articula sobre los siguientes **5 Bloques Funcionales Invariantes**:

```markdown
# {XX}-{leccion-slug} — {Title in English}

## 1. {Driving Problem Semantic Title}
<!-- 
REGLA: Primera línea directa con la fricción/falla sin intros conversacionales.
MANDATORIO: Incluir un diagrama Unicode (<70 caracteres, pegado a la izquierda) 
que ilustre el problema o cuello de botella.
-->

## 2. {Intuitive Mental Model & Analogy Semantic Title}
<!-- 
REGLA: Andamiaje mental e intuición mediante "Divide y Vencerás" y una analogía 
potente del mundo real que haga evidente el mecanismo base.
-->

## 3. {Formal Mechanics & Theoretical Core Semantic Title}
<!-- 
REGLA: Desarrollo riguroso, verboso y exhaustivo (~5,000 palabras de profundidad).
Adaptar la narrativa al dominio (Hardware, Algoritmos, Compiladores, Distribuidos, IA).
MANDATORIO: Múltiples diagramas Unicode embebidos en el texto (uno cada ~800 palabras) 
mostrando estados de memoria, transformaciones o flujos de datos.
-->

## 4. {Engineering Reality & Edge Cases Semantic Title}
<!-- 
REGLA: Conectar la teoría con la industria real (condiciones de carrera, ruido, 
límites térmicos, degradación de rendimiento, fugas de memoria).
MANDATORIO: Incluir un diagrama Unicode mostrando el comportamiento ante fallos.
-->

## 5. {Deep Solved Engineering Exercise Semantic Title}
<!-- 
REGLA: Ejercicio práctico analítico o cuantitativo resuelto paso a paso. 
Desglosado estrictamente en 3 subsecciones H3 (###):
-->

### Scenario & Parameters
<!-- Planteamiento del problema con valores realistas y esquema visual del escenario -->

### Step-by-Step Derivation
<!-- Desarrollo matemático, algorítmico o de código desglosado paso a paso -->

### Sanity Check / Verification
<!-- Explicación de por qué el resultado obtenido es correcto desde la ingeniería -->

## 6. {Key Primitives Summary Semantic Title}
<!-- 
REGLA: Lista en viñetas de los 3 a 5 primitivos conceptuales que esta lección 
entrega formalmente al Grafo DAG para consumo de lecciones futuras.
-->
```

---

## 3. ADAPTABILIDAD NARRATIVA SEGÚN LA CAPA DEL GRAFO

El generador de lecciones debe adaptar la naturaleza del contenido del Bloque 3 (Mecánica Formal) y Bloque 5 (Ejercicio) según la Capa de Abstracción:

* **Capas 00 a 02 (Hardware, Paradigmas y Algoritmos):** Foco en diagramas de bloques RTL, datapaths, ciclos de reloj, maquetación de memoria en Pila/Heap, Big-O y derivaciones algebraicas.
* **Capas 03 a 05 (Compiladores, Kernel y Runtimes):** Foco en transformaciones sintácticas (AST $\rightarrow$ SSA IR), mapas de paginación de memoria virtual, llamadas al sistema, JIT y recolección de basura.
* **Capas 06 a 08 (Redes, Almacenamiento y Ciberseguridad):** Foco en diagramas de secuencia cliente-servidor, consensos de red, quórums, índices B+/LSM, trazas de paquetes y mitigación de exploits.
* **Capas 09 a 10 (Plataformas, IA y Especializaciones):** Foco en mallas de microservicios, canalizaciones CI/CD, grafos de tensores, Autograd, pipelines de renderizado 3D y circuitos cuánticos.

---

## 4. LISTA DE COMPROBACIÓN DE CALIDAD DE LA LECCIÓN

Antes de aprobar cualquier lección (`.md`), verifica:

* [ ] ¿Está redactada en **inglés** técnico y claro?
* [ ] ¿Inicia en la primera línea con el problema sin introducciones conversacionales?
* [ ] ¿Alcanza una densidad teórica profunda de **+5,000 palabras** sobre un único concepto atómico?
* [ ] ¿Cumple la **cadencia visual** (varios diagrama Unicode, pegados a la izquierda y <70 caracteres)?
* [ ] ¿Los títulos H2/H3 son semánticos y originales para evitar la monotonía?
* [ ] ¿Todas las variables en las ecuaciones LaTeX están explicadas justo debajo?
* [ ] ¿El ejercicio de la Sección 5 incluye *Scenario*, *Step-by-Step Derivation* y *Sanity Check*? (SIN COPIAR NOMBRES DE HEADERS)
* [ ] ¿La Sección 6 resume los 1 a 2 primitivos de salida para el DAG?

> NO COPIES LOS NOMBRES DE LOS TITULOS DE LAS PLANTILLAS