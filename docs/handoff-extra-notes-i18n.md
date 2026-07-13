# Handoff: traducción de `plan_exercises.extra_notes` (fase 2 de ejercicios bilingües)

> Para el modelo/sesión que tome esta tarea. Contexto completo abajo; no arranques
> sin leer "Restricciones del entorno".

## Contexto

En 2026-07-13 se implementaron los **ejercicios bilingües** (catálogo): columna
`exercises.i18n jsonb` con `{ en: { name, description, technique_notes } }`,
resolver puro en `src/features/exercises/exercise-display.js` (con tests), campos
EN en el modal de `ExercisesLibraryPage.jsx` (gated por `useCoachFormLanguages`),
y resolución por idioma en las vistas del alumno (`ExerciseCard`, `HistoryPage`,
`ProgressPage`, `EvalByDayForm`/`EvalWorkoutPage`).

**Quedó fuera a propósito**: `plan_exercises.extra_notes` — la nota puntual que la
coach escribe por ejercicio *dentro de un plan*. En `ExerciseCard.jsx` esa nota
**pisa** a la nota técnica del catálogo (`planEx.extra_notes || technique_notes`),
así que un alumno EN hoy puede ver esa nota en español. Se decidió diferirlo porque
es contenido por-plan (la coach arma un plan por alumno) y el volumen es menor.

## Qué hay que hacer

1. **Modelo de datos**: agregar `i18n jsonb` a `plan_exercises` con la misma forma:
   `{ en: { extra_notes } }`. Migración local en `supabase/migrations/` (naming
   `YYYYMMDDHHMMSS_plan_exercises_i18n.sql`) + `apply_migration` remota vía MCP de
   Supabase (proyecto `bvexjanqmfypmtgoapbt`). Patrón de referencia:
   `supabase/migrations/20260713120000_exercises_i18n.sql`.
2. **Resolver**: extender o imitar `exercise-display.js`. Sugerencia: helper
   `planExerciseDisplay(planEx, lang)` que devuelva `{ extra_notes }` con la misma
   regla (traducción no vacía → se usa; si no, canónico). Con tests (vitest,
   ver `exercise-display.test.js`).
3. **UI coach**: el campo EN se edita donde la coach edita `extra_notes` (editor de
   plan: `src/features/plans/` — `PlanExerciseRow.jsx` / `EditPlanPage.jsx`).
   Mostrarlo solo si `useCoachFormLanguages().bilingual`, igual que en
   `ExerciseModal`. Como el plan es por alumno, ideal: mostrar el campo EN solo si
   **ese** alumno tiene `profiles.language === 'en'` (mejor UX que el gate global).
4. **UI alumno**: en `ExerciseCard.jsx` reemplazar `planEx.extra_notes` por el valor
   resuelto (buscar el comentario `extra_notes es por-plan y queda canónica`).
   Verificar que la query de `TodayWorkoutPage.jsx` traiga la nueva columna
   (hoy usa `select('*')` sobre `plan_exercises` → viene sola).
5. **Clonado de planes**: revisar si el clonado (`cloned_from_plan_id`,
   `assign_template_clones...`) copia todas las columnas; si copia explícitamente,
   sumar `i18n`.

## Reglas de diseño (no negociables, para mantener coherencia)

- Canónico = español en la columna base. Traducción **opcional** con fallback.
- El alumno solo VE traducido; nunca se guarda contenido traducido en logs.
- Coaches monolingües no ven ningún cambio de UI.
- Docs del patrón: `docs/plan-formularios-bilingues.md`.

## Restricciones del entorno (sandbox Cowork)

- **NO usar** `git stash`, `npm run build`, ni el hook pre-commit (permisos del
  mount los rompen). Lint/tests a mano (`npx eslint`, `npx vitest run`) y
  `git commit --no-verify`. El push lo hace Franco desde su máquina.
