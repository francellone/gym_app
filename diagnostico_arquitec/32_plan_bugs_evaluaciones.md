# 32 — Plan de fix: 4 bugs de evaluaciones (Franco 2026-05-26)

**Fecha:** 2026-05-26
**Reporte:** Franco (chat sesión 26/05)
**Estado:** PLAN, sin tocar código. Esperando OK explícito por opción (A/B/C) para arrancar.

---

## Reporte original (textual)

> 1. Cuando quiero asignar una evaluación desde la pestaña Evaluaciones si o sí me hace ir a alumnos. Debería poder asignar desde alumnos, pero también desde ahí.
> 2. Si un alumno tiene una evaluación asignada, debería poder desasignársela. Por ejemplo, se la asigné sin querer.
> 3. Cuando asigno una evaluación a un alumno desde el perfil del alumno hoy día esa evaluación me aparece vacía desde el lado del coach y del lado del alumno.
> 4. No sé por qué hoy día la única evaluación que me figura que puedo asignar desde alumno → evaluaciones es la Evaluación inicial desde Anto coach. Esto lo probamos con dos alumnos: Franco Cellone y Anto.

---

## TL;DR — Diagnóstico

Los 4 bugs comparten una misma raíz histórica: el modelo template/clon de evaluaciones está implementado a medias. B3+B4+Q10 del 24/05 cerró el lado de planes de training y la creación de evals nuevas (forzando `is_template=true` en `CreatePlanPage`), pero quedaron tres flecos:

1. **La RPC `assign_template_to_student` no clona `evaluation_tests`** → bugs 3.
2. **Los evals legacy (anteriores a B3+B4+Q10) quedaron con `is_template=false`** → bug 4.
3. **`DuplicatePlanModal.jsx:38` sigue hardcodeando `is_template: false`** → entrada nueva al bug 4 cada vez que el coach duplica.
4. **La pestaña Evaluaciones (`EvaluationsPage.jsx`) nunca tuvo flow de asignación**, y **`EvaluationCard` nunca tuvo botón de desasignar** → bugs 1 y 2.

Los 4 son bugs reales con evidencia SQL + RPC + código, no malentendidos del usuario.

---

## Evidencia recogida (resumen)

### SQL sobre `plans` filtrado por `plan_type='evaluation'`

| Title | `is_template` | `eval_type` | num_tests | num_plan_exercises | active_assign | created_at |
|---|---|---|---|---|---|---|
| EVALUACION INICIAL | **true** | custom | **8** | 0 | 0 | 2026-05-12 |
| EVALUACION INICIAL — anto almanza | false | custom | **0** | 0 | **1 (Anto)** | 2026-05-24 |
| plan 1 anto DIA A | false | one_rm | 0 | 2 | 0 | 2026-05-24 |
| TEST PLAN 1 ANTO DIA B | false | one_rm | 0 | 2 | 0 | 2026-05-24 |
| EVALUACION HIP THRUST | false | one_rm | 0 | 1 | 0 | 2026-04-24 |
| EVALUACION CHIN UPS Y SENTADILLA | false | one_rm | 0 | 2 | 0 | 2026-04-24 |

Observaciones:

- Solo **1 de 6** evals es `is_template=true`. El filtro UI `is_template !== false` (en `AssignEvaluationForm`) deja pasar únicamente esa.
- El clon vivo de Anto (`EVALUACION INICIAL — anto almanza`) tiene **0 tests** contra los **8** del padre → eval vacía confirmada.
- Las 2 evals del 24/04 (HIP THRUST, CHIN UPS) son legacy puras: nunca pasaron por la nueva convención.
- Las 2 evals del 24/05 (`plan 1 anto DIA A`, `TEST PLAN 1 ANTO DIA B`) son **del día que cerró B4+Q10** pero quedaron `is_template=false`. La hipótesis fuerte es que se crearon vía `DuplicatePlanModal`, que sigue forzando `false` (línea 38).

### Definición de `assign_template_to_student` (`pg_get_functiondef`)

La RPC clona en orden:

```
INSERT INTO public.plans (..., is_template=false, ...)
INSERT INTO public.plan_blocks (...)
INSERT INTO public.plan_exercises (...)
INSERT INTO public.plan_assignments (...)
```

No incluye `INSERT INTO public.evaluation_tests SELECT ... WHERE plan_id = p_template_id`. Por eso un eval `custom` (que vive en `evaluation_tests`) sale vacío del clonado. Un eval `one_rm`/etc (que usa `plan_exercises`) sí se clona OK.

### Código

- `src/features/evaluations/pages/EvaluationsPage.jsx` — list cards con icon + link al detalle + delete. No tiene action "Asignar".
- `src/features/evaluations/pages/StudentEvaluationsTab.jsx`
  - `AssignEvaluationForm` (~línea 234): `const evalPlanOptions = (allPlans || []).filter((p) => p.plan_type === 'evaluation' && p.is_template !== false)` — la causa visible del bug 4.
  - `EvaluationCard` (~línea 290) — no expone action de desasignar.
- `src/features/plans/pages/CreatePlanPage.jsx:440` — `is_template: true` forzado en el create nuevo (B4+Q10).
- `src/features/plans/components/DuplicatePlanModal.jsx:38` — `is_template: false` hardcodeado → contradice B4+Q10.
- `src/features/plans/assignmentHelpers.js` — `assignTemplateToStudent()` envuelve a la RPC, no clona tests por su cuenta.

---

## Bug por bug — diagnóstico técnico + qué requiere el fix

### Bug 1 — Asignar evaluación desde la pestaña Evaluaciones

**Causa:** la card en `EvaluationsPage.jsx` solo tiene 2 acciones (delete + chevron al detalle). El flow de asignación existe únicamente embebido en `StudentEvaluationsTab` (perfil del alumno → tab Evaluaciones).

**Fix mínimo:**

- Agregar action en la card de cada template (icono `UserPlus`, junto al de Delete) que abre un modal `<AssignEvalToStudentModal />`.
- El modal carga la lista de alumnos del coach (`profiles where role='student' and coach_id=<me>`) y reutiliza el helper `assignTemplateToStudent()` ya existente.
- Como bonus de coherencia: agregar el mismo botón también desde el detalle (`EvaluationDetailPage`). El doc 13 lo mencionaba como Q9 ("asignar alumno desde la pantalla de eval recién creada").

**Tamaño:** ~120-180 LOC entre el modal nuevo + 1 botón en cada lugar.

### Bug 2 — Desasignar evaluación

**Causa:** `EvaluationCard` muestra estado pero no expone botones de transición. Q4 del backlog ya tenía la decisión de Anto: `active=false` + mantener `evaluation_results` parciales (no borrar).

**Fix mínimo:**

- En `EvaluationCard`, sumar kebab con action "Desasignar" cuando `status === 'active'` o `paused`.
- Click → confirm modal ("La evaluación quedará archivada para el alumno. Los resultados parciales se conservan.") → `UPDATE plan_assignments SET active=false, status='archived' WHERE id=...`.
- Refrescar lista (callback `onRefresh` ya existe).
- Considerar también agregar "Reactivar" cuando `status='archived'` (consistencia con `actionsForStatus` que ya define la máquina de estados).

**Tamaño:** ~80-120 LOC entre kebab + modal + handler.

### Bug 3 — Eval asignada aparece vacía (CRÍTICO, hay clon vivo roto en prod)

**Causa raíz:** la RPC `assign_template_to_student` clona `plans + plan_blocks + plan_exercises + plan_assignments` pero **no clona `evaluation_tests`**. Cualquier eval `custom` queda vacía del lado de coach y alumno tras la asignación.

**Caso concreto en prod:** la asignación `ae5ce24f-10b4-45fd-bf75-456118d9567f` (Anto + `EVALUACION INICIAL — anto almanza`, 24/05) está rota: `tests_in_clone=0`, esperado 8. Hay que repararla además del fix forward-looking.

**Fix back:**

1. **Migración 1** — recrear la RPC `assign_template_to_student` agregando, después del clonado de `plan_exercises`:

   ```sql
   INSERT INTO public.evaluation_tests (
     plan_id, exercise_id, exercise_name, test_type, instructions,
     expected_value, expected_unit, mandatory, order_index
   )
   SELECT
     v_new_plan_id,
     et.exercise_id, et.exercise_name, et.test_type, et.instructions,
     et.expected_value, et.expected_unit, et.mandatory, et.order_index
   FROM public.evaluation_tests et
   WHERE et.plan_id = p_template_id;
   ```

2. **Backfill 1** — script SQL one-shot que copie los tests del padre al clon vacío de Anto. Hay que decidir cómo encontrar el padre: el clon NO guarda `parent_plan_id` en la RPC actual (otra deuda — discutida más abajo). Para este caso puntual el matching es por título (`EVALUACION INICIAL — anto almanza` → buscar template `EVALUACION INICIAL`), pero conviene usar `legacy_notes_shim_log`-style auditoría: parsear el sufijo `[Clonado de "<X>" (template_id=<UUID>) ...]` del campo `description` del clon — la RPC ya lo guarda.

3. **(Opcional, propio del orden)** — incluir en la RPC `parent_plan_id := p_template_id` al INSERT del clon. Hoy queda `null` (la columna sólo se usa para vincular eval-template a plan-training-template). Esto ayuda a auditar el linaje sin parsear strings, y a soportar futuras features tipo "evolución del alumno en una eval".

**Tamaño:** ~40 LOC SQL (migración) + ~15 LOC SQL (backfill) + 0 LOC front.

### Bug 4 — Solo aparece "Evaluación inicial" como asignable

**Causa:** 5 de 6 evals tienen `is_template=false`. El filtro UI deja solo la 1 que tiene `true`.

**Sub-causa A (legacy):** las del 24/04 (`HIP THRUST`, `CHIN UPS`) son de antes de B4+Q10. Nunca migradas.

**Sub-causa B (inconsistencia activa):** `DuplicatePlanModal.jsx:38` setea `is_template: false`. Cada vez que Anto duplica un plan/eval, el duplicado entra con la deuda. Esto contradice la decisión de B4+Q10 del 24/05 (todo plan debería arrancar como template).

**Fix:**

1. **Front** — `DuplicatePlanModal.jsx:38`: cambiar `is_template: false` → `is_template: true`. Que el flujo de duplicar quede consistente con `CreatePlanPage`.
2. **Data** — backfill SQL: marcar `is_template = true` para las 5 evals legacy actuales con `is_template = false AND active_assignments = 0` (las que NO son clones de alguna otra). La del 24/05 que SÍ es un clon (`EVALUACION INICIAL — anto almanza`) se queda como `false` correctamente.
3. **(Opcional, propio del orden)** — agregar CHECK constraint o trigger BEFORE INSERT en `plans` que valide: si `plan_type='evaluation' AND is_template IS NULL`, default a `true`. Cerrar el patrón del lado del back.

**Tamaño:** 1 LOC front + ~10 LOC SQL backfill + (opcional) ~20 LOC SQL trigger.

---

## Inconsistencias colaterales detectadas durante el diagnóstico

Estas no son los bugs reportados, pero las marca el mismo análisis. Conviene decidir si entran al mismo PR o quedan listadas como follow-up:

| # | Tema | Severidad |
|---|---|---|
| C1 | RPC no guarda `parent_plan_id` en el clon — pierde linaje formal del template → clon. | Media (auditoría) |
| C2 | El filtro `is_template !== false` también dejaría pasar `null`. Si en algún futuro queda data con `is_template IS NULL`, el front la trataría como template. Conviene normalizar. | Baja |
| C3 | `EvaluationsPage.jsx` (lista global) no distingue templates de clones — muestra todo mezclado. Si solo Anto los manejaba, no se notaba. Cuando Bug 4 quede fixed habrá más templates en la lista; tal vez convenga tabs "Plantillas" / "Asignadas" como hizo `PlansPage`. | Media (UX) |
| C4 | Los clones de Anto (`EVALUACION INICIAL — anto almanza`) aparecen en `EvaluationsPage` para todo el mundo. Idealmente RLS o filtro front oculta clones a coaches que no sean su creator. | Media |

---

## Opciones de implementación

### Opción A — "Fix quirúrgico" (recomendada para esta sesión)

Atacar SOLO los 4 bugs reportados, sin tocar inconsistencias colaterales. Orden sugerido:

1. **Bug 3** primero (es el más visible para los usuarios — el clon vivo de Anto queda roto hasta que se arregle). Migración RPC + backfill del clon de Anto.
2. **Bug 4**: 1 LOC en `DuplicatePlanModal` + backfill SQL para las 5 evals legacy.
3. **Bug 2**: action "Desasignar" en `EvaluationCard` + confirm modal.
4. **Bug 1**: modal "Asignar a alumno" desde `EvaluationsPage`.

**Tests nuevos sugeridos:**

- `assignmentHelpers.test.js`: agregar fixture de eval `custom` y verificar que la RPC clona `evaluation_tests` (en formato de test de integración, ya que la lógica está en SQL — si Vitest no llega a Postgres, dejarlo en `supabase/tests/rls_smoke_tests.sql` o un nuevo `eval_clone_tests.sql`).
- Tests UI mínimos: render de `EvaluationCard` con `status='active'` muestra "Desasignar"; render de `EvaluationsPage` muestra botón "Asignar" en cada card.

**Estimación:** 1-1.5 sesiones (~300-450 LOC entre front + SQL + tests).

**Pros:** scope acotado, retorno visible inmediato para Anto, riesgo bajo.
**Contras:** no resuelve las inconsistencias colaterales — algunas (C1, C3, C4) van a doler en cuanto haya 2 o más coaches.

### Opción B — "Fix + cierre del modelo template-clon" (más profundo)

Todo lo de Opción A + cerrar las inconsistencias C1, C2, C3:

- C1: agregar `parent_plan_id` al INSERT del clon en la RPC + backfill via parsing del `description` del clon (matchea solo "EVALUACION INICIAL — anto almanza" hoy).
- C2: normalizar columnas `is_template IS NULL` a `is_template = true` en backfill (todas las viejas que no tienen el campo seteado).
- C3: en `EvaluationsPage`, dividir lista en sección "Plantillas" + sección "Asignadas a alumnos" (consistente con cómo `PlansPage` separa el tab "Todos").

**Estimación:** 1.5-2 sesiones (~500-700 LOC).

**Pros:** cierra de una el modelo template-clon de evaluaciones. Deja el back coherente con planes de training.
**Contras:** mayor superficie de cambio en una sola tanda. Aumenta el riesgo de regresión.

### Opción C — "Hotfix mínimo, todo lo demás al backlog"

Solo Bug 3 (el clon vacío) + Bug 4 (filtro). Bug 1 y Bug 2 quedan registrados pero diferidos a la siguiente sesión.

- Bug 3 = migración RPC + backfill.
- Bug 4 = 1 LOC en `DuplicatePlanModal` + backfill SQL.

**Estimación:** 0.5 sesión (~80-120 LOC SQL + 1 LOC front).

**Pros:** corte mínimo, "destranca" lo que está roto en prod (el clon vivo de Anto). Devuelve la app a estado usable. Bug 1 y Bug 2 son UX missing, no rupturas.
**Contras:** Bug 1 y Bug 2 siguen abiertos. Hay que volver a abrir el tema pronto.

---

## Recomendación

**Opción A.**

Razones:

1. Bug 3 es ruptura real de prod hoy (los datos del alumno se ven vacíos) → urgente. No se puede diferir.
2. Bug 4 es 1 LOC + backfill SQL: incluirlo cuesta nada.
3. Bug 2 (desasignar) tiene la decisión de Anto ya tomada (Q4 13.7). Está listo para implementarse — bloquearlo no ahorra tiempo.
4. Bug 1 (asignar desde Evaluaciones) es UX limpia y reutiliza el helper `assignTemplateToStudent` ya existente. Es la coronación natural del cierre de evaluaciones.
5. Las colaterales C1, C3, C4 no son urgentes y mejor van solas con su propio plan (cuando llegue el 2do coach o la feature de auditoría de linaje).

Opción C dejaría a Franco respondiendo "¿y cómo desasigno?" en 2 días.
Opción B agrega complejidad sin retorno claro hoy.

---

## Preguntas abiertas que requieren input de Franco

1. **Las 5 evals legacy con `is_template=false`**:
   - `EVALUACION HIP THRUST` (24/04, 1 plan_exercise, 0 assignments)
   - `EVALUACION CHIN UPS Y SENTADILLA` (24/04, 2 plan_exercises, 0 assignments)
   - `plan 1 anto DIA A` (24/05, 2 plan_exercises, 0 assignments)
   - `TEST PLAN 1 ANTO DIA B` (24/05, 2 plan_exercises, 0 assignments)

   Todas tienen 0 assignments → técnicamente seguras de marcar `is_template=true`. ¿OK con backfilear o preferís que primero le preguntes a Anto si esas evals todavía las quiere usar? Si dice "ya no", se borran en vez de marcarse template.

2. **El clon vacío de Anto** (`EVALUACION INICIAL — anto almanza`, assignment `ae5ce24f-...`):

   Hay 2 caminos: (a) backfilear los `evaluation_tests` desde el template, manteniendo la asignación viva; o (b) desasignar el clon vacío y que Anto vuelva a asignar la eval ya con la RPC arreglada (con el bug 2 cerrado eso es 1 click). Mi voto: (a) — más limpio, no exige que Anto vuelva a hacer la acción. Pero queda a tu criterio.

3. **C1 (`parent_plan_id` en el clon)** — incluirlo en el fix del Bug 3 cuesta 3 líneas más en la RPC. ¿Lo metemos ahora o lo dejamos como follow-up?

4. **Tests automatizados** — la RPC vive en SQL. ¿Sumamos un `supabase/tests/eval_clone_tests.sql` para esto, o nos conformamos con smoke manual en prod después del deploy?

---

## Si Franco aprueba la Opción A, próximos pasos concretos

1. Crear migración `supabase/migrations/2026052<XX>_assign_template_clones_evaluation_tests.sql` con la RPC nueva.
2. Aplicar la migración vía MCP de Supabase a prod (proyecto `bvexjanqmfypmtgoapbt`).
3. Backfill SQL one-shot: copiar tests del padre `EVALUACION INICIAL` al clon `EVALUACION INICIAL — anto almanza`.
4. Smoke browser: abrir el perfil de Anto en `/coach/students/<antoId>/evaluations` con francellone, verificar que la eval ya no aparece vacía.
5. Fix `DuplicatePlanModal.jsx:38` + backfill `UPDATE plans SET is_template=true WHERE plan_type='evaluation' AND is_template=false AND id IN (...)`.
6. Implementar action "Desasignar" en `EvaluationCard` (Bug 2).
7. Implementar modal "Asignar a alumno" desde `EvaluationsPage` (Bug 1).
8. Tests + smoke browser + handoff doc 33.

---

**Próximo paso:** esperando OK explícito de Franco con `opción A/B/C` (o pedido de ajuste). Sin tocar código hasta entonces, por convención del repo (refactor protocol, `feedback_refactor_plan_protocol.md`).
