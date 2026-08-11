PROMPT ITERADOR Y RECORDATORIO PARA LA GENERACIÓN DE LECCIONES
Iniciamos la redacción de la siguiente lección del curso. Lee con atención y aplica de forma rigurosa las siguientes directrices y reglas pedagógicas en tu respuesta.

EXTENSIÓN Y ESTILO DE REDACCIÓN (FILOSOFÍA FEYNMAN)
La extensión de la lección teórica debe ser profunda, exhaustiva y meticulosa, alcanzando más de 5000 palabras de contenido explicativo. En este cómputo de palabras no se incluyen ni los bloques de código ejecutable, ni los diagramas esquemáticos en texto, ni las etiquetas de formato sintáctico.
El estilo de redacción debe ser ultra didáctico, amigable y sumamente accesible, aplicando la filosofía pedagógica de Feynman. Explica cada concepto partiendo siempre desde la base absoluta, asumiendo que el lector no tiene conocimientos previos sobre el tema. Nuestro objetivo es explicar los problemas más complejos de la informática de la forma más sencilla, clara y directa posible. No escatimes en explicaciones ni en detalles verbales para asegurar que cualquier persona pueda comprender el mecanismo técnico.
PARA EXPLICAR CONCEPTOS DIFICILES PUEDES OPTAR POR USAR ANALOGIAS DEL MUNDO COTIDIANO, SEGMENTARLO EN VARIAS PARTES U OPTAR POR UNA FORMA DE VISUALIZACION CON DIAGRAMAS O ESQUEMAS.
La lección debe comenzar directamente en la primera línea presentando el problema disparador, la fricción de rendimiento, el límite físico o la falla de memoria que motiva el tema. Quedan totalmente prohibidas las introducciones conversacionales o de relleno como "In this lesson we will explore" o "Welcome to".
Redacta el texto con fluidez y naturalidad orgánica. Evita mostrar la estructura lógica interna, las guías de redacción o metadatos al lector. El público debe recibir una lectura continua, limpia y atractiva.

IDIOMA Y ABSTRACCIÓN DE CONTEXTO
Todo el contenido de la lección debe redactarse estrictamente en inglés. Reserva el uso del español únicamente para las conversaciones casuales de consulta o planificación fuera del documento de la lección.
Cada lección debe ser completamente autónoma e independiente. No hagas referencias directas a otras asignaturas ni utilices frases como "como se explicó en el curso anterior". Piensa en un lector que llega de forma aleatoria a este tema: debe ser capaz de entenderlo todo desde cero. Si necesitas un concepto previo, re-explícalo brevemente de forma intuitiva sin copiarlo literalmente.

ELEMENTOS VISUALES, NOTACIÓN Y DIAGRAMAS
Enriquece la lectura haciendo uso de elementos nativos de formato como negritas, cursivas, tablas descriptivas y formulación matemática en LaTeX o KaTeX. Toda variable o parámetro utilizado en ecuaciones LaTeX debe ser definido formalmente justo debajo de la fórmula. Queda prohibida la inclusión de citas internas o etiquetas de referencia tipo [1.1.1].
Incluye diagramas y esquemas visuales construidos con caracteres Unicode de forma orgánica a lo largo del texto siempre que ayuden a la interiorización del concepto. Varía los tipos de esquemas entre lecciones para evitar la monotonía, manteniendo la simplicidad sin sobrecargar la información.
Los diagramas Unicode deben cumplir reglas de formato muy precisas: deben comenzar pegados al margen izquierdo con cero espacios de sangría inicial, deben mantener un ancho estricto inferior a 70 caracteres para evitar el desplazamiento horizontal en pantalla, y no deben envolverse dentro de cajas decorativas exteriores gigantes. Además, nunca escribas código LaTeX o KaTeX (
) dentro de los bloques de diagramas de texto, ya que no se renderizan dentro de ellos.
NINGUN DIAGRAMA O ESQUEMA UNICODE DEBE TENER DENTRO NI LATEX NI KATEX NI BLOQUES CON $$

FORMATO DE ENTREGA Y ESTRUCTURA DE ARCHIVOS
Tu respuesta debe comenzar en la primera línea indicando la ruta semántica del archivo con la siguiente sintaxis exacta:
content/Capa/Asignatura/lessons/Bloque/Tema/Leccion.md
A partir de la segunda línea, proporciona directamente el contenido completo de la lección en Markdown en inglés. No envuelvas toda tu respuesta dentro de bloques globales de código con triples comillas inversas, de forma que el documento pueda guardarse e integrarse de manera limpia y directa.
Aplica todas estas reglas con la máxima precisión para generar una lección de calidad técnica y pedagógica insuperable.

NOTA
El lenguaje y los titulos de la lección deben ser agnosticos de la implementación interna de las lecciones. Por ejemplo: NO MENCIONAR JAMÁS QUE ESTO CONSTITUYE UN DAG // NO REDACTAR UN TITUL QUE TENGA POR NOMBRE UNO GENËRICO O DE LA PLANTILLA DE LECCIONES
Y LOS DIAGRAMAS O ESQUEMAS QUE HAGAS TIENEN QUE TENDER SIEMPRE AL MINIMALISMO: DEBEN EVITARSE SIEMPRE QUE SE PUEDA TODO CRUCE DE CABLES O LINEAS (por ejemplo en diseño digital. un circuito con cruces de cables estropea totalmente el circuito ya que no se sabe la dirección de los cables al no poderse representar la profundidad)
Y DEJA DE PONER BLOQUES DE $$ o LATEX O KATEX DENTRO DE DAIGRAMAS O ESQUEMAS.
Y LO MÁS IMPORTANTE DE TODO: TODA LECCIÓN DEBE SER MUY FÁCIL DE ENTENDER. DEBE SER CAPAZ DE ENTENDERLA HASTA UN TONTO Y PRINCIPIANTE ABSOLUTO. PARA ELLO HAZ LO QUE TENGAS QUE HACER PARA QUE SE COMPRENDA.
Y SE TRABAJAN 1/2 CONCEPTOS PRINCIPALES PARA QUE LOS MACHAQUES DESDE TODOS LOS PUNTOS DE VISTA Y QUEDEN MUY CLAROS (UN DEFECTO QUE HE VISTO QUE TIENES ES QUE SI SE DAN MÁS DE 3 EMPIEZAS A TOCARLOS DE FORMA MUY SUPERFICIAL Y AUNQUE SEAN CORRECTOS; PARA UN HUMANO FALTA CIERTO ARRAIGO); ESO SI, ESTAMOS HABLANDO DE CONCEPTOS CENTRALES, LAS LECCIONES PUEDEN TRATAR DE MÁS COSAS (por ejemplo en leyes de boole, hay que explicar todas las leyes y luego hacer enfasis por ejemplo en los postulados de morgan y el teorema del consenso)
Y RECUERDA EL +5k DE PALABRAS SOBRE LA TEORIA. LAS PALABRAS DE LA PRÁCTICA SON INDEPENDIENTES (EN LOS EJERCICIOS PRÁCTICOS TIENES QUE BARRER TODOS LOS CONCEPTOS DE LA TEORIA OBLIGATORIAMENTE)
Cuando termines de hacer todo el tema, escribe únicamente "TERMINADO" y nada más. Pero esto únicamnete me lo escribirás cuando te pida más lecciones y hayas terminado sin que yo me haya dado cuenta.
