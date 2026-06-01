# 42 — Guardado por día (fecha propia) en evals de varios días

**Fecha:** 2026-05-31. **Pedido de Franco** (durante smoke de la eval mixta): los días A/B aparecen en un mismo bloque con un solo guardado/fecha. Decisión de Franco: **cada día con su propio botón de guardar y su propia fecha**.

---

## Modelo de datos (sin cambio de schema)

`evaluation_results` ya es único por `(student_id, plan_id, eval_date)`. Aprovechamos eso:
- Guardar el **Día A** con fecha X → upsert del result de la fecha X, se guardan SOLO las responses de los `plan_exercises` de `section='day_a'`.
- Guardar el **Día B** con fecha Y → result de la fecha Y con las responses de `day_b`.
- Si X == Y (ambos días el mismo día) → un solo result con las responses de los dos días (upsert por `plan_exercise_id`, no se pisan).
- Si X != Y → dos results (uno por fecha), cada uno con su día.

No hace falta tocar la DB ni el RPC. Las responses ya se keyan por `plan_exercise_id`.

---

## Cambios de código

### `EvalWorkoutPage.jsx` (reescritura del flujo exercise-based)
- Estado **por día** en vez de global: `dayMeta = { day_a: { date, resultId, note, editing, saved }, day_b: {...} }`. `exResponses` sigue siendo un map global keyado por `plan_exercise_id` (los ids son únicos entre días).
- Al cargar: por cada día, fecha default = hoy; buscar si existe result para esa fecha y cargar las responses + nota de ese día.
- `handleSaveDay(section)`: upsert `evaluation_results` para la fecha de ese día + guardar las responses de los `plan_exercises` de ese `section` + guardar la nota de ese día en el panel. (Reusa la lógica actual de `handleSave`, acotada a un día.)
- Cambiar la fecha de un día → recargar las responses existentes de ese día para la nueva fecha.
- Por día: date picker + botón "Guardar" + estado (registrado / editar / desmarcar), igual que hoy pero por día.

### `EvalByDayForm.jsx`
- Hoy renderiza todos los días con inputs por ejercicio (sin fecha ni guardado). Pasa a recibir, por día: la fecha, la nota, el estado y los handlers de guardar/editar/desmarcar — o se mueve el "chrome" por día a EvalWorkoutPage y EvalByDayForm queda solo con los inputs por ejercicio de un día. (Implementación: un `<DayPanel>` por día.)
- Si hay un solo día (eval de 1 día) → se comporta igual que hoy (un date + un guardar), sin headers de día.

### Nota general
- Hoy hay una sola "Observaciones del alumno". Pasa a ser **por día** (default propuesto), atada al result de ese día.

---

## Implicancia en la vista del coach (a tener en cuenta)

Con días en fechas distintas, una "evaluación" deja de ser 1 result y pasa a ser 1 result por día-fecha. Entonces, en `StudentEvaluationsTab` / `EvaluationDetailPage`:
- "Último registro" muestra el result más reciente = el último **día** cargado (p.ej. solo Día B). El Día A (otra fecha) aparece como otro registro en "Historial".
- No se rompe nada (cada result se muestra agrupado por su día), pero el coach ya no ve "Día A + Día B" juntos en una sola tarjeta salvo que se hayan hecho el mismo día.
- **Decisión futura (no en este alcance):** si se quiere que el coach vea el "último de cada día" unificado, hay que mergear el último response por ejercicio entre results. Lo dejamos anotado.

---

## Validación
- lint 0, vitest verde (tests de helpers si se extrae lógica de armado por día), build OK.
- Smoke: eval mixta → guardar Día A con fecha X, Día B con fecha Y → 2 results; volver a abrir y ver cada día con su fecha/valores; coach los ve como dos registros dados.
- **No pushear sin OK de Franco.**

## Sub-decisiones a confirmar con Franco
1. **Nota general por día** (default) vs una sola nota para toda la eval. (Con guardado por día, lo natural es por día.)
2. Aceptar que, en el coach, días en fechas distintas se vean como registros separados (no unificados) — por ahora.
