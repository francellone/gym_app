# 41 — Plan de fixes: vista coach de evals nuevas + endurecer re-asignación

**Fecha:** 2026-05-31. **Contexto:** análisis post-doc 40. Franco pidió planificar cada hueco detectado y verificar qué toca cada arreglo (blast radius) antes de implementar. **Nada de esto está implementado todavía.**

Orden recomendado: **#1 (bloquea el smoke) → #3 → #2 → #4 (decisión) → #5–#7 (menores/futuro)**.

---

## #1 — Migrar `StudentEvaluationsTab` al modelo nuevo (ALTA)

**Problema:** la vista coach por-alumna (`StudentDetailPage?tab=evaluaciones`, a la que se llega desde la notificación "completó eval", `UpcomingEvaluations` y `NotificationBell`) solo entiende `custom` (lee `evaluation_tests`+responses por `test_id`) y `ResultadosCientificos` (lee `results.exercises` jsonb). El modelo nuevo guarda `results={}` y los datos en `evaluation_test_responses` por `plan_exercise_id` → la coach ve **vacío** para one_rm/max_reps/mixed nuevos.

**Referencia que ya resuelve esto:** `EvaluationDetailPage.jsx` (migrada). Tiene:
- carga: `evaluation_test_responses` con join `plan_exercise:plan_exercises!plan_exercise_id(*, exercises(name, video_url))`, adosada a cada result como `res._exResponses` (líneas ~625-639).
- render: `ExerciseBasedView` + `ExerciseResponseRow` (agrupa por `section`/día, despacha por `eval_type`, formatea valor por método). Es **read-only**.

**Qué cambia (`StudentEvaluationsTab.jsx`, archivo de 1298 líneas):**
- `fetchData`: para `isExerciseBasedEval(plan.eval_type)`, cargar responses con el join de plan_exercise (igual que EvaluationDetailPage) en vez de `evaluation_tests`+`test_id`.
- `UltimoRegistro`: hoy itera `pruebas` (evaluation_tests) y keyea responses por `test_id`. Pasar a iterar las filas de `plan_exercises` agrupadas por día y keyear por `plan_exercise_id`.
- `HistorialComparativo`: selector y evolución keyean por `test_id` → keyear por `plan_exercise_id` (funciona igual: las filas de plan_exercises del clon son únicas y cada result-por-fecha las referencia).
- `CoachCommentEditor`/`saveComments`: hoy, si no hay response, inserta una con `test_id` para tener context_id estable; cambiar a `plan_exercise_id`. El `postEvalCommentNote({responseId})` no cambia (usa el id de la response).
- dispatch: `isCustom` deja de ser el switch; usar `isExerciseBasedEval` (one_rm/max_reps/custom/mixed) → vista por ejercicio/día; protocolos enteros (power/cardio/body_comp/scored) siguen en `ResultadosCientificos`.

**Blast radius — qué toca y qué NO:**
- **Toca solo** `StudentEvaluationsTab.jsx`. Para no duplicar, **extraer a un módulo compartido** (`evaluations/components/ExerciseResultsView.jsx` + un helper `loadExerciseResponses` en `helpers.js`) lo que hoy vive privado en `EvaluationDetailPage` (`ExerciseBasedView`, `ExerciseResponseRow`, formateo de valor por método) y consumirlo desde ambas. EvaluationDetailPage pasaría a importar el shared (refactor sin cambio de comportamiento).
- **NO toca:** `EvalWorkoutPage` (alumno), la DB, el RPC, el modelo de datos. Es 100% lectura/UI del lado coach.
- **Compat:** ser defensivo igual que EvaluationDetailPage — responses legacy con `test_id` (sin `plan_exercise_id`) caen al render custom viejo. Tras el cutover (doc 38b) las 8 responses ya tienen `plan_exercise_id`, así que en prod no debería quedar ninguna, pero el fallback evita sorpresas.
- **Riesgo:** es el cambio más grande (la coach edita comentarios acá → no romper el guardado de notas ni el historial). Diferencia vs EvaluationDetailPage: esta vista es **editable** (comentarios coach por ejercicio) y tiene expected-vs-actual + ComparisonBadge + historial; el shared component necesita soportar modo read-only (Detail) y modo editable (StudentTab) por props, o dejamos ComparisonBadge/coach-comments en StudentTab y compartimos solo la fila base.

**Opciones:**
- **A (recomendada):** migración completa reusando un componente compartido extraído de EvaluationDetailPage, con prop `editable` para los comentarios coach. Mantiene paridad de features (comentarios + historial + comparativa) en el modelo nuevo.
- **B (mínima):** que StudentEvaluationsTab solo lea y muestre los valores nuevos read-only, sin comentarios por-ejercicio para el modelo nuevo (se agregan después). Menos trabajo, pero la coach pierde el comentario por ejercicio en evals nuevas.
- **C:** desde el detalle del alumno, linkear a `EvaluationDetailPage` (ya migrada) en vez de migrar. Descartada: distinta UX (Detail es por-eval/todos-los-alumnos, no por-alumno con sus comentarios).

**Validación:** vitest a los helpers extraídos (loadExerciseResponses, agrupación) + smoke: alumna completa eval mixta → coach la ve por día/ejercicio en el detalle del alumno + puede comentar.

---

## #3 — Robustez del `reassignTemplate` (archive-then-assign) (MEDIA)

**Problema:** si el `assignTemplateToStudent` falla después del archive, la alumna queda con la eval archivada y sin una nueva → peor que antes.

**Qué cambia:** en `reassignTemplate` (assignmentHelpers.js), capturar el `status` previo del assignment **antes** de archivar; envolver el assign en try/catch y, si falla, **revertir** el archive (UPDATE old → status previo, active según corresponda) antes de re-lanzar el error.

**Blast radius:** solo `reassignTemplate`. No toca el modal (ya reporta error por alumna), ni el RPC. Test nuevo: simular fallo del rpc → assert que se revirtió el archive y se relanzó. **Riesgo bajo.** Edge: si el revert también falla, loguear (la alumna queda archivada; el modal lo muestra).

---

## #2 — Preservar `paused` al re-asignar (MEDIA)

**Problema:** `fetchTemplateAssignees` incluye `paused`, pero el RPC siempre crea `active` → re-asignar reactiva sin querer a una alumna pausada.

**Hecho verificado:** pausar = `update({ status: 'paused' })` (el booleano `active` es legacy; `status` es la fuente de verdad — ver `StudentPlansTab.confirmReactivate`).

**Qué cambia:** en `reassignTemplate`, tras el assign exitoso, si `assignee.status === 'paused'`, `update plan_assignments set status='paused'` sobre el `assignment_id` nuevo. Copy del modal: aclarar "se mantiene en pausa".

**Blast radius:** solo `reassignTemplate` (+ 1 línea de copy opcional). Sin cambio de DB/RPC. **Riesgo bajo.** Alternativa más conservadora: excluir pausadas de la lista (no re-asignarlas). Recomiendo preservar el estado.

---

## #4 — Re-asignar TRAINING es más disruptivo que evals (MEDIA — decisión de Franco)

**Problema:** el aviso post-save dispara para cualquier template. Re-asignar un training a mitad de ciclo: los `workout_logs` quedan atados al `plan_exercise_id` del clon viejo; el clon nuevo tiene ids nuevos → la alumna "pierde" el plan en curso (queda en el archivado) y arranca vacío.

**Opciones:**
- **A (recomendada para ahora):** acotar el modal a `plan_type === 'evaluation'` (que es para lo que nació el feature). Training no dispara aviso de re-asignación por ahora. Cambio: 1 condición en `EditPlanPage.handleSave`.
- **B:** mostrar el modal para ambos, con copy/confirmación reforzada para training ("la alumna perderá el avance del plan en curso").
- **C:** para training, un flujo de "reemplazar plan" que preserve continuidad (fuera de alcance; es otro feature).

**Blast radius:** `EditPlanPage` (condición del trigger) + copy del modal. No toca el helper. **Decisión tuya** sobre A vs B.

---

## #5 — El aviso salta en CADA guardado del template (BAJA)

Aunque solo cambies el título. Detectar "cambio estructural" es caro. Opción barata: setear un flag `dirtyExercises` cuando se toca `evalDays`/`planBlocks`/secciones, y solo abrir el modal si hubo cambios estructurales. Blast radius: `EditPlanPage` (flag + condición). Prioridad baja; se puede vivir con el nag por ahora.

## #6 — Acumulación de clones archivados (BAJA / futuro)

Cada re-asignación deja un plan-clon + assignment archivados. Crece con el uso. No urgente. Cleanup futuro: job o vista que purgue clones archivados sin resultados. Sin acción ahora.

## #7 — Alumna con la eval abierta mientras se re-asigna (BAJA / edge)

Su `EvalWorkoutPage` sigue apuntando al clon archivado y guardaría ahí. Edge raro; aceptable. Mitigación futura: detectar assignment archivado al guardar y avisar "esta evaluación fue actualizada por tu coach".

---

## Resumen de archivos por punto

| # | Archivos | DB? | Tamaño |
|---|----------|-----|--------|
| 1 | StudentEvaluationsTab.jsx, EvaluationDetailPage.jsx (extraer shared), helpers.js, nuevo ExerciseResultsView.jsx | No | Grande |
| 2 | assignmentHelpers.js | No | XS |
| 3 | assignmentHelpers.js | No | S |
| 4 | EditPlanPage.jsx, ReassignTemplateModal.jsx (copy) | No | XS |
| 5 | EditPlanPage.jsx | No | S |
| 6 | — (futuro) | — | — |
| 7 | — (futuro) | — | — |

Ningún punto requiere migración de DB ni tocar el RPC. #2/#3/#4 son contenidos. El grande es #1 (vista coach), y la clave ahí es **extraer y compartir** la vista exercise-based que ya existe en EvaluationDetailPage en vez de duplicarla.

**Validación global:** lint 0, vitest verde (tests nuevos en helpers de #1/#2/#3), build OK. **No pushear sin OK de Franco** (main auto-deploya).

---

## Estado de implementación (31/05, mismo día)

**Implementado #1, #2, #3, #4 (opción B). lint 0 errores · vitest 295/295 · build OK. SIN pushear.**

- **#2 + #3** (`assignmentHelpers.reassignTemplate`): captura `prevStatus`; revierte el archive si el re-clonado falla (#3); preserva `paused` en la nueva asignación (#2). +2 tests.
- **#4 opción B** (`ReassignTemplateModal`): el modal se muestra también para training (ya lo hacía) con un **aviso rojo reforzado** cuando hay asignaciones de entrenamiento (reinicia el plan en curso; sugiere editar el plan de la alumna directamente).
- **#1** (`StudentEvaluationsTab` migrado): lee `plan_exercises` + responses por `plan_exercise_id`, render por día/ejercicio según `eval_type`, comentarios coach por ejercicio. Helpers compartidos nuevos en `evaluations/helpers.js`: `evalMethodLabel`, `formatExerciseResponseValue`, `exerciseResponseNumericValue`.
  - **Compat clave (verificado en DB):** las one_rm/max_reps **completadas antes del 30/05 guardaron en `results.exercises` jsonb (0 responses)**. Para no regresionar, `showExerciseView` usa la vista nueva solo para `custom`/`mixed` o cuando hay responses (modelo nuevo); las viejas siguen en `ResultadosCientificos`.

**Pendiente:** #5 (nag en cada save), #6 (limpieza de clones archivados), #7 (alumna con eval abierta) — no implementados. Push + smoke en prod pendientes de Franco.

**Pregunta resuelta (Franco):** SÍ existe vía para editar el plan de una persona directo — el clon ES su plan (`is_template=false`); desde el detalle del alumno → su plan → `PlanDetailPage` → "Editar" (`EditPlanPage` sobre el clon). El modal de re-asignación NO salta al editar un clon (solo con templates).
