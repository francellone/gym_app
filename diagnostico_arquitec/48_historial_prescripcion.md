# 48 — Historial de prescripción (ajuste de plan a mitad de mes)

**Sesión:** Cowork, browser francellone, Supabase MCP `bvexjanqmfypmtgoapbt`, prod `gym-appv2.vercel.app`.
**Pedido (Franco / coach Anto):** A mitad de mes la coach evalúa el avance y **sube pesos o cambia reps** de algunos ejercicios del plan de la alumna. No rehace el plan: lo **adapta** sobre la marcha. Queremos registrar cada ajuste (fecha, antes/después, motivo) y poder verlo.
**Decisión:** Implementar **Opción B** (de la conversación previa): edición in-place del clon **+ historial de prescripción**. Esto NO usa el circuito de re-asignación (ese archiva el clon y reinicia el plan + crea `plan_exercise_id` nuevos, lo que fragmentaría el histórico por ejercicio).

---

## Por qué edición in-place y no re-asignación

- La prescripción de cada ejercicio vive en `plan_exercises` del **clon** de cada alumna (`suggested_sets`, `suggested_reps`, `suggested_weight`, `suggested_weights`, `rest_time`, `suggested_pse`).
- Los `workout_logs` cuelgan de `plan_exercise_id`. Editar el row in-place **mantiene el mismo `plan_exercise_id`** → todo el histórico de logs y el gráfico "evolución de peso por ejercicio" siguen intactos.
- Re-clonar (re-asignación, docs 40/41) crearía rows nuevos → cortaría ese histórico. Por eso el ajuste mensual va por edición directa del clon.
- Memorias relacionadas: `feedback_editar_clon_es_editar_plan_alumno`, `feedback_template_edit_no_propaga`.

---

## Punto único de escritura (confirmado en código)

`src/features/plans/pages/EditPlanPage.jsx` es el **único** lugar donde el coach edita `plan_exercises` in-place (líneas ~506-519: loop que hace `supabase.from('plan_exercises').update(dbData).eq('id', ex.id)` por cada ejercicio). El mismo componente edita templates y clones; sólo dispara el modal de re-asignación cuando `plan.is_template === true` (línea ~530).

Esto es clave: como hay **un solo camino de escritura**, capturar el historial desde el front-end es completo, sin necesidad de trigger.

---

## Sub-opciones del mecanismo de captura (dentro de B)

- **B1 — Front-end inserta el historial (ELEGIDA).** En EditPlanPage, al guardar un **clon** (`is_template=false`), comparar los `suggested_*` nuevos contra un snapshot de los valores cargados; por cada ejercicio con cambio real, juntar el diff y, tras un modal de "motivo", insertar rows en la tabla de historial.
  - ✅ Captura el **motivo** de forma natural. ✅ Completo (camino único). ✅ Bajo riesgo (no toca el RPC de guardado, que es complejo: bloques + ejercicios). ✅ Sólo registra cambios reales (no el "guardo todos los rows" del save).
  - ⚠️ Si en el futuro aparece otro camino de escritura, no quedaría registrado → mitigable con B2 más adelante.
- **B2 — Trigger en `plan_exercises` (futuro/hardening).** `AFTER UPDATE` que, si cambió algún `suggested_*` y el plan padre `is_template=false`, inserta el diff. Robusto y path-agnostic, pero el **motivo** no se puede pasar limpio (supabase-js no garantiza misma transacción → GUC transaction-local no aplica). Queda como red de seguridad futura, con `note` nullable.
- **B3 — RPC transaccional.** Mover el guardado de ejercicios a un RPC que setee `set_config('app.note', ...)` y deje al trigger leerlo. Correcto pero implica reescribir el save complejo de EditPlanPage → demasiado riesgo ahora.

**Recomendación:** B1 ahora; dejar B2 documentado como hardening si algún día hay otro camino de escritura.

---

## Esquema de datos

Tabla nueva `plan_exercise_prescription_history`:

| col | tipo | nota |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| plan_exercise_id | uuid FK → plan_exercises(id) ON DELETE CASCADE | |
| plan_id | uuid FK → plans(id) | denormalizado para RLS/queries |
| changed_by | uuid → auth.users | default auth.uid() |
| changed_at | timestamptz default now() | |
| changes | jsonb NOT NULL | `{ campo: { old, new } }` sólo de campos que cambiaron |
| note | text NULL | "motivo del ajuste" (opcional) |

Índice: `(plan_exercise_id, changed_at desc)`.

**RLS** (espeja `plan_exercises`):
- Coach (ALL): `is_coach() AND EXISTS(plans where id=plan_id and created_by=auth.uid())`.
- Alumna (SELECT): `plan_id IN (select get_my_active_plan_ids())`.

---

## Impacto en cada funcionalidad (revisión "todas las funcionalidades")

- **Re-asignación (docs 40/41):** no se toca. La re-asignación crea rows nuevos (sin historial); el ajuste in-place es el flujo del historial. Coexisten.
- **Templates:** el historial **solo** se registra para clones (`is_template=false`). Editar un template no genera historial (no es el plan de nadie).
- **Supersets (block_label, doc 45):** el descanso del grupo se hereda del nº1. Si la coach cambia `rest_time` del A1, eso es un cambio de prescripción válido y se registra como cualquier otro campo. No cambia la lógica de agrupación.
- **Autosave F4 (localStorage):** sin impacto. El draft es del lado alumna sobre `workout_logs`; el historial es del lado coach sobre `plan_exercises`.
- **Evaluaciones:** sin impacto. EditPlanPage tiene rama separada para `plan_type='evaluation'` (usa `uiEvalExerciseToDB`); el historial sólo aplica a la rama de **entrenamiento** y a clones.
- **Charts / progreso (ProgressPage):** oportunidad — marcar en el gráfico de peso por ejercicio cuándo subió el objetivo.
- **i18n (vista alumna en inglés, doc 46):** cualquier texto del lado alumna usa `t(...)` con claves nuevas en `es.json` + `en.json`.

---

## Superficies de visualización

1. **Coach — historial por ejercicio** en `PlanDetailPage` (detalle del clon de la alumna): timeline "Ajustes: DD/MM peso 40→45, reps 8→6 · motivo". Superficie primaria.
2. **Coach — captura del motivo:** al guardar un clon con cambios de prescripción, modal "Ajuste de plan" con un campo opcional de motivo (patrón análogo a `ReassignTemplateModal`).
3. **Alumna — indicador:** badge/nota sutil en `ExerciseCard` ("Tu coach ajustó el objetivo el DD/MM") + (si rinde) marcador en el gráfico de peso. Con i18n.

### Decisiones de producto a confirmar con Franco
- ¿El **motivo** es obligatorio u opcional? (default propuesto: opcional)
- ¿La alumna **ve** el ajuste y el motivo, o es contexto sólo del coach? (default propuesto: ve el ajuste + motivo, es motivante)

---

## Checklist de implementación

- [ ] Migración: tabla + índice + RLS.
- [ ] EditPlanPage: snapshot de `suggested_*` al cargar; diff al guardar (solo clon); modal de motivo; insert de historial.
- [ ] Helper `prescriptionHistory.js`: diffPrescription(orig, nuevo) + insertHistory(supabase, rows, note).
- [ ] Coach: timeline en PlanDetailPage.
- [ ] Alumna: indicador en ExerciseCard (+ chart si rinde), i18n es/en.
- [ ] Lint + tests; commit conventional (es); `git push` (Vercel no deploya sin push); smoke prod browser francellone.
- [ ] Actualizar handoff + memorias.

**Abierto por:** agente Cowork 2026-06-13.
