# Identidad visual de GymCoach: Encabezado durazno

Versión 1 · 26 de septiembre de 2026 · aprobada por Franco

Este manual define cómo se ve la app. Cubre la parte de la persona, la de la coach, las celebraciones, los informes y los avisos. Toda pantalla nueva o modificada lo respeta. Si algo no está previsto acá, se resuelve con las piezas que ya existen antes de inventar una nueva, y la decisión se agrega al manual.

La versión visual, con muestras, está en `docs/identidad-visual.html`.

## 1. La idea

La app se ve como la pantalla de felicitación: clara, cálida y tranquila. El color durazno da calidez, el naranja se reserva para lo importante y no hay negro. La información se lee primero; la decoración nunca compite con los datos.

Tres reglas resumen todo:

1. **Durazno para acompañar, naranja para señalar.** El durazno va en fondos y recuadros. El naranja fuerte solo en el botón principal, en el dato destacado y en lo seleccionado.
2. **Nada de negro.** El texto va en marrón oscuro. Ningún fondo, botón ni selección usa negro o gris muy oscuro.
3. **Colores suaves.** Los estados (al día, por vencer, vencido) van en pastel con texto oscuro del mismo tono, nunca en colores saturados de fondo.

## 2. Colores

### Base

| Nombre           | Código    | Uso                                                                                                                              |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Fondo            | `#fbf8f5` | Fondo de todas las pantallas                                                                                                     |
| Superficie       | `#ffffff` | Tarjetas, tablas, barra de navegación, hojas                                                                                     |
| Línea            | `#f0e7df` | Bordes de tarjetas y divisores                                                                                                   |
| Tinta            | `#3a2e27` | Texto principal y títulos                                                                                                        |
| Texto secundario | `#76675d` | Descripciones, fechas, etiquetas de datos                                                                                        |
| Texto terciario  | `#a3958b` | Solo textos de ayuda no esenciales (ejes de gráficos, marcadores de posición). No alcanza contraste para texto que haya que leer |

### Durazno y naranja

| Nombre      | Código    | Uso                                                                   |
| ----------- | --------- | --------------------------------------------------------------------- |
| Durazno 50  | `#fff7ed` | Recuadros de datos, fondo de lo seleccionado, íconos suaves           |
| Durazno 100 | `#ffedd5` | Encabezado de pantalla, avatar                                        |
| Durazno 200 | `#fed7aa` | Borde de lo seleccionado, borde de tarjetas destacadas                |
| Durazno 300 | `#fdba74` | Segmentos de progreso y racha, barras de gráficos                     |
| Naranja 600 | `#ea580c` | Botón principal, ícono de la marca, borde del ejercicio en curso      |
| Naranja 700 | `#c2410c` | Texto de acento: etiquetas sobre títulos, números destacados, enlaces |

El naranja nunca rellena bloques grandes, encabezados enteros ni tarjetas.

### Estados

Cada estado tiene un fondo pastel y un texto oscuro de su misma familia. El ícono puede ir en el tono medio.

| Estado   | Fondo     | Texto     | Ícono     | Ejemplos                                 |
| -------- | --------- | --------- | --------- | ---------------------------------------- |
| Bien     | `#dcfce7` | `#15803d` | `#16a34a` | Al día, con plan, hecho, wellbeing bien  |
| Atención | `#fef3c7` | `#92400e` | `#d97706` | Vence pronto, omitido, wellbeing regular |
| Problema | `#fee2e2` | `#b91c1c` | `#dc2626` | Vencido, plan vencido, wellbeing bajo    |
| Neutro   | `#f5f0eb` | `#76675d` | `#c9bdb2` | Sin plan, sin datos, pendiente           |

El estado siempre se lee también por la forma o el texto, nunca solo por el color: tilde para hecho, guion para omitido, círculo vacío para pendiente.

### Contraste verificado

Todos los pares de texto de este manual superan 4,5 a 1, salvo dos casos conocidos:

- Blanco sobre Naranja 600 (3,6 a 1). Por eso el texto de un botón naranja va siempre en 16 px o más y en negrita. Si un botón necesita texto más chico, usa Naranja 700 de fondo.
- Texto terciario sobre blanco (2,9 a 1). Solo para textos de apoyo, como se indica arriba.

## 3. Letra

**Roboto** para toda la app, guardada dentro de la app para que se vea igual en iPhone, Android y computadora, y funcione sin conexión. Pesos: 400, 500 y 700.

| Rol                   | Tamaño     | Peso | Detalle                                  |
| --------------------- | ---------- | ---- | ---------------------------------------- |
| Título de pantalla    | 28 px      | 700  | Interlineado 1,15, `text-wrap: balance`  |
| Título de tarjeta     | 20 a 22 px | 700  |                                          |
| Etiqueta sobre título | 11 px      | 700  | Mayúsculas, espaciado 0,1em, Naranja 700 |
| Cuerpo                | 15 px      | 400  | Interlineado 1,5                         |
| Secundario            | 13 px      | 400  | Texto secundario                         |
| Número destacado      | 22 px      | 700  | Naranja 700, `tabular-nums`              |
| Botón                 | 16 px      | 700  |                                          |

Todos los números que se comparan entre sí (series, kilos, porcentajes, fechas en columna) usan `font-variant-numeric: tabular-nums`.

## 4. Formas y espacios

| Elemento                   | Valor                                           |
| -------------------------- | ----------------------------------------------- |
| Tarjeta                    | radio 22 px, borde 1 px Línea, sin sombra       |
| Recuadro de datos          | radio 16 px, fondo Durazno 50, sin borde        |
| Botón                      | radio 18 px, alto 52 px (46 px en escritorio)   |
| Filtro, pastilla de estado | radio completo                                  |
| Encabezado de pantalla     | fondo Durazno 100, esquinas inferiores de 28 px |
| Margen lateral             | 16 px en teléfono, 40 px en escritorio          |
| Separación entre tarjetas  | 10 a 14 px                                      |
| Relleno interno de tarjeta | 16 a 20 px                                      |
| Área táctil mínima         | 44 × 44 px                                      |

**Sombra solo en lo que flota:** barra de navegación, hojas que suben desde abajo, avisos emergentes. Valor: `0 8px 24px rgba(160, 90, 40, 0.12)`. Las tarjetas del contenido no llevan sombra.

## 5. Piezas

### Encabezado de pantalla

Bloque Durazno 100 arriba de cada pantalla principal, con las esquinas inferiores redondeadas. Contiene, en este orden: etiqueta en Naranja 700, título de pantalla, una línea de texto secundario y, si corresponde, una barra de progreso en segmentos. Lleva como máximo un elemento más (filtros de período o recuadros de datos). No lleva botones.

### Recuadros de datos

Tres o cuatro en fila. Número destacado arriba y etiqueta corta abajo en texto secundario, centrados. Sobre el encabezado durazno van con fondo blanco al 75 %.

### Botones

- **Principal:** fondo Naranja 600, texto blanco en negrita. Uno solo por pantalla o por tarjeta.
- **Secundario:** fondo blanco, borde Línea, texto Tinta.
- **Enlace:** texto Naranja 700 sin fondo, para acciones menores ("Cambiar", "Anular").

### Filtros y pestañas

Pastillas de borde completo. Sin elegir: fondo blanco, borde Línea, texto secundario. Elegida: fondo Durazno 50, borde Durazno 200, texto Naranja 700. Nunca se marcan con fondo oscuro.

### Pastillas de estado

Fondo y texto del estado según la tabla de la sección 2. Texto corto: "Al día", "Vence en 6 días", "Vencido".

### Ejercicio

Tarjeta blanca con nombre, prescripción en texto secundario y un indicador a la derecha: tilde verde (hecho), guion ámbar (omitido), círculo vacío (pendiente). El ejercicio en curso se abre con borde Durazno 200, la etiqueta "Ahora", recuadros de datos con la prescripción, los campos de carga y el botón principal "Marcar como completado".

### Escala de esfuerzo

Diez botones iguales. El elegido va con fondo Durazno 50, borde y texto Naranja.

### Barra de progreso y racha

Segmentos redondeados separados por 4 px. Completos en Durazno 300, pendientes en Durazno 100. El comodín usado se marca con rayas.

### Barra de navegación (teléfono)

Flotante, separada 12 px de los bordes, radio 24 px, fondo blanco, borde Línea y la sombra de lo que flota. La sección activa lleva fondo Durazno 50 y texto Naranja 700.

### Menú lateral (escritorio de la coach)

Fondo blanco con borde derecho Línea. La sección activa lleva fondo Durazno 50 y texto Naranja 700. Reemplaza al menú azul marino actual.

### Tablas (coach)

Dentro de una tarjeta. Encabezados de columna en etiqueta de 11 px, filas de 60 px separadas por Línea, estados en pastillas.

### Avatar

Círculo Durazno 50 o 100 con las iniciales en Naranja 700.

### Gráficos

Líneas en Durazno 300 o Naranja 600, área bajo la línea en Durazno 50, último punto destacado en Naranja 600. Cuadrícula en Línea, ejes en texto terciario.

## 6. Celebraciones

Las celebraciones son el origen de esta identidad y se alinean con ella:

- Aviso emergente (día completo, mejor marca): tarjeta blanca flotante con la sombra de lo que flota y el ícono en un cuadrado pastel.
- Hoja de semana y comodín: hoja blanca desde abajo, etiqueta en Naranja 700, título grande, recuadros de datos y barra de racha en segmentos.
- Cierre de plan: fondo Durazno 50 a Durazno 100, mismas piezas.
- Se reemplazan los fondos `gray-900` y los degradados saturados que hoy usa el overlay por las piezas de este manual.

## 7. Informes

El informe de progreso y el informe para clientes usan la misma paleta. Se reemplazan los violetas e índigos actuales (`#6366f1`, `#8b5cf6`, `#a5b4fc`) por Durazno 300, Naranja 600 y los colores de estado. Los informes para clientes mantienen además sus reglas de redacción propias.

## 8. Avisos y campana

Las notificaciones usan los colores de estado para el ícono y texto Tinta. Las no leídas se marcan con un punto Naranja 600, no con fondo de color en toda la fila.

## 9. Qué evitar

- Negro o gris muy oscuro en fondos, botones o selección.
- Naranja o durazno fuerte rellenando bloques grandes.
- Colores saturados de fondo para estados.
- Degradados fuera del encabezado y del cierre de plan.
- Emojis como íconos de la interfaz (se usan íconos de línea de lucide-react).
- Sombra en tarjetas del contenido.
- Más de un botón principal por tarjeta.
- Textos que dicen "alumno" o "alumna": se usa "persona" (lenguaje neutro).

## 10. Cómo se lleva al código

1. **Letra:** instalar `@fontsource/roboto` (pesos 400, 500, 700) e importarla en `main.jsx`. Queda dentro del paquete de la app y la cachea el service worker.
2. **Colores y formas en `tailwind.config.js`:** agregar `durazno` (50 a 300), `tinta`, `texto2`, `texto3`, `linea`, `fondo`, los radios (`tarjeta: 22px`, `recuadro: 16px`, `boton: 18px`) y la sombra `flotante`. `primary` se mantiene como la escala naranja.
3. **Piezas comunes en `index.css`:** actualizar `.card`, `.btn-primary`, `.btn-secondary`, `.input`, `.badge` y agregar `.hero`, `.stat`, `.chip`, `.pill-*`, para que la mayor parte del cambio llegue a todas las pantallas a la vez.
4. **Fondo general:** `body` pasa de `bg-gray-100` a Fondo.
5. **`theme-color`** (barra del teléfono) en `index.html` y `manifest.json`: pasa a Durazno 100 (`#ffedd5`) para que continúe el encabezado.
6. **Pantallas:** primero Inicio, Hoy y Progreso de la persona; después celebraciones; después la coach (lista, perfil, resto); al final informes.
7. **Verificación:** iPhone, Android y computadora, en cada etapa.

## Historial

- v1 (2026-09-26): primera versión. Variante elegida "Encabezado durazno", letra Roboto fija.
