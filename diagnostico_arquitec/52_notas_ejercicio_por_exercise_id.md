# 52 — Notas del ejercicio: filtrar por exercise_id, no por context_type

Fecha: 2026-06-16
Autor: agente (sesión Franco)
Relacionado: doc 49 (última vez cross-plan), Q1 (chat/historial por ejercicio)

## Síntoma reportado (Franco)

En algunos ejercicios no aparece la nota asociada, cuando la idea de Q1 era mostrar
la última nota de cada ejercicio. Ejemplo concreto: alumno **Franco Cellone**,
ejercicio de activación **"Carpa toco pie contrario"** tiene notas asociadas pero no
aparecen en el módulo de ejercicios.

## Causa raíz

Las notas existen y están bien: 3 notas vivas, `shared`, con `exercise_id` correcto
(`b79e656f-…`), en el thread del alumno. El problema es **dónde se guardan vs. cómo
se leen**.

El flujo activo escribe las notas del ejercicio (las que se cargan **entrenando**)
con `context_type='workout_log'` — es el "mirror" que documenta el propio
`features/workouts/README.md` (la columna `workout_logs.notes` quedó obsoleta y
escribe `postWorkoutLogNote`). Esas notas traen `exercise_id`.

Pero el módulo del ejercicio leía **solo** `context_type='exercise'`:
- `TodayWorkoutPage.jsx` (fetch del preview/badge): `.eq('context_type','exercise')`
- `ExerciseChatDrawer.jsx` (fetch del chat completo): `.eq('context_type','exercise')`
- `exerciseHistoryLogic.js`: las 3 funciones (`pickLastCoachNotePerExercise`,
  `countNotesByExercise`, `groupNotesByExercise`) descartaban todo lo que no fuera
  `context_type==='exercise'`.

Resultado: las notas cargadas entrenando (la mayoría) nunca alimentaban ni la
"última nota del coach", ni el badge 💬, ni el drawer.

### Magnitud (prod, vía MCP service-role)

Notas vivas con `exercise_id`, por context_type:
- `workout_log`: 153 (18 coach / 135 alumno) — **se ignoraban**
- `exercise`: 15 (12 coach / 3 alumno) — únicas que se mostraban

Todas `shared`. Ninguna `coach_private`. Es decir, el módulo mostraba ~9% del
contenido real del ejercicio.

## Doc vs. real

El código (y el comentario "Q1") asumía `context_type='exercise'`, pero el README
del mismo feature dice que el flujo escribe `workout_log`. La realidad es
`workout_log`; el preview quedó desalineado. **Se establece como real: el criterio
de una "nota de ejercicio" es tener `exercise_id`, sin importar el context_type.**

## Decisión (Franco)

1. El criterio pasa a ser **`exercise_id IS NOT NULL`** (no enumerar context_types).
   Es equivalente hoy a `IN ('exercise','workout_log')` —los demás context_types no
   traen exercise_id— pero a prueba de futuro.
2. **Resumen** ("última nota" del header/body) sigue siendo **coach-only**.
3. **Badge 💬 + chat completo (drawer)** muestran **ambos lados** (coach + alumno).
4. Si no hay nota del coach pero sí del alumno: no hay texto de "última nota", pero
   el badge 💬 aparece igual y se entra al chat a verlas.

## Cambios

- `src/features/workouts/pages/TodayWorkoutPage.jsx`: fetch del preview pasa de
  `.eq('context_type','exercise')` a `.not('exercise_id','is',null)`.
- `src/features/workouts/components/ExerciseChatDrawer.jsx`: quita
  `.eq('context_type','exercise')`, deja `.eq('exercise_id', exerciseId)`.
- `src/features/workouts/exerciseHistoryLogic.js`: las 3 funciones dejan de filtrar
  por context_type; el gate real es `exercise_id` (+ shared / no-deleted / coach en
  el caso del resumen).
- `src/features/workouts/exerciseHistoryLogic.test.js`: actualizados los 3 tests que
  asumían el comportamiento viejo (workout_log ahora cuenta).

## Verificación

- `vitest run src/features/workouts` → **86/86 OK** (incluye los 27 de
  exerciseHistoryLogic).
- Simulación con datos reales (Franco Cellone / Carpa toco pie contrario):
  badge = **3**, última nota coach = "es solo la intención constante…". Correcto.
- Smoke en prod (browser francellone, vista alumno) — PENDIENTE tras push.

## Pendiente

- Push a main (Vercel no deploya sin push) + smoke en prod.
