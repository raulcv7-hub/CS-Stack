# Guía de Sintaxis y Estándar de Markdown para Lecciones

Este documento define la especificación de sintaxis Markdown soportada por el intérprete de la biblioteca. Está optimizado para garantizar la máxima claridad pedagógica, la renderización limpia en móviles y la generación libre de ambigüedades por parte de modelos de IA.

---

# 1. Sintaxis Principal de Alto Uso Pedagógico

## Encabezados ATX (Estructura de Secciones)
# Encabezado Nivel 1 (Título Principal)
## Encabezado Nivel 2 (Sección Principal H2)
### Encabezado Nivel 3 (Subsección H3)
#### Encabezado Nivel 4 (Punto Específico H4)

## Formato de Texto y Énfasis
**Texto en negrita** (usar para términos clave y conceptos nuevos)
*Texto en cursiva* (usar para palabras en inglés o énfasis suave)
***Texto en negrita y cursiva***

## Llamadas / Alertas Destacadas (GitHub Callouts)
> [!NOTE]
> Nota informativa sobre un detalle técnico de implementación.

> [!TIP]
> Consejo pedagógico o modelo mental para interiorizar el concepto.

> [!IMPORTANT]
> Regla o invariante fundamental del sistema que no se debe olvidar.

> [!WARNING]
> Advertencia sobre errores comunes, comportamiento indeterminado o fugas de memoria.

> [!CAUTION]
> Alerta crítica sobre fallos catastróficos o condiciones de carrera en producción.

## Formulación Matemática (KaTeX / MathJax)
Fórmula en línea: $E = mc^2$ o complejidad $O(N \log N)$

Fórmula en bloque centrado:
$$
\text{Throughput} = \frac{\text{Instrucciones}}{\text{Ciclos} \times \text{Tiempo de Reloj}}
$$
*(Nota: Toda variable empleada en fórmulas debe definirse justo debajo de la ecuación).*

## Tablas Comparativas con Alineación
| Concepto / Paradigma | Enfoque AoS (Orientado a Objetos) | Enfoque SoA (Orientado a Datos) |
| :--- | :---: | ---: |
| Localización Espacial | Baja (Saltos de puntero) | Alta (Acceso contiguo) |
| Impacto en Caché L1 | Fallos frecuentes ($O(N)$) | Aciertos óptimos ($O(1)$) |
| Ancho de Banda | 35% aprovechado | 98% aprovechado |

## Bloques de Código Delimitados con Lenguaje
```c
// Código C con resaltado de sintaxis
uint32_t align_to_page(uint32_t address) {
    return (address + 0xFFF) & ~0xFFF;
}
```

```verilog
// Código Verilog/RTL con resaltado de sintaxis
always @(posedge clk or negedge rst_n) begin
    if (!rst_n) q <= 1'b0;
    else        q <= d;
end
```

## Secciones Plegables / Acordeón (Para Pistas o Pistas de Ejercicios)
<details>
<summary>🔍 Haz clic aquí para ver la pista de resolución del ejercicio</summary>

Aplica la propiedad distributiva del Álgebra de Boole antes de minimizar el Mapa de Karnaugh.
</details>

## Bloques de Cita Simples (Blockquotes)
> "La simplicidad es prerrequisito para la confiabilidad." — Edsger W. Dijkstra

---

# 2. Sintaxis Secundaria Soportada

## Listas Desordenadas y Ordenadas
- Elemento desordenado principal
  - Sub-elemento anidado con sangría de 2 o 4 espacios
1. Primer paso ordenado
2. Segundo paso ordenado

## Listas de Comprobación / Tareas
- [ ] Invariante por verificar
- [x] Invariante verificado y demostrado

## Tachar Texto (Strikethrough)
~~Estado o suposición incorrecta anterior~~

## Notas al Pie (Footnotes)
El procesador ejecuta la instrucción en modo protegido[^1].

[^1]: El modo protegido es un estado operacional de la CPU x86 que limita las instrucciones privilegiadas.

## Enlaces e Imágenes
[Documentación de Referencia](https://direccion.com)
![Esquema o Figura](https://direccion.com/imagen.png "Leyenda de la figura")

## Líneas de Separación Horizontal
---

## Subíndice y Superíndice
Fórmula química: H~2~O
Potencia binaria: 2^10^ = 1024

## Resaltado de Texto (Highlighter)
==Texto resaltado en amarillo==
