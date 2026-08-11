# Prompt revisor de temarios

Actúa como un Arquitecto Principal de Curriculum de Ingeniería y Ciencias de la Computación. 
Vamos a auditar y refactorizar la siguiente Tabla de Contenidos (ToC) para garantizar que sea un **Contrato de Compilación Ejecutable**: un temario mantenible, modular, rigurosamente secuenciado y optimizado para la generación posterior de contenidos de alta densidad.
Efectúa una revisión utilizando estrictamente los siguientes 18 criterios divididos en 5 dimensiones:

=== DIMENSIÓN 1: DELIMITACIÓN Y METADATOS DE ENTRADA/SALIDA ===
1. **Tríada de Perímetro (Boundary, Exclusions & Prerequisites)**: ¿Las secciones `Course Boundary`, `Explicit Exclusions` y `Assumed Prerequisites` definen con precisión quirúrgica dónde empieza la mente del alumno, dónde acaba el curso y qué materias quedan excluidas?
2. **Cumplimiento de Exclusiones**: ¿Existe alguna lección dentro del temario que viole o pise las `Explicit Exclusions` declaradas?
3. **Detección de Macro-Bloques (Subasignaturas Ocultas)**: ¿Existe algún Bloque o Tema tan denso que constituya en realidad una subasignatura entera disfrazada? Si es así, ¿debe desacoplarse o re-factorizarse?

=== DIMENSIÓN 2: GRAFO Y TRAZABILIDAD DE PRIMITIVOS (DAG) ===
4. **Invariante Inductiva Monotónica del DAG**: ¿La lección $N$ consume ÚNICAMENTE primitivos que hayan sido introducidos en `Assumed Prerequisites` o en lecciones con un índice numérico estrictamente inferior ($1 \dots N-1$)?
5. **Trazabilidad de Linaje de Primitivos**: ¿Cada concepto técnico "nuevo" introducido en un descriptor queda marcado formalmente como un primitivo originario de esa lección?
6. **Atomicidad y Ortogonalidad**: ¿Cada lección aborda un único concepto indivisible con sustancia propia, sin solaparse ni repetir teoría de otras lecciones?
7. **Equilibrio Jerárquico (Depth-to-Breadth Ratio)**: ¿El árbol está balanceado en su profundidad y anchura? (Ratio objetivo: 2-6 Bloques $\rightarrow$ 2-4 Temas por Bloque $\rightarrow$ 2-5 Lecciones por Tema).
8. **Puntos de Síntesis e Integración Sistémica**: Tras un bloque de lecciones atómicas, ¿existen lecciones explícitas de ensamblaje/síntesis que enseñen a conectar los primitivos en un sistema funcional completo?

=== DIMENSIÓN 3: EXTENSIBILIDAD Y SINTAXIS PROBLEM-FIRST ===
9. **Ancla de Problema Disparador (Problem-First Invariante)**: En cada lección, ¿el descriptor tras el em-dash (`—`) especifica explícitamente el **Problema / Fricción / Límite Físico** que motiva la lección antes de enumerar los primitivos?
10. **Contrato de Interfaz de Lección (Lesson API Contract)**: ¿El alcance y los primitivos declarados en el descriptor delimitan la lección de modo que en el futuro sea ampliable infinitamente sin invadir las lecciones vecinas?
11. **Mantenibilidad y Modularidad Abierta**: Si en el futuro se desea profundizar 10 veces más en el contenido de una lección, ¿la estructura actual lo permite sin romper la arquitectura global del temario?

=== DIMENSIÓN 4: PEDAGOGÍA E INGENIERÍA DE DENSIDAD ===
12. **Pedagogía y Curva de Aprendizaje**: ¿La progresión es estrictamente continua? ¿Existen "abismos cognitivos" (saltos bruscos de dificultad) entre lecciones consecutivas?
13. **Títulos Operativos (Cero Paja Pasiva)**: ¿Los títulos evitan fórmulas vacías ("Introducción a...", "Conceptos básicos de...") y utilizan un enfoque activo e ingenieril ("Análisis de...", "Diseño de...", "Mecánica de...")?
14. **Casos de Borde e Ingeniería Real**: ¿Incluye los problemas reales de la industria (ruido, latencias, límites físicos, estados indeterminados, condiciones de carrera, sesgos) o cae en teoría idealizada?

=== DIMENSIÓN 5: APLICABILIDAD Y FORMATO ESTRICTO ===
15. **Fertilidad para Ejercicios y Diagramas Unicode**: ¿Los conceptos clave permiten derivar esquemas/diagramas abstractos Unicode y problemas cuantitativos resueltos paso a paso?
16. **Equilibrio de Carga Cognitiva**: ¿Existe una densidad y peso conceptual homogéneo entre lecciones, evitando desbalances donde una lección sea trivial y la siguiente gigantesca?
17. **Sintaxis y Nomenclatura Estricta**: ¿Cumple estrictamente con la convención de nombres `kebab-case` precedida de números con ceros a la izquierda (`01-`, `02-`) y separadores em-dash (`—`) en los 3 niveles?

### PROTOCOLO OBLIGATORIO DE EJECUCIÓN EN 2 PASOS:

Para evitar sesgos y garantizar la máxima severidad técnica, DEBES ejecutar tu respuesta en dos fases diferenciadas:

#### PASO 1: AUDITORÍA CRÍTICA ADVERSARIAL
- Asume el rol de un Auditor Destructivo de Planes de Estudio.
- Analiza la ToC punto por punto según los 17 criterios anteriores.
- Identifica de forma implacable: falta de trazabilidad de primitivos, ausencia de problemas disparadores, cuellos de botella de extensibilidad, subasignaturas ocultas, desbalances de árbol y fricciones en el DAG.
- Asigna una nota justificada del 1 al 10 para CADA criterio y una Nota Global.

#### PASO 2: REFACTORIZACIÓN Y RE-ESCRITURA COMPLETA
- Asume el rol de Arquitecto Principal de Curriculum.
- Salvo que la nota sea un 10/10 perfecto, reescribe la ToC COMPLETA aplicando todas las correcciones detectadas en el Paso 1.
- Explica brevemente los cambios estructurales realizados antes del bloque final de código.
- RESPETA RIGUROSAMENTE LA SIGUIENTE SINTAXIS Y FORMATO EN EL RESULTADO FINAL:

```markdown
# {Título Asignatura} — {Subtítulo Explicativo}

> **Assumed Prerequisites:** {Conocimientos y herramientas previas que el alumno ya domina}
> **Course Boundary:** {Descripción precisa de límites de la asignatura}
> **Explicit Exclusions:** {Lista explícita de exclusiones para no pisar otras asignaturas}

## {XX}-{bloque-slug} — {Descripción del bloque}

### {YY}-{tema-slug} — {Descripción del tema}
* {ZZ}-{leccion-slug} — Problem: {Fricción/Problema/Límite que motiva la lección} | Primitives: {Lista concisa de 1 a 2 primitivos conceptuales clave introducidos o consolidados}
```
Los bloques YY se reinician cuando XX++ y los ZZ cuando los YY++ (se reinicia a 01)

- TIENES QUE SER MUY CRITICO Y REALISTA. VER SI HAY HUECOS DENTRO DEL DOMINIO. VER EN RELACIÓN A OTRAS ASIGNATURAS SI HAY COLISIONES... DEBES GARANTIZAR QUE ESTÁ CUBIERTO TODO EL DOMINIO. Y UQE ESTÁ TODO ORGANIZADO EN EL ORDEN PEDAGOGICO CORRECTO. TAMBIEN DEBES VER DONDE ACABÓ LA ULTIMA ASIGNATURA (MIRANDO LA TOC.MD) Y VIENDO COMO UNIRLO A NIVEL DE GRAFO DE ASIGNATURAS (NO ASUMIR NADA -SALTOS ENTRE ASIGNATURAS-)
- CADA VEZ QUE LEAS ESTO TIENES QUE REALIZAR UN ANALISIS INDEPENDIENTE AL ANTERIOR Y CRÍTICO.
- NO ES RELEVANTE SI ES GRANDE O PEQUEÑO EL NUMERO DE LECCIONES; LO IMPORTANTE ES CUMPLIR DE FORMA COMPLETA Y TRANSVERSAL TODO EL DOMINIO PROPUESTO POR LA ASIGNATURA.
- TODO ESTO DEBE SER GARANTIZANDO CIERTOS ASPECTOS PEDAGOGICOS COMO LA CURVA DE DIFICULTAD O APRENDIZAJE, EL MANEJO DE CONCEPTOS A LA VEZ, CONCORDANCIA O QUE LAS LECCIONES O TEMAS O BLOQUES ESTÉN CORRECTAMENTE AGRUPADOS...
- HAZ UN ANALISIS INDEPENDIENTE A OTROS Y CUANDO LLEGUES AL 10/10 EN TODAS LOS CAMPOS, ESCRIBE 10/10 Y EL CONTENIDO DE LA TOC. SE REALISTA Y CRITICO
- Si se escribe algun header tal que la forma: "X & Y" o "X and Y" (donde X e Y son conceptos relativamente independientes) es seguramente porque está acoplado. Estos titulos de header estan mal casi seguro: seguramente estén mejor como partes independientes o como partes de otra entidad superior o inferior. se critico e inconformista; detecta problemas.
- HAY algo que le falte a este tema? sigue por algun nexo con alguna asigantura anterior? o hay algun salto? y viceversa? hay solapes? hay un salto filosofico a la electronica u otros campos que no sean las CS? es un temario de CS? enfocado en la logica más que en la técnica de control electrico? hay algo del temario que falte que no esté en ninguna otra asignatura?