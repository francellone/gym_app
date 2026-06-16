# 51 — RLS: el alumno lee la estructura de todos sus planes asignados (cross-plan)

Fecha: 2026-06-13
Autor: agente (sesión Franco)
Relacionado: doc 49 (última vez cross-plan), doc 50 (selector/gráfico peso)

## Causa raíz (la que doc 49 y doc 50 NO habían tocado)

El verdadero motivo de "en progreso solo veo los ejercicios del plan actual" y "el
gráfico de peso me muestra una sola carga" NO era la ventana temporal (eso fue un
mis-diagnóstico en doc 50). Era **RLS**.

Todo el modelo de lectura del alumno estaba scopeado al plan ACTIVO vía
`get_my_active_plan_ids()` (= assignments con active=true):
- `plans.student_view_own_plans`: `id IN get_my_active_plan_ids()`
- `plan_exercises.student_view_own_plan_exercises`: `plan_id IN get_my_active_plan_ids()`
- `exercises.student_view_assigned_exercises` → `get_my_assigned_exercise_ids()` que
  internamente también filtraba por `get_my_active_plan_ids()`

`workout_logs` el alumno SÍ los ve todos (`student_id = auth.uid()`), pero al joinear
`plan_exercises` para resolver el ejercicio, el join devolvía **null** para los logs
de planes no-activos → esos logs se caían del selector y de los gráficos.

Las queries por MCP usan service-role (saltean RLS), por eso en el análisis de doc
49/50 veía los 64 ejercicios y parecía cross-plan. En el navegador del alumno (RLS
activa) solo resolvían los del plan activo.

## Confirmación en prod (browser francellone, alumno Franco)

- Selector de Progreso mostraba **23** ejercicios = exactamente los del PLAN 12 activo
  (no los 64 reales).
- Sentadilla Con Barra en 6m mostraba **1 punto** (10/06, PLAN 12). Los 4 de PLAN 11
  (04/05, 11/05, 18/05, 25/05) no aparecían.

## Fix (Opción A, elegida por Franco)

Migración `20260613190000_student_read_assigned_plans_crossplan.sql` (aplicada a prod
vía MCP):
1. Nueva función `get_my_assigned_plan_ids()` = todos los plan_ids del alumno
   (active e inactive). NO se toca `get_my_active_plan_ids()` (la lógica de
   "entrenamiento del día" sigue dependiendo de active=true).
2. `plans` y `plan_exercises` SELECT del alumno pasan a `get_my_assigned_plan_ids()`.
3. `get_my_assigned_exercise_ids()` deriva ahora de todos los planes asignados.

## Verificación

- RLS simulada (rol authenticated, sub=Franco): planes visibles 8, ejercicios
  resolvibles 66, **397/397 logs con plan_exercise resuelto**, y
  `plan_exercises de otro alumno visibles = 0` (seguridad OK).
- En la app post-fix: selector pasó a **64 ejercicios**, default "Jefferson" (más
  historial), y Sentadilla en 6m muestra las 5 fechas (04/05, 11/05, 18/05, 25/05,
  10/06).

## Impacto colateral (bueno)

Esto también destraba la "última vez" de doc 49 en prod: antes el join a
`plan_exercises` de planes viejos también devolvía null, así que el header tampoco
arrastraba historial cross-plan aunque el código ya estuviera. Ahora sí.

## Notas

- El cambio es solo de DB (RLS). No requiere deploy de front. El SQL queda versionado
  en `supabase/migrations/` para traceabilidad (ya aplicado a prod).
- El alumno ahora puede leer la estructura de TODOS sus planes históricos (incluidos
  test/eval). Los logs de evaluaciones igual se filtran en Progreso por plan_type, así
  que no ensucian el selector de entrenamiento.
