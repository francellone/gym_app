# 38 — Spec de implementación: evals por día + método por ejercicio (fase 1, Opción A)

**Fecha:** 2026-05-30. **Depende de:** doc 37 (decisión Opción A + un solo cajón `plan_exercises`).
**Regla de oro:** DB-data move + código + push van en UN solo deploy. La foundation (columnas + backfill científicas) YA está en prod (migración `eval_per_exercise_method_phase1_columns`).

---

## 1. Alcance (qué entra y qué no)

**Entra** — el feature aplica a los tipos de evaluación **basados en ejercicios**: `one_rm`, `max_reps`, `custom`, y un tipo nuevo `mixed`. Para estos:
- Organización por **días** (Día A/B/C…), reusando `getDynamicSections`.
- **Método por ejercicio:** cada ejercicio lleva su propio `eval_type` + `eval_method`, con toggle **"Mismo método para todos / Método por ejercicio"**.

**No entra (queda igual que hoy):** los tipos de protocolo entero `power`, `cardio`, `body_comp`, `scored` — son tests de evaluación única (Cooper, FMS, etc.), no por ejercicio. Sin días, sin método por ejercicio. Su flujo no se toca.

**Tipo nuevo `mixed`:** se agrega a `EVAL_TYPES` (`features/evaluations/helpers.js`) con label "Mixta / Por ejercicio", icon 🔀. Es la opción que el coach elige cuando quiere mezclar (ej. 1RM en un ejercicio, fuerza-resistencia en otro). `evalTypeLabel`/`evalTypeIcon` ya hacen fallback al key, así que no rompe.

---

## 2. Modelo de datos (cajón único = `plan_exercises`)

Cada ejercicio de una eval basada en ejercicios es una fila de `plan_exercises`:
- `plan_id`, `exercise_id` (**obligatorio, del catálogo** — se quita el nombre libre), `section` (`day_a`/`day_b`/…), `order_index`.
- `eval_type` (por ejercicio: `one_rm` | `max_reps` | `custom`), `eval_method` (formula 1RM, variante max_reps, o tipo de prueba custom como `libre`/`reps`/`tiempo`/`peso`/…).
- `expected_value`, `expected_unit`, `mandatory`, `instructions` (para pruebas custom; opcionales en científicas).
- Campos de carga (one_rm/max_reps): reusar `suggested_sets`/`suggested_reps` etc. como hoy para armar los sets del formulario.

**Default del per-exercise `eval_type`:** si el plan es `one_rm`/`max_reps`/`custom` → cada fila hereda ese tipo; si es `mixed` → el coach elige por fila.

**Resultados (DECISIÓN):** agregar a `evaluation_test_responses` una columna `plan_exercise_id uuid NULL REFERENCES plan_exercises(id) ON DELETE CASCADE` + hacer `test_id` nullable. Para las evals basadas en ejercicios, se guarda **una response por ejercicio** keyed por `plan_exercise_id`, con `student_response` jsonb:
- `one_rm`: `{ weight_kg, reps, one_rm_estimated }`
- `max_reps`: `{ reps }`
- `custom`: `{ value, unit }`

`evaluation_results` sigue siendo el contenedor (1 por student+plan+eval_date). Los comentarios del alumno siguen yendo al panel de notas keyed por response id (`postEvalCommentNote`, sin cambios). Los protocolos enteros (`power`/`cardio`/…) **mantienen** su guardado actual en `evaluation_results.results` jsonb.

**UNIQUE:** reemplazar el unique `(evaluation_result_id, test_id)` por uno que contemple `plan_exercise_id` (ej. unique parcial por cada key, o `(evaluation_result_id, coalesce(test_id, plan_exercise_id))`). Definir en la migración de cutover.

---

## 3. Migración de cutover (en el mismo deploy que el código)

1. DDL: `evaluation_test_responses` + `plan_exercise_id` (FK, nullable) + `test_id` nullable + ajustar UNIQUE.
2. Mudar las 32 pruebas `evaluation_tests` → `plan_exercises`:
   - `section='day_a'`, `order_index` conservado, `exercise_id` (todas lo tienen), `eval_type='custom'`, `eval_method = test_type` (el tipo de prueba: libre/reps/…), `instructions`, `expected_value`, `expected_unit`, `mandatory`.
   - Mapear `evaluation_tests.id` → nuevo `plan_exercises.id` (tabla temporal o CTE con RETURNING).
3. Reatar las **8** `evaluation_test_responses`: setear `plan_exercise_id` = nuevo id según el mapeo de `test_id`.
4. Para `mixed`/existentes: las científicas one_rm ya tienen `eval_type` seteado (foundation).
5. Verificar conteos (32 movidas, 8 reatadas, 0 huérfanas) con SELECT antes de cerrar la transacción.
6. **No** borrar `evaluation_tests`/`test_id` todavía (cleanup en fase 2, tras confirmar smoke).

---

## 4. Cambios de código por archivo

### `src/features/evaluations/helpers.js`
- Agregar `mixed` a `EVAL_TYPES`. Agregar `METHODS.mixed = []` (no aplica método a nivel plan).
- Exponer helper para listar los tipos por-ejercicio elegibles: `EXERCISE_EVAL_TYPES = [one_rm, max_reps, custom]` (subset de EVAL_TYPES) + sus METHODS.
- Helper `isExerciseBasedEval(evalType)` → `['one_rm','max_reps','custom','mixed'].includes(evalType)`.
- Helper de cálculo 1RM por fórmula (ya debe existir para OneRMForm — reusar) para estimar por ejercicio.

### `src/features/plans/pages/CreatePlanPage.jsx` y `EditPlanPage.jsx`
- Cuando `isEval && isExerciseBasedEval(plan.eval_type)`: mostrar **tabs de días** (reusar `getDynamicSections(plan.sessions_per_week, false)`) + campo "Días" (input number 1–7) para evals.
- El estado de ejercicios de eval pasa de lista plana a **por sección** (como `planBlocks` pero sin bloques: `evalDays = { day_a: [rows], ... }`).
- Cada fila de ejercicio: select de ejercicio (catálogo, obligatorio, con "+ Nuevo"), selector de **tipo+método** (oculto si toggle="mismo"), instructions, expected value/unit, mandatory. Para `one_rm`/`max_reps` mostrar también los campos de sets/reps existentes.
- Toggle **"Mismo método para todos / Por ejercicio"** a nivel evaluación: si "mismo", el coach elige un `eval_type`+`eval_method` global y se propaga a todas las filas al guardar; si "por ejercicio", cada fila muestra su selector. Persistir el modo en… (no hace falta columna: se deriva — si todas las filas comparten type+method, es "mismo").
- `handleSave`: para evals exercise-based, persistir todas las filas (de todas las secciones) a `plan_exercises` con los campos nuevos. Eliminar el branch que escribía a `evaluation_tests`. Mantener el branch viejo solo para protocolos enteros (que no usan plan_exercises).
- `EditPlanPage` además: al cargar, leer `plan_exercises` (no `evaluation_tests`) y reconstruir `evalDays` agrupando por `section`.

### `src/features/evaluations/pages/EvalWorkoutPage.jsx`
- Para planes exercise-based: leer `plan_exercises` (join `exercises(name, video_url)`) **sin** hardcodear `day_a`; agrupar por `section`; render por día (tabs o secciones) y **por cada ejercicio** despachar el input según su `eval_type` (`one_rm`/`max_reps`/`custom`). Reusar la lógica de OneRM/MaxReps por-ejercicio y `PruebaInput` (de CustomForm) para custom.
- Guardado: upsert `evaluation_results` (contenedor) + una `evaluation_test_responses` por ejercicio keyed por `plan_exercise_id` con el jsonb correspondiente. Comentarios al panel como hoy.
- Para protocolos enteros: dejar el path actual intacto.

### `src/features/evaluations/pages/EvaluationDetailPage.jsx`
- Leer resultados por ejercicio desde `evaluation_test_responses` (join `plan_exercises`), agrupar por día/ejercicio, mostrar método por ejercicio. Mantener compat con resultados viejos (jsonb) de protocolos enteros.

### `src/features/evaluations/components/forms/CustomForm.jsx`
- Generalizar para recibir ejercicios con `eval_type` mixto y despachar el input correcto, o extraer `PruebaInput` para reuso desde el nuevo renderer de EvalWorkoutPage.

### Otros (verificar, blast radius)
- `DuplicatePlanModal.jsx`, `EvaluationsPage.jsx`, `StudentEvaluationsTab.jsx`, `UpcomingEvaluations.jsx`, clone RPC (`assign_template_to_student` / `clone_*`): confirmar que clonan `plan_exercises` con las columnas nuevas y que no asumen `evaluation_tests`. El RPC de clonado debe copiar las columnas nuevas.

---

## 5. Validación
- `npm run lint` 0 errores, `npm run build` OK, `npx vitest run` verde (actualizar/crear tests de helpers nuevos: `isExerciseBasedEval`, agrupación por día, mapeo de response jsonb).
- **No push, no migración de datos en prod** hasta que Franco haga smoke. La migración de cutover (§3) se aplica junto con el push.

---

## 6. Riesgos / notas
- Modelo template-clon: los resultados van al clon. El RPC de clonado debe copiar las filas de `plan_exercises` con las columnas nuevas (sino el clon pierde tipo/método por ejercicio). **Verificar el RPC.**
- Compat hacia atrás: resultados viejos de custom viven en `evaluation_test_responses` con `test_id` (no `plan_exercise_id`) hasta el reatado del cutover. El reader debe tolerar ambos durante la transición.
- `EvalWorkoutPage` hoy hardcodea `.eq('section','day_a')` — eliminar.
