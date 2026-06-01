# 43 — Guardado por día, Modelo B (una sola eval, fecha por día)

**Fecha:** 2026-05-31. **Decisión de Franco:** Modelo B. La evaluación es **una sola**, cada día se guarda con su propia fecha, y se considera **completada cuando todos los días tienen datos**. Reemplaza el plan del doc 42 (que era Modelo A, descartado).

**Disparador del descarte de A:** existe el trigger `trg_close_eval_on_result` (`fn_close_eval_on_result`) que, al INSERT de `evaluation_results`, marca la asignación `completed` + notifica al coach. Con Modelo A (un result por día) eso dispararía completación + notificación en el primer día. Modelo B + trigger basado en "todos los días" lo resuelve.

---

## Modelo de datos (sin columnas nuevas)

- **Una** `evaluation_results` por intento de eval (como hoy para los protocolos). `eval_date` = fecha del primer día guardado (representativa).
- **Fecha por día** guardada en `evaluation_results.results` jsonb (que para exercise-based hoy es `{}`): `results = { "day_dates": { "day_a": "2026-05-31", "day_b": "2026-06-03" } }`.
- Las responses siguen una por ejercicio keyada por `plan_exercise_id` bajo ese result.
- **Completada** = todas las secciones-día del plan (las que tienen ejercicios) tienen ≥1 response bajo el result.

---

## Trigger (DB) — reescribir el cierre

`fn_close_eval_on_result` (en `evaluation_results`) hoy cierra+notifica en cada INSERT. Cambio:
- **Sacar** el cierre+notificación de ese trigger (dejar `evaluation_results` solo con `updated_at`).
- **Nuevo** trigger en `evaluation_test_responses` (AFTER INSERT) → `fn_close_eval_when_complete()`:
  - resuelve `result` (student_id, plan_id) desde `NEW.evaluation_result_id`.
  - secciones-día del plan = `distinct section` de `plan_exercises` del plan; secciones cubiertas = `distinct pe.section` de las responses de ese result.
  - si cubre todas → `UPDATE plan_assignments SET status='completed' ... WHERE status='active'`; si afectó fila (transición real) → insertar notificación `evaluation_completed`. El `WHERE status='active'` + chequear ROW_COUNT **dedup** naturalmente (solo la transición notifica).
  - **Legacy:** si el plan no tiene `plan_exercises` (custom viejo) → cerrar en la primera response (comportamiento anterior).
- SECURITY DEFINER (como el original).
- **Compat hacia atrás:** el front viejo (prod actual) guarda todos los días en un result; las responses van entrando y al cubrir todas las secciones cierra una vez. Sirve igual. Por eso el trigger se puede aplicar antes del push del front sin romper.

Probar con `DO $$ ... RAISE EXCEPTION` (rollback) antes de aplicar.

---

## Front — `EvalWorkoutPage.jsx` (exercise-based)

- Estado por día: `dayDates = { day_a, day_b }` (default hoy). `exResponses` global por `plan_exercise_id`. `notes` global (una sola observación para toda la eval — decisión Franco). `resultId` único.
- Carga: tomar el result más reciente de (student, plan); leer `results.day_dates` (default hoy por día), responses → exResponses, nota del panel.
- Por día: date picker + botón **Guardar día** + indicador "guardado". Guardar día:
  1. crear el result si no existe (`eval_date` = hoy, `results.day_dates` con la fecha de ese día) o actualizar `results.day_dates[section]`.
  2. upsert responses de los `plan_exercises` de ese `section`.
  3. guardar la nota global + comentarios por ejercicio (como hoy).
- Eval de **1 día** → se comporta como antes (un date + un guardar).

## Coach — mostrar fecha por día

`StudentEvaluationsTab` + `EvaluationDetailPage`: en el header de cada día, mostrar `result.results.day_dates[section]` si existe. La eval se ve **una sola** (un result) con la fecha de cada día.

---

## Estado de implementación (31/05)

**Front + coach implementados. lint 0 · vitest 295/295 · build OK. SIN pushear. Trigger 43b SIN aplicar (va en el cutover, con el push).**

- `EvalByDayForm.jsx`: modo `perDaySave` (fecha + botón Guardar + indicador "guardado" por día).
- `EvalWorkoutPage.jsx`: para evals **multi-día** exercise-based → guardado por día; carga el "intento en curso" (result más reciente no completo; si el último está completo, arranca intento nuevo vacío); `results.day_dates` por día; una nota global. Eval de 1 día → flujo clásico intacto. Protocolos enteros intactos.
- `StudentEvaluationsTab.jsx` + `EvaluationDetailPage.jsx`: muestran la fecha de cada día desde `results.day_dates`.
- `43b_trigger_cutover_modelo_b.sql`: cierre+notif de exercise-based pasa a dispararse por responses (todos los días); protocolos enteros siguen cerrando en el insert del result. **Aplicar junto al push** (el front viejo guarda one_rm sin responses → si se aplica antes, esas no auto-cerrarían).

**Pendiente:** push del front + aplicar 43b + smoke real (guardar Día A → no cierra; Día B → cierra + 1 notif). Edge documentado: reabrir una eval ya completa arranca un intento nuevo (no edita la completa desde esta pantalla).

## Validación
- lint 0, vitest verde, build OK.
- Smoke SQL del trigger (rollback): guardar día A (no cierra) → guardar día B (cierra + 1 notif).
- Dejar el estado de prueba como estaba (sin results de más).
- **Trigger se aplica a prod** (compatible con front viejo); **front NO se pushea sin OK de Franco**.
