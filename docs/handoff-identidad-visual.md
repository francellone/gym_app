# Handoff: terminar de llevar la app a la identidad "Encabezado durazno"

> Para el modelo o la sesión que tome esta tarea. Leer entero antes de tocar código.
> Ante cualquier duda que no esté cubierta acá, preguntarle a Franco antes de
> accionar. Él prefiere que las preguntas vayan en prosa, no con selector de opciones.
> Escrito el 2026-09-26, al cerrar la sesión del rediseño.

## Leer primero

1. `docs/identidad-visual.md` (manual v1.1, aprobado por Franco). Es LA referencia.
   La versión con muestras de color está en `docs/identidad-visual.html`.
2. `tailwind.config.js`: remapeos y tokens de la identidad.
3. `src/index.css`: piezas comunes (`.card`, `.btn-*`, `.hero`, `.eyebrow`,
   `.stat`, `.chip`, `.pill-ok/warn/bad/neutral`) y el bloque `.plan-*`.

## Qué ya está hecho

| Etapa           | Commit  | Qué incluye                                                                            |
| --------------- | ------- | -------------------------------------------------------------------------------------- |
| 1               | d5e47b5 | Roboto propia (`src/assets/fonts/roboto/`), tokens, piezas en `index.css`, theme-color |
| 2               | c0a506a | Persona: layout, Inicio, Hoy, Progreso. **Verificada en vivo por Franco**              |
| 3               | dfa8131 | Celebraciones, layout de la coach en blanco, perfil, login, informes                   |
| 4               | 7d52277 | Categorías ciruela y niebla, grises cálidos, limpieza de colores viejos                |
| Dashboard coach | 4004eb3 | Atención por persona, agenda de 7 días, calendario con palabras                        |
| Manual          | 36bc3e4 | Corrección de la sección de letra                                                      |

En el repo local, `origin/main` ya apunta a 36bc3e4. Igual confirmar con Franco
que el deploy terminó antes de dar algo por verificado.

**Cómo funciona el remapeo (clave para no romper nada):** en `tailwind.config.js`,
`gray` y `slate` son grises cálidos (`gray-900` = Tinta `#3a2e27`),
`purple`, `violet` e `indigo` apuntan a **ciruela**, y `blue` y `sky` a **niebla**.
Por eso las pantallas viejas ya cambiaron de color sin tocarlas. En código
nuevo usar los nombres propios: `durazno-*`, `tinta`, `texto2`, `texto3`,
`linea`, `fondo`, `ciruela-*`, `niebla-*`, `primary-*` (escala naranja).
`green`, `emerald`, `teal`, `cyan`, `amber`, `red`, `orange` NO están
remapeados: siguen siendo los de Tailwind.

## Decisiones de Franco que no se discuten

- Nada de negro. Ningún fondo, botón ni selección en negro o gris muy oscuro.
- Colores suaves: estados en pastel con texto oscuro de su familia.
- Durazno para acompañar, naranja solo para señalar (botón principal, dato
  destacado, lo seleccionado).
- Evaluaciones en ciruela; información y aeróbico en niebla.
- En el menú de la coach queda "Alumnos". En el resto de los textos, "persona".
- Todo va a la misma identidad: persona, coach, celebraciones, informes, avisos.

## Tareas pendientes (en este orden)

### 1. Verificación en vivo de la etapa 3, la etapa 4 y el dashboard

Solo la etapa 2 fue verificada por Franco. Faltan:

- Celebraciones (día, semana, comodín, cierre de plan, mejor marca).
- Coach: lista de Alumnos, detalle de persona, perfil, dashboard nuevo.
- Login, informe de progreso e informe para clientes.
- Evaluaciones en ciruela y bloques aeróbicos en niebla.

URL buena: **gym-appv2** (ver memoria del proyecto; la causa recurrente de
"sigue igual" fue mirar la URL equivocada). Dispositivos: iPhone, Android y
computadora. Esto lo hace Franco; la sesión arma la lista de chequeo corta y
recoge lo que encuentre.

### 2. Campana de avisos

Archivo: `src/features/notifications/components/NotificationBell.jsx`.

Hoy el mapa de tipos (líneas ~46-115) le da a cada tipo un color distinto:
blue, green, emerald, amber, red, purple, orange, indigo, teal, violet, sky,
cyan. Además la fila no leída lleva `bg-blue-50/30` y el punto `bg-blue-500`,
que por el remapeo hoy salen en niebla.

Lo que pide el manual (sección 8):

- Ícono con los colores de estado, sobre su fondo pastel. Propuesta de
  agrupación, **a confirmar con Franco antes de implementar**:
  - Bien (`#dcfce7` / `#16a34a`): `session_completed`, `week_completed`,
    `plan_completed`, `form_submitted`.
  - Atención (`#fef3c7` / `#d97706`): `plan_expiring`, `stagnation_alert`,
    `personal_best_voided`.
  - Ciruela: `evaluation_completed`.
  - Durazno (acento suave): `plan_assigned`, `plan_updated`, `coach_comment`,
    `student_note`.
  - Neutro (`#f5f0eb` / `#76675d`): `activity_update`, `weekly_summary`,
    `profile_change`.
  - Problema (rojo) queda libre para lo que sea realmente un problema.
- Texto en Tinta.
- No leída: **sin fondo de color en la fila**, solo el punto en Naranja 600
  (`bg-primary-600`) y el título en negrita.

### 3. Fondos de las ventanas emergentes

Hay 29 archivos con `bg-black/40`, `bg-black/50`, `bg-black/60` o `bg-black/20`
detrás de modales y hojas (buscar con `grep -rn "bg-black/" src`). Pasarlos a
Tinta al 40 %: `bg-tinta/40` funciona tal cual (Tailwind 3.4 acepta el
modificador de opacidad sobre colores hex). Unificar la opacidad; el que hoy
usa `/20` (`StudentProgressTableView.jsx`) puede quedar más liviano si es un
velo parcial, revisarlo en contexto.

Es un reemplazo mecánico pero toca pantallas de la persona y de la coach:
correr tests y build, y pedirle a Franco que abra dos o tres ventanas
(registro de ejercicio, wellbeing, duplicar plan) para ver el tono.

### 4. Ajuste fino de las pantallas de la coach

Hoy toman la paleta nueva por el remapeo, pero nadie las revisó una por una
contra el manual. En cada una: encabezado, tarjetas sin sombra y con borde
Línea, un solo botón principal por tarjeta, filtros como pastillas
(elegido = Durazno 50 + borde Durazno 200 + texto Naranja 700, nunca fondo oscuro),
estados en `.pill-*`, sin emojis como íconos.

- **Armador y detalle de plan**: el bloque `.plan-*` de `src/index.css` tiene
  unos 56 colores hex fijos. Pasarlos a tokens (variables o `theme()`), sin
  cambiar la estructura.
- **Ejercicios** (`ExercisesLibraryPage`, modales de duplicados, fusión y ficha).
- **Evaluaciones** (tab del alumno, asignar, ejecutar): ciruela para lo propio.
- **Formularios** (`FormBuilder` y plantillas): tenían un degradado; el manual
  solo permite degradados en el encabezado y en el cierre de plan.
- **PersonalBestsCard**: los botones usan `btn-primary`/`btn-secondary` con
  `text-xs`. Un botón naranja con texto blanco chico no llega a contraste
  (3,6 a 1): subir a 16 px negrita o usar Naranja 700 de fondo.

Sugerencia de método: mostrarle a Franco capturas antes/después de cada
pantalla y avanzar de a una o dos por commit.

## Fuera de alcance de este handoff

Los pendientes del dashboard de la coach (largo de "Cumplimiento por persona",
diccionario de dolor solo en español, planes vencidos que siguen activos) son
de lógica, no de identidad. Están listados en el doc del proyecto
`claude/rediseno-visual-app.md`. No mezclarlos acá.

## Reglas de trabajo

- Contraste: texto blanco sobre `#ea580c` solo en 16 px o más y negrita; si no,
  fondo `#c2410c` (primary-700).
- La vista de la persona tiene tres run cards (fuerza, circuito, aeróbico): todo
  cambio visual de ejercicio se replica en las tres.
- Ningún test deja rastro, ni en la base ni en el repo.
- Si se agrega una pieza o regla nueva, se suma al manual (`identidad-visual.md`
  y `.html`) con una línea en el Historial.
- Maquetas para Franco: HTML estático sin JavaScript, `color-scheme: light only`,
  y un PDF si hay que verlo en iPhone.

## Restricciones del entorno (sandbox Cowork)

- Antes de tocar git, pedir permiso de borrado sobre la carpeta del repo. Con
  eso `git commit` normal funciona con el hook. Sin eso queda `.git/index.lock`
  huérfano (moverlo a `_to_delete/` y usar `--no-verify` tras correr a mano lint,
  tests y build).
- Build de verificación fuera del mount:
  `npx vite build --outDir $HOME/gymapp-build-check --emptyOutDir`.
- Tests: `npx vitest run`. Lint: `npx eslint src/`.
- El VM local no tiene red. El push lo hace Franco; dejarle el bloque de
  terminal listo para pegar.
