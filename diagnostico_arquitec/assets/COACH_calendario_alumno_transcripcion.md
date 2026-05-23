# Mockup — Vista Coach del calendario por alumno (foto inline 2026-05-23 noche)

> **Origen:** Franco pegó la imagen inline al inicio de la sesión del 2026-05-23 noche post-Q6. El binario PNG no se subió como archivo, así que esta es transcripción textual. Si llega el PNG hay que guardarlo en este mismo folder con el mismo nombre base.

> **Naming pendiente de Franco:** archivo nombrado provisoriamente `COACH_calendario_alumno_*`. Asignar al backlog correcto cuando Franco confirme (probablemente nuevo ítem, no Q2/Q1/G2).

## Layout general (es DESKTOP, no mobile)

1. **Sidebar fija a la izquierda** (oscura, ~80px de ancho con texto): logo gym + items:
   - Inicio
   - Alumnos *(activo en captura)*
   - Entrenamientos
   - Evaluaciones
   - Calendario
   - Informes
   - Biblioteca
   - Plantillas
   - Configuración
   - Footer: avatar "TU" + "Tu cuenta"
2. **Panel principal** con header del alumno + tabs + contenido.

## Header del alumno

- Botón "atrás" (←) + foto del alumno (avatar circular con foto real)
- Nombre: **Juan Pérez**
- Línea inferior con bullets: `23 años · Rugby · 178 cm · 82 kg`
- Badge verde: **Activo**
- CTA primaria arriba a la derecha: **`+ Asignar sesión`** (botón violeta)

## Tabs (7)

`Resumen` | `Entrenamientos` | `Evaluaciones` | `Progreso` | **`Calendario` (activo)** | `Notas` | `Más ▾`

## Contenido del tab Calendario

### Toolbar superior

- Icono + título "📅 **Calendario**"
- Botón `Hoy`
- Flechas ← →
- Selector de rango: **`13 – 19 mayo 2024`** con dropdown
- Selector de vista: **`Semana ▾`**

### Grid semanal (7 columnas = días)

Cada columna: header "LUNES 13 may", "MARTES 14 may", ..., "MIÉRCOLES 15 may" (resaltado en violeta = hoy).

Dentro de cada columna, **cards apiladas de sesiones**. Cada card:

- **Icono + color por tipo** (chip arriba)
  - 🏋️ Fuerza (gris)
  - 🏃 Aeróbico (verde)
  - 🧘 Movilidad (violeta)
  - 🛏️ Descanso (gris claro)
  - ⚡ Circuito (naranja)
- **Tipo en texto chico**
- **Nombre de sesión** (negrita): "Día A - Tren superior", "Trote suave", "HIIT 30/30 x 8", "AMRAP 12 min", etc.
- **Chip tipo** repetido abajo (Fuerza/Aeróbico/etc.)
- **Duración**: `⏱ 60 min`, `20 min`, "Todo el día" (descanso)
- **Estado**: `✓ Completado` (verde con tilde) | `○ Pendiente` (gris)

### Ejemplo de contenido renderizado en la foto (semana 13-19 may)

| Día | Sesión 1 | Sesión 2 |
|---|---|---|
| Lunes 13 | Fuerza · Día A - Tren superior · 60 min · ✓ Completado | Aeróbico · Trote suave · 30 min · ✓ Completado |
| Martes 14 | Fuerza · Día B - Tren inferior · 70 min · ✓ Completado | Circuito · HIIT 30/30 x 8 · 20 min · ○ Pendiente |
| Miércoles 15 (hoy) | Fuerza · Día C - Full body · 60 min · ○ Pendiente | — |
| Jueves 16 | Aeróbico · Interválico en pista · 40 min · ○ Pendiente | Circuito · AMRAP 12 min · 12 min · ○ Pendiente |
| Viernes 17 | Fuerza · Día A - Tren superior · 60 min · ○ Pendiente | Aeróbico · Cinta moderada · 25 min · ○ Pendiente |
| Sábado 18 | Movilidad · Movilidad general · 20 min · ○ Pendiente | — |
| Domingo 19 | Descanso · Descanso activo · Todo el día · ○ Pendiente | — |

### Banner informativo abajo del grid

ℹ️ "Los entrenamientos se marcan como completados desde la app del alumno." + link "Ver como alumno →"

### Bloque "Próximas evaluaciones" (mitad izquierda, debajo del calendario)

Lista de 3 items + link "Ver todas →":
- 📅 `20 may 2024` — Evaluación de potencia y salto — badge `Pendiente`
- 📅 `10 jun 2024` — Evaluación de movilidad — badge `Pendiente`
- 📅 `1 jul 2024` — Evaluación trimestral — badge `Pendiente`

### Bloque "Resumen semanal" (mitad derecha, debajo del calendario)

- **Donut chart** central con "**10 sesiones**" en el centro
- Leyenda al lado (5 categorías):
  - ● 3 Fuerza
  - ● 3 Aeróbico
  - ● 2 Circuitos
  - ● 1 Movilidad
  - ● 1 Descanso
- Footer del bloque con 2 chips grandes:
  - 🟢 **5** completadas
  - 🟠 **5** pendientes

## Gap vs estado actual del código (importante)

Comparado con `src/features/students/pages/StudentDetailPage.jsx` actual:

| Aspecto | Hoy | Mockup | Delta |
|---|---|---|---|
| Layout | Mobile-first single column | **Desktop con sidebar** | Sidebar nueva + responsive 2-pane |
| Tabs | 9 tabs (Info, Notas, Planes, Evaluaciones, Formularios, Wellbeing, Progreso, Logs, Historial) | 7 tabs (Resumen, Entrenamientos, Evaluaciones, Progreso, **Calendario**, Notas, Más) | Resumen + Calendario nuevos; Planes → Entrenamientos (¿rename o concepto distinto?); 4 tabs colapsados en "Más" |
| Header alumno | Avatar con iniciales + email + level + goal + 3 stats (peso/días/registros) + 2 badges (plan/pago) | Foto real + edad + **deporte (Rugby)** + altura + peso + 1 badge (Activo) + CTA "Asignar sesión" | Foto en lugar de iniciales, deporte como nuevo campo, CTA prominente |
| Modelo de sesiones | Plan-based (`plans` + `plan_assignments` + `plan_exercises`) | **Per-session** ("Asignar sesión" individual) con tipo (Fuerza/Aeróbico/Movilidad/Descanso/Circuito) | Modelo de datos nuevo o capa de presentación sobre `workout_sessions`? |
| Tipos de entrenamiento | Mayoritariamente fuerza | 5 tipos: Fuerza, Aeróbico, Movilidad, Descanso, Circuito | Sumar columna `session_type` o catalogación de plan_type |
| Vista calendario | `MonthlyCalendar` ya existe en `dashboard/` pero a nivel coach global | **Calendario por alumno** con vista Semana + multi-sesión por día | Componente nuevo o extensión de `MonthlyCalendar` |
| Próximas evaluaciones | Tab Evaluaciones (lista) | Bloque mini en Calendario | Widget reutilizable |
| Donut semanal | No existe | Donut + leyenda + chips count | Nuevo gráfico (¿chart lib o SVG custom?) |
| Campo deporte en alumno | No existe en `profiles` | "Rugby" | Migración: sumar columna `sport text` o `sport_id fk` |
| Foto del alumno | `avatar_url` existe pero el header usa iniciales | Foto real renderizada | UI ya soporta, falta usarlo |

## Preguntas abiertas a Franco

1. **¿Esto reemplaza el flujo plan-based o convive?** Hoy el coach asigna planes (templates) a alumnos. El mockup sugiere asignar sesiones individuales. ¿Las dos? ¿Solo sesiones?
2. **¿Es desktop-only o responsive?** Memoria dice "mobile-first prioridad absoluta". Esto rompería ese principio si es desktop-only. ¿Es admin desktop + alumno mobile?
3. **¿Se trata de un nuevo ítem del backlog o es la maqueta de Q2?** El mockup muestra checks de "Completado" prominentes, que **podría** ser lo que pedía Q2 (tildes en días completados), pero el alcance es mucho más grande.
4. **¿Campo "deporte" del alumno es global o por alumno?** Habría que diseñar opciones (Fútbol/Rugby/Tenis/Natación/Crossfit/etc.).
5. **¿Tipos de sesión cerrados (5) o extensibles?** Si son 5 fijos, alcanza un CHECK constraint; si extensibles, tabla `session_types`.
