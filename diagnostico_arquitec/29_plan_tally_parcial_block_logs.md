# 29 — Plan: tally Día A/B/C "parcial" cuando hay bloques aerobic/circuit

**Fecha:** 2026-05-25
**Autor:** agente (gym_app), reportado por Franco
**Estado:** **CERRADO 2026-05-25 PM — Opción B implementada.** Franco eligió que "día completo" cuente todos los ítems prescriptos (strength + aerobic + circuit), no sólo strength.

---

## 1. Síntoma observable

En el panel del coach (CoachAdherenceList, StudentPanel) y en el panel del alumno (StudentDayTalliesCard), las tildes del día (`Día A ✓✓◐`) marcan **parcial (◐)** sesiones que el alumno completó al 100%.

Casos verificados en prod:
- **Ana Moran (Día B, 25/05):** cargó los 4 ejercicios de fuerza + el bloque TABATA HIIT + activación. workout_session cerrada con `finished_at` y `borg_per_day:{"day_b":6}`. Visual: `Día B ◐◐`.
- **anto almanza (Día C):** mismo patrón reportado por Franco.

## 2. Causa raíz

`src/features/students/dayTalliesLogic.js::computeDayTallies` calcula:

- **Denominador (`sectionTotals[section]`)**: cuenta TODOS los `plan_exercises` con `section LIKE 'day_%'`, sin discriminar por `block_type`.
- **Numerador (`completedByDateSection`)**: cuenta `workout_logs.completed=true` con `plan_exercise_id` que matchea.

**Pero los `plan_exercises` cuyo `plan_blocks.block_type IN ('aerobic','circuit')` NO generan workout_logs por ejercicio** — generan **un único `workout_block_log`** para el bloque entero. Verificado en `src/features/workouts/helpers.js::isBlockCompleted`, que para aerobic/circuit lee `blockLogs[block.id]?.completed`, y en `TodayWorkoutPage` que efectivamente guarda en `public.workout_block_logs`.

Resultado: cualquier día con un bloque aerobic/circuit nunca puede llegar a "entero" porque el numerador siempre va a ser menor que el denominador.

### Confirmación SQL para el Día B de Ana

```
section='day_b' del plan d55ff967-...:
- 4 plan_exercises strength → workout_logs completed=true para los 4 ✓
- 3 plan_exercises circuit  → 0 workout_logs (existe 1 workout_block_log con completed=true)

computeDayTallies → 4/7 → ◐ (parcial)
Realidad → 100% completado → debería ser ✓ (entero)
```

## 3. Impacto

- **UX del coach:** confunde el reporte de adherencia — alumnos que sí entrenaron aparecen como "a medias", lo que dispara alertas falsas en CoachDashboard (Q2).
- **UX del alumno:** ve "◐" en el selector de día aunque hizo todo. Puede desmotivar o llevar a re-cargar.
- **Métricas downstream:** el CoachDashboard usa estos tallies para "Adherencia por alumno (Q2)" y para alertas de estancamiento. Sesgo sistemático hacia "incompleto".

**Alcance:** TODO plan con al menos un bloque tipo `circuit` o `aerobic` está afectado. Hoy son 2 alumnos visibles (Ana, Anto). Todos los planes de Anto que tengan TABATA/HIIT/cardio tienen el mismo bug.

## 4. Restricciones

- Decisión de producto: **¿qué cuenta como "entero"?**
- `computeDayTallies` se invoca desde 5 callers: `StudentPanel`, `CoachAdherenceList`, `StudentDashboard`, `TodayWorkoutPage`, `StudentDayTalliesCard`. Cambio de signature impacta los 5.
- 15 tests existentes en `dayTalliesLogic.test.js` cubren el comportamiento actual.

---

## 5. Opciones

### Opción A — Excluir del denominador los ejercicios de bloques no-strength

**Idea:** un día está "entero" cuando se completan **todos los ejercicios de strength** de esa sección. Los bloques aerobic/circuit no entran en la cuenta.

**Cambios:**
- `planExercises` (input) debe traer `block_type` (joineado desde `plan_blocks`). Modificar los 5 callers que arman ese input.
- `computeDayTallies`: filtrar al armar `sectionTotals` por `pe.block_type === 'strength'`.

**Pros:**
- Cambio chico en `dayTalliesLogic.js` (~5 líneas).
- Cero dependencia de `workout_block_logs` en la función pura.
- Coherente con la idea "el strength es lo que más se trackea ejercicio-por-ejercicio; aerobic/circuit es secundario".

**Contras:**
- Días que SOLO tienen aerobic/circuit (sin strength) quedan con `sectionTotals=0` → invisibles en el tally. Hay que decidir cómo se representan.
- Si el alumno hizo el strength pero NO el TABATA, igual marca ✓. Subreporta "incompleto".
- Cambio de input shape en 5 callers — todos los lugares que arman `planExercises` deben joinear `plan_blocks.block_type`.

### Opción B — Sumar `workout_block_logs` al numerador

**Idea:** un día está "entero" cuando todos los plan_exercises strength tienen log Y todos los plan_blocks aerobic/circuit tienen block_log con `completed=true`.

**Cambios:**
- `computeDayTallies` recibe también `blockLogs` y `planBlocks` (con block_type).
- Denominador = strength_exercises_count + non_strength_blocks_count.
- Numerador = workout_logs.completed + workout_block_logs.completed.

**Pros:**
- Cuenta TODO lo que el alumno hizo — alineado con `isSectionCompleted` (que ya funciona bien en TodayWorkoutPage).
- Es lo "correcto" semánticamente: el día está completo si se completó todo lo prescripto.

**Contras:**
- Cambio más grande en `dayTalliesLogic.js` (~30 líneas).
- 5 callers deben pasar 2 datasets más (`blockLogs`, `planBlocks` con block_type).
- 15 tests existentes hay que rehacerlos o extenderlos.
- Más fetches del lado del coach (CoachAdherenceList ya fetchea bastante).

### Opción C — Persistir el "día completado" en `workout_sessions`

**Idea:** dejar de calcular en cliente; agregar columna `completed_days jsonb` en `workout_sessions` (ej. `{"day_a": true, "day_b": false}`) que el back actualiza vía trigger o RPC cuando se completan los logs/block_logs.

**Cambios:**
- Migración: nueva columna + trigger AFTER INSERT/UPDATE en workout_logs y workout_block_logs.
- `computeDayTallies` se simplifica a un agregado sobre `workout_sessions.completed_days`.
- Tests del back para el trigger.

**Pros:**
- Single source of truth en el back. Coach y alumno leen lo mismo sin recalcular.
- Backfill posible para corregir el histórico.

**Contras:**
- Mucho más alcance (back + migración + trigger + cliente).
- Hay que decidir el contrato del trigger (¿qué pasa con bloques sin strength?).
- Cambia la arquitectura de adherencia — afecta otros consumidores futuros.

---

## 6. Recomendación

**Opción A** si Franco prefiere el fix mínimo y acepta que "día completo" = "fuerza completa". Es la más rápida y consistente con la intuición del coach (lo importante es la fuerza, lo demás es complemento).

**Opción B** si Franco quiere que "día completo" signifique literalmente "todo lo prescripto hecho", incluyendo TABATA/cardio. Es más prolija pero más cara.

**Opción C** solo si se planea reusar "día completo" en muchos otros lados (notificaciones, scoring, etc.). Hoy no se justifica.

## 7. Próximos pasos (cuando Franco decida)

1. Confirmar opción A / B / C.
2. Si A o B: armar fix con tests + handoff de migración del input. Mantener los 15 tests vigentes y agregar 2-3 nuevos para los casos de bloque no-strength.
3. Si C: handoff al back primero.
4. Verificar en prod con Ana y Anto.

---

## 8. Implementación 2026-05-25 PM — Opción B

### Cambios aplicados

**`src/features/students/dayTalliesLogic.js`** — nueva firma:

```js
computeDayTallies({ logs, planExercises, blockLogs, planBlocks })
```

`planExercises` ahora puede traer `block_id`. `planBlocks` (nuevo) trae `id, section_id, block_type`. `blockLogs` (nuevo) trae `logged_date, plan_block_id, completed`.

Reglas implementadas:
- Para cada section `day_X`, el denominador suma:
  - todos los `plan_exercises` cuyo `plan_blocks.block_type === 'strength'` (cuentan por ejercicio)
  - cada `plan_blocks` aerobic/circuit cuenta como **1 ítem**
- Numerador:
  - `workout_logs.completed=true` por plan_exercise_id de bloque strength
  - `workout_block_logs.completed=true` por plan_block_id de bloque aerobic/circuit
- **Backward-compatible**: si el caller no pasa `planBlocks`, comportamiento legacy (todos los PE se tratan como strength). Los 15 tests originales pasan sin tocar.

### Callers actualizados (5)

Cada uno fue extendido para hacer 2 fetches adicionales (`plan_blocks`, `workout_block_logs`) y pasarlos a `computeDayTallies`:

- `src/features/dashboard/components/StudentPanel.jsx` — panel del coach por alumno
- `src/features/dashboard/components/CoachAdherenceList.jsx` — adherencia agrupada del coach (batched por planIds)
- `src/features/dashboard/pages/StudentDashboard.jsx` — dashboard del alumno
- `src/features/students/components/StudentDayTalliesCard.jsx` — card del coach en perfil del alumno
- `src/features/workouts/pages/TodayWorkoutPage.jsx` — ya tenía `planBlocks` + `recentBlockLogs` cargados, solo se conectaron al useMemo

### Tests

- 15 tests originales: verdes sin cambios.
- 8 tests nuevos en `dayTalliesLogic.test.js`:
  - "strength + circuit ambos completados → entero"
  - "strength completo pero circuit faltante → parcial"
  - "PE de bloques no-strength se ignoran del denominador"
  - "día solo con bloque aerobic/circuit → block_log entero"
  - "legacy sin planBlocks → comportamiento previo"
  - "block_log con completed=false no cuenta"
  - "block_log de un plan_block fuera del plan se ignora"
  - "bloque con `__virtual` se ignora"
- Total: **257 tests verdes** (todo el proyecto).
- ESLint: 0 errores nuevos. 11 warnings preexistentes en TodayWorkoutPage no relacionados.

### Diff stat

```
src/features/dashboard/components/CoachAdherenceList.jsx |  48 ++++++-
src/features/dashboard/components/StudentPanel.jsx       |  33 ++++-
src/features/dashboard/pages/StudentDashboard.jsx        |  18 ++-
src/features/students/components/StudentDayTalliesCard.jsx |  22 ++-
src/features/students/dayTalliesLogic.js                 | 110 ++++++++++---
src/features/students/dayTalliesLogic.test.js            | 150 +++++++++++++++
src/features/workouts/pages/TodayWorkoutPage.jsx         |  13 +-
7 files changed, 361 insertions(+), 33 deletions(-)
```

### Validado en prod (2026-05-25 PM)

**Hotfix encontrado durante la validación:** Tres commits para llegar a verde:
1. `18905a7` — implementación inicial Opción B
2. `545061e` — hotfix: la columna real en `plan_blocks` es `section`, no `section_id`. Fix en los 5 callers + tests.

**Resultados después del hotfix:**

- **Ana Moran (Día B):** ✅ pasa de ◐◐ a ✓✓ — los 4 strength + el TABATA cuentan correctamente.
- **anto almanza (Día C):** ◐ se mantiene, **y es correcto**. Verificado por SQL: Anto carga sistemáticamente 3 de los 5 ejercicios del Día C (todas las veces: Kettlebell Swing, Peso Muerto Barbell, SINGLE HOP PLATE). Esquiva consistentemente **Chin Ups** y **DIPS** las 3 sesiones (30/04, 07/05, 15/05). El ◐ es señal real para el coach, no ruido del cálculo.

### Aprendizaje de producto

El tally parcial pasó de ser ruido (bug que ocultaba sesiones completas) a ser **señal accionable** para el coach. Anto puede ahora preguntarle a su alumno por qué esos dos ejercicios específicos quedan sin cargar — es info que antes estaba oculta detrás del bug.
