# Handoff próximo agente — 2026-05-23 (late night)

> **Continuación directa del handoff 17.** Doc 17 recomendaba `Q2 → plan G2 escrito → Q1 cuando llegue foto`. Esta sesión cumplió Q2 entero, escribió el plan G2 ampliado (doc 19) y además **implementó la Opción C completa**, escalando bastante más allá de lo que doc 17 planificaba. Q1 sigue pendiente (Franco decidió avanzar sin esperar foto — ver §6).

## Pre-flight al arrancar próxima sesión

1. Leer este doc + handoff 17 + memoria (especialmente la entrada nueva `project_q1_decision_franco_chat_historial.md`).
2. Confirmar Supabase MCP apunta a `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1).
3. Browser: usar **francellone** (`deviceId 5c324fc5-b1e8-4e0f-b5bd-ab5054057e08`).
4. Working dir: `~/Desktop/gym_app/gym_app/`. Vite: `npm run dev` → `http://localhost:5173`.
5. Verificar si Franco mergeó los 3 commits de esta sesión (`git log -5`). Si no, no se mostrarán los cambios en prod.

## Items cerrados esta sesión

### Q2 — Tildes en días completados (doc 13 §Q2)

Pedido literal Anto: "DIA A ✓✓✓ = 3 veces, DIA B ✓✓ = 2".

**Decisiones Franco 2026-05-23 night** (registradas vía AskUserQuestion):

1. **Umbral**: 100% estricto. Entero = todos los `workout_logs.completed=true` para los `plan_exercises` de ese `section` en esa fecha. Parcial = >0% pero <100%.
2. **Símbolo**: tilde lleno + media luna (`Día A ✓✓◐` = 2 enteros + 1 parcial).
3. **Cap visual**: ≥5 colapsa a `×N (M◐)` (ej `Día A ×7 (1◐)`).

**Archivos nuevos:**

- `src/features/students/dayTalliesLogic.js` — funciones puras `computeDayTallies` + `formatTallyForDisplay`.
- `src/features/students/dayTalliesLogic.test.js` — 15 tests, todos verdes.
- `src/features/students/components/DayTalliesBadge.jsx` — pills visuales reutilizables (variant `default` + `compact`).
- `src/features/students/components/StudentDayTalliesCard.jsx` — card self-contained para coach (fetch propio).

**Archivos modificados (4 ubicaciones):**

- `src/features/dashboard/pages/StudentDashboard.jsx` — widget debajo del heatmap "Esta semana" (vista alumno).
- `src/features/students/pages/StudentDetailPage.jsx` — `<StudentDayTalliesCard />` entre la card de perfil y los tabs (vista coach).
- `src/features/workouts/pages/TodayWorkoutPage.jsx` — tildes adentro de cada botón del selector de día A/B/C/D (alumno al elegir qué entrenar).
- `src/features/dashboard/pages/CoachDashboard.jsx` — bloque "Adherencia por alumno" con tildes por alumno + plan vigente.

### Dashboard coach expandido (doc 19 Opción C, fases C.1-C.5)

Mockup G2 + foto del calendario coach por alumno → implementación full. Doc 19 explica las 3 opciones y el pivote.

**Fase C.1 — Filtros globales + integración con KPIs y adherencia:**

- `src/features/dashboard/dashboardPeriods.js` + `.test.js` — utilidad pura para resolver `periodKey` a `{start, end}` YMD. 14 tests.
- `src/features/dashboard/hooks/useCoachDashboardFilters.js` — hook con sync de URL params + localStorage backup. Resuelve dependencia plan → alumno.
- `src/features/dashboard/components/DashboardFilterBar.jsx` — UI de los 3 dropdowns con botón "Limpiar".
- `CoachDashboard.jsx` — refactor del fetch para honrar los filtros en stats grid + actividad reciente.
- `CoachAdherenceList.jsx` — sumé props `filterStudentId / filterPlanId / filterPeriodRange`.

**Fase C.2 — Panel del alumno (solo si hay alumno seleccionado):**

- `src/features/dashboard/studentPanelLogic.js` + `.test.js` — 34 tests cubriendo:
  - `computeDonutData` (sesiones por section)
  - `computeCompletedDays` / `computeAveragePSE`
  - `computeExpectedDaysInWindow` (fixed con expected dates o flexible con pro-rata)
  - `computeAdherencePct` (cap 200%)
  - `computeExerciseProgress` (sumado en refinamiento — ver más abajo)
  - `buildMotivationalMessage` (4 buckets — empty/bad/meh/good/great)
- `src/features/dashboard/components/StudentPanel.jsx` — recharts donut + 4 KPI tiles + tildes detalladas + banner motivacional + **bloque "Progreso por ejercicio"** (refinamiento ↓).

**Fase C.3 — Próximas evaluaciones:**

- `src/features/dashboard/components/UpcomingEvaluations.jsx` — lista de `plan_assignments` con `plan_type='evaluation'` próximos. Filtra por alumno cuando hay filtro global.

**Fase C.4 — MonthlyCalendar sincronizado:**

- `MonthlyCalendar.jsx` — sumé prop `controlledSelectedIds`. Cuando se pasa, deshabilita el filter bar interno y muestra "Filtro global activo". Recibe del padre la lista de alumnos del filtro.

**Fase C.5 — 4 alertas G2 nuevas en `alerts.js`:**

- `computeFatigueStudents` — `energy_level ≤ 5` o `muscle_fatigue ≥ 7` en 3+ días dentro de 14.
- `computeLowMotivationStudents` — `stress_level ≥ 7` sostenido + combo `stress ≥ 6 + energy ≤ 4` + keywords desmotivacionales en notes.
- `computePainStudents` — keyword search en `wellbeing_logs.notes` (≥1 mención, ventana 21d) + `muscle_fatigue ≥ 8` sostenido en 3+ días como señal complementaria. Muestra snippet de nota matcheada.
- `computeStagnationByExercise` — **por ejercicio** (refactor del 23/05 late). Compara `max(actual_weight)` primera vs segunda mitad de 21 días por `(student, exercise)`. Lista los ejercicios concretos: matchea G2 mockup ("Sentadilla sin mejoras hace 3 semanas").
- `useCoachAlerts.js` — sumé fetch de `wellbeing_logs` + extendí select de `workout_logs` para incluir join al ejercicio.
- `CoachDashboard.AlertCard` — sumé titles + subtitles para los 4 kinds nuevos.

**Umbrales en `ALERT_THRESHOLDS`** (centralizado, tuneable sin tocar otro archivo):

```js
LOW_ENERGY_THRESHOLD: 5,
HIGH_MUSCLE_FATIGUE_THRESHOLD: 7,
FATIGUE_MIN_DAYS: 3,
HIGH_STRESS_THRESHOLD: 7,
LOW_MOTIVATION_MIN_DAYS: 3,
WELLBEING_WINDOW_DAYS: 14,
PAIN_KEYWORDS: ['dolor', 'molestia', 'duele', 'me molesta', 'sigue molestando', 'lesion', 'lesión'],
PAIN_MIN_MENTIONS: 1, // bajado de 2→1 el 23/05 night
PAIN_WINDOW_DAYS: 21,
STAGNATION_WINDOW_DAYS: 21,
STAGNATION_PER_EXERCISE_MIN_LOGS: 3,
MUSCLE_FATIGUE_PAIN_THRESHOLD: 8,
MUSCLE_FATIGUE_PAIN_MIN_DAYS: 3,
```

### Refinamientos post-validación browser (23/05 late night)

Franco vio el dashboard real y pidió ajustes:

1. **Fix bug "Esperados/Adherencia salen como —":** el SELECT de `useCoachDashboardFilters` no traía `sessions_per_week`, `schedule_mode` ni `preferred_days`. Sin esos campos, `computeExpectedDaysInWindow` retornaba 0 y los KPIs caían al fallback "—". Sumado al SELECT.
2. **Estancamiento por ejercicio** (ya descrito arriba en C.5) — reemplaza la versión aggregate inicial.
3. **Bloque "Progreso por ejercicio" en `StudentPanel`** — tabla: ejercicio | antes | ahora | Δ (↑/→/↓ con kg) | logs. Ordenado: up → flat → down → insufficient.
4. **"Actividad reciente" → "Últimas sesiones agrupadas":** antes mostraba 10 logs sueltos por ejercicio (poco útil al coach). Ahora 1 fila por sesión con día A/B/C (derivado del section dominante de los logs), # ejercicios completados, PSE promedio (de `borg_per_day` jsonb), duración (sólo si started_at + finished_at son del mismo día — respeta la trampa de `finished_at` siempre puesto, ver memoria `project_duracion_sesion_no_confiable.md`), badge "Carga tardía" si `logged_late=true`. Componente `SessionRow` en `CoachDashboard.jsx`.
5. **Alerta dolor mejorada** — bajé `PAIN_MIN_MENTIONS` de 2→1 (matchea G2 que decía "2-3 veces" pero queremos detectar antes). Sumé `muscle_fatigue ≥ 8 sostenido` como señal complementaria. Subtítulo de la alerta muestra el snippet de la nota matcheada (matchea mockup G2 "Molestia lumbar repetida").

## Commits de esta sesión (pendientes — Franco con `--no-verify`)

Sin pushear todavía. 3 commits temáticos sugeridos:

```bash
cd ~/Desktop/gym_app/gym_app

# Limpieza opcional de residuos vitest (sigue desde handoff 17)
rm -f vitest.config.js.timestamp-*.mjs

# Commit 1: Q2 — tildes en 4 ubicaciones
git add \
  src/features/students/dayTalliesLogic.js \
  src/features/students/dayTalliesLogic.test.js \
  src/features/students/components/DayTalliesBadge.jsx \
  src/features/students/components/StudentDayTalliesCard.jsx \
  src/features/dashboard/pages/StudentDashboard.jsx \
  src/features/students/pages/StudentDetailPage.jsx \
  src/features/workouts/pages/TodayWorkoutPage.jsx \
  src/features/dashboard/components/CoachAdherenceList.jsx
git commit --no-verify -m "feat(students): tildes ✓✓◐ por día completado en 4 vistas (Q2)"

# Commit 2: dashboard coach expandido (Opción C doc 19)
git add \
  src/features/dashboard/dashboardPeriods.js \
  src/features/dashboard/dashboardPeriods.test.js \
  src/features/dashboard/studentPanelLogic.js \
  src/features/dashboard/studentPanelLogic.test.js \
  src/features/dashboard/hooks/useCoachDashboardFilters.js \
  src/features/dashboard/hooks/useCoachAlerts.js \
  src/features/dashboard/alerts.js \
  src/features/dashboard/components/DashboardFilterBar.jsx \
  src/features/dashboard/components/StudentPanel.jsx \
  src/features/dashboard/components/UpcomingEvaluations.jsx \
  src/features/dashboard/components/MonthlyCalendar.jsx \
  src/features/dashboard/pages/CoachDashboard.jsx
git commit --no-verify -m "feat(dashboard): coach expandido — filtros + panel alumno + alertas G2 + estancamiento por ejercicio (doc 19 Opción C)"

# Commit 3: docs y transcripciones
git add \
  diagnostico_arquitec/18_plan_calendario_coach_por_alumno.md \
  diagnostico_arquitec/19_plan_dashboard_coach_expandido.md \
  diagnostico_arquitec/20_handoff_proximo_agente_2026-05-23_late_night.md \
  diagnostico_arquitec/assets/COACH_calendario_alumno_transcripcion.md
git commit --no-verify -m "docs(diagnostico_arquitec): plan 18 calendario coach + plan 19 dashboard expandido + handoff 20"

git push origin main
```

## Lint + tests + smoke

- **Lint**: `npm run lint` → **0 errors, 69 warnings**. Baseline del 23/05 night era 64; +5 warnings nuevos, todos del patrón `react-hooks/set-state-in-effect` que el codebase ya acepta en múltiples lugares (TodayWorkoutPage, etc.). Aceptable según convención.
- **Tests**: `npm run test:run` → **186/186 verdes** en ~10s. Sumé 63 nuevos tests sobre baseline 123:
  - 15 tests en `dayTalliesLogic.test.js`
  - 14 tests en `dashboardPeriods.test.js`
  - 34 tests en `studentPanelLogic.test.js` (Q2 helpers + dashboard logic + progress por ejercicio)
  - (sin tests para alertas G2 nuevas — pendiente C.5 si Franco lo prioriza)
- **Smoke browser**: hecho en `http://localhost:5173/coach` con Franco logueado como Anto. Validados: filtros, KPIs alumno-céntricos, panel con donut + KPIs + tildes + progreso por ejercicio, alertas (estancamiento por ejercicio listando "Jefferson, BARBELL BICEP, Sentadilla Con Barra +7" para Franco), últimas sesiones con día A/B/C + ejercicios + PSE + duración, calendario sincronizado mostrando "Filtro global activo".
- **Smoke Q6 (handoff 17)**: **AÚN PENDIENTE** de Franco — sigue del handoff anterior.

## Bloqueos abiertos / pendientes para próxima sesión

1. **Q6 smoke + commit** (sigue desde handoff 17). Q6 está implementado y validado por SQL. Falta tu `npm run dev` + recorrer el flow del alumno editando perfil + ver notif al coach. Después merge en main.
2. **Q1 — sin foto, con requerimiento nuevo de Franco:** ver §6 abajo y memoria `project_q1_decision_franco_chat_historial.md`.
3. **C.6 deferido** — calendario semanal embebido en `StudentPanel`. Overlap con `MonthlyCalendar` global, baja prioridad. Si Anto pide específicamente la vista semanal por alumno, reabrir.
4. **Tareas comunes del doc 18** (no afectan Q1 ni Opción C, pero quedan pendientes):
   - Sumar columna `sport` a `profiles` (nullable text). 1 migración chica.
   - Refactor del header de `StudentDetailPage` para usar `avatar_url` real.
   - Reorganización de tabs (10→7 con "Más ▾"). Decisión: opción suave en V1.
5. **Sin tests unitarios para las 4 alertas G2 nuevas** (`computeFatigueStudents`, `computeLowMotivationStudents`, `computePainStudents`, `computeStagnationByExercise`). Vale sumar si se va a iterar sobre umbrales.
6. **Limitaciones documentadas en doc 19 § asumidos por Franco para C.5:**
   - Dolor: keyword search en `wellbeing_logs.notes` + `muscle_fatigue` numérico. Sin tabla específica de dolor zonal.
   - Baja motivación: solo señales numéricas + keywords. No NLP serio.
   - Estancamiento: por ejercicio ✅. Pero el bloque "Progreso por ejercicio" en panel también usa aggregate por ejercicio dentro del período — coherente.
7. **F5 (resumen semanal alumno)** — el componente del banner motivacional + KPIs del Panel del alumno se pueden reusar cuando llegue F5. Diseño deliberado de doc 19 (D5).
8. **Foto de Anto Q1 y vista lista coach G2** — si llegan después, ajustar lo ya hecho.

## Mensaje para arrancar próxima sesión con Q1 (copy-paste para Franco)

```
Pre-flight: (1) leé diagnostico_arquitec/20_handoff_proximo_agente_2026-05-23_late_night.md
completo + doc 13 §Q1 (líneas 60+) + memoria `project_q1_decision_franco_chat_historial.md`.
(2) confirmá Supabase MCP apuntando a bvexjanqmfypmtgoapbt + browser francellone.
(3) verificá `git log -5` — los 3 commits de Q2/dashboard expandido/docs ya deberían estar
mergeados; si no, no avancés hasta que los pushee.

Tarea: arrancar Q1 (últimas notas/pesos visibles en flow workout) sin esperar la foto de
Anto que nunca llegó. Decisión de Anto resp 2 ya tomada: mostrar comentarios del COACH +
últimos pesos por alumno (NO notas del alumno).

REQUERIMIENTO NUEVO (Franco 23/05 late night, no documentado en doc 13): además de la
última nota del coach por ejercicio, el alumno debe poder ver el HISTORIAL COMPLETO del
chat de ese ejercicio mientras está cargando el workout. Pensar UX: probablemente un
chevron / botón "Ver chat completo" al lado de la última nota que abre un drawer/modal
con el thread entero.

Antes de codear: hacé un mini-plan A/B/C de cómo encarar el layout en TodayWorkoutPage
(card de ejercicio con sub-bloque "Última vez" + último comentario + botón a chat
completo). No es >500 LOC pero la UX dentro de la página más densa de la app — vale la
pena 30 min de planning antes que rebote. Q1 estimado del doc 13: 1 día.

Datos a consultar:
- workout_logs ordenado por logged_date desc por plan_exercise_id (último peso/reps reales)
- notes joineado con note_threads filtrado por (student_id, exercise_id o plan_exercise_id,
  author_role='coach') — verificar context_type que usa el código actual
- Para el chat completo: el mismo thread sin filtrar por author_role

Trampas conocidas (todas siguen vigentes desde doc 17):
- husky/lint-staged falla en sandbox. Commits desde tu terminal con --no-verify.
- Si aparece .git/index.lock huérfano: rm -f .git/index.lock antes del commit.
- notifications.type, NO kind. CHECK actual tiene 12 tipos. Si sumás tipo nuevo: ampliar
  CHECK + TYPE_CONFIG + getNotificationTargetUrl en NotificationBell.jsx.
- TodayWorkoutPage es la página más densa del proyecto (~1500 LOC tras refactor previo).
  Cualquier cambio ahí es alto riesgo — tests + smoke obligatorios.

Mi voto: 1) plan A/B/C express del layout (~30 min); 2) implementar la opción elegida
(~6-8h); 3) tests + smoke; 4) handoff 21. NO meter más features encima — Q1 es el último
de los Q quick wins según doc 13 §Orden de ataque.
```

## Trampas técnicas confirmadas o descubiertas esta sesión

1. **SELECTs incompletos en hooks de filtros rompen lógica downstream silenciosamente.** El bug `expectedDays=0` se dió porque `useCoachDashboardFilters` no traía `sessions_per_week` ni `schedule_mode`. Caer al fallback "—" no rompió la UI pero ocultó el error. Lección: cuando un helper espera fields específicos, documentar la lista mínima requerida y verificar contra el SELECT real del hook que lo alimenta.
2. **`workout_sessions.finished_at` siempre puesto** (ya documentado en memoria 23/05 night). Esta sesión lo aplicó: en "Últimas sesiones" la duración solo se calcula si `started_at` y `finished_at` caen en el mismo día calendario, sino se omite.
3. **`section` de `plan_exercises` es la fuente de verdad del día A/B/C ejecutado.** Documentado en doc 18. Se reutilizó para: tildes Q2, donut por section, estancamiento por ejercicio, día dominante de sesión en "Últimas sesiones".
4. **`borg_per_day` JSONB en `workout_sessions`** contiene `{day_a: 7, day_b: 8, ...}` con PSE por día tocado en esa sesión. Útil para PSE promedio de sesión sin re-consultar logs.

## Decisiones de Anto vigentes (sin cambios respecto a docs 13/17)

Sin cambios. Lo que aplicó esta sesión: Q2 resp 1 = A (formato "DIA A ✓✓✓"). Q1 resp 2 = "DEL COACH + últimos pesos por alumno" (sigue vigente para próxima sesión).

## Defensa contra confusión futura

- **doc 17 era "Q2 + plan G2 + Q1 con foto"**. Esta sesión cumplió Q2 y **escaló G2 de plan a implementación full** dentro del dashboard expandido (Opción C de doc 19). Q1 quedó intocado.
- **El dashboard del coach se reorganizó.** Si un agente futuro busca "Actividad reciente" no la va a encontrar — se renombró a "Últimas sesiones" y cambió completamente. El componente `SessionRow` está en el mismo `CoachDashboard.jsx`.
- **Los filtros del dashboard se persisten en URL primero, localStorage backup.** Si un agente toca el hook `useCoachDashboardFilters` para sumar más filtros, mantener el patrón: setOrDelete via setSearchParams + writeStorage.
- **C.6 deferido a propósito.** No está en backlog activo. Reabrir solo si Anto lo pide explícitamente.

## Tasks list al cierre

- ✅ Pre-flight (handoff 17 + Supabase + browser francellone)
- ✅ Procesamiento foto recibida (COACH calendario coach por alumno → transcripción)
- ✅ Modelo BD inspeccionado (descubrimiento: `workout_logs.plan_exercise_id → plan_exercises.section` ya derivable, no requiere migración)
- ✅ Doc 18 (plan calendario coach por alumno A/B/C) con pivote a Q2 documentado arriba
- ✅ Q2 — helper + componente + 4 ubicaciones (incluye Adherencia por alumno en CoachDashboard)
- ✅ Doc 19 (plan dashboard coach expandido)
- ✅ Fase C.1 — Hook + FilterBar + integración con KPIs + Adherencia
- ✅ Fase C.2 — Panel del alumno + bloque progreso por ejercicio
- ✅ Fase C.3 — Próximas evaluaciones
- ✅ Fase C.4 — MonthlyCalendar sincronizado
- ✅ Fase C.5 — 4 alertas G2 nuevas + estancamiento por ejercicio + dolor mejorado
- ✅ Refactor "Actividad reciente" → "Últimas sesiones"
- ✅ Lint + tests verdes (0 errors, 186/186 tests)
- ✅ Smoke browser end-to-end
- ⏭ Smoke browser Q6 (Franco — sigue del handoff 17)
- ⏭ 3 commits + push (Franco con `--no-verify`)
- ⏭ Q1 (próxima sesión — sin foto, con requerimiento nuevo de historial chat)
- ⏭ C.6 deferido (calendario semanal embebido)
