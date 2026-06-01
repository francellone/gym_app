# 40 — Aviso + circuito de re-asignación de templates editados

**Fecha:** 2026-05-31. **Pedido de Franco** (raíz del confusion de Ronda 5: la coach editó el template "PLAN 11 TEST" agregándole Día B + métodos mixtos, pero el alumno seguía viendo 1 día).

---

## Problema (diagnóstico 31/05)

Modelo **template-clon** (ver `project_evaluaciones_estructura`): asignar un template clona sus filas a una instancia personal (`plans.cloned_from_plan_id = template`, `is_template=false`) + crea el `plan_assignment` sobre el clon. **El clon es una foto congelada.** Editar el template **NO** propaga a las copias ya asignadas → la coach edita el molde, la alumna sigue con la copia vieja, y no hay ninguna señal de esto en la UI.

Caso real: clon de Franco sacado el 30/05 06:56 (template tenía 1 día) → editado el template 31/05 00:31 (2 días + mixto) → Franco seguía en 1 día. Resuelto a mano por SQL (archivar clon viejo + re-clonar). Esto debe ser un circuito de producto, no SQL manual.

---

## Solución (2 piezas)

### Pieza 1 — Aviso post-edición
Al guardar un **template** (`is_template=true`) que tiene asignaciones **vivas** (status `active`/`paused`) en clones suyos, en vez de navegar directo se abre un modal:

> "Este template tiene N asignaciones activas. Los cambios que guardaste **no** se aplican a las copias que ya tienen tus alumnas. Si querés que reciban la versión nueva, re-asignalo."

Con lista de alumnas + acción de re-asignar (bulk o por alumna) y un "Ahora no" que navega sin tocar nada.

### Pieza 2 — Circuito de re-asignación (reusable)
Por cada alumna seleccionada: **archivar** el clon viejo (`active=false`, `status='archived'` — mismo patrón que desasignar, Q4 13.7: conserva resultados parciales) + **re-clonar** vía `assign_template_to_student`, preservando `start_date`, `end_date`, `schedule_mode`, `preferred_days` y `linked_assignment_id` del assignment viejo.

**Importante (evals):** el clon nuevo arranca **vacío** (sin responses). Los resultados que la alumna ya cargó quedan en el clon archivado y siguen visibles como histórico. El modal lo advierte explícitamente por alumna que tenga registros.

---

## Implementación

**`features/plans/assignmentHelpers.js`:**
- `fetchTemplateAssignees(supabase, templateId)` → assignments vivos de clones del template (join profiles + conteo de resultados para evals).
- `reassignTemplate(supabase, { templateId, assignee })` → archive old + `assignTemplateToStudent` preservando metadata. Archive-then-assign (evita choque con unique de plan activo).

**`features/plans/components/ReassignTemplateModal.jsx`** (nuevo): lista con checkboxes (todas marcadas por default), badge de "N registros se conservan" por alumna, botón bulk "Re-asignar a N", manejo de errores por alumna.

**`features/plans/pages/EditPlanPage.jsx`:** tras `handleSave` exitoso, si `plan.is_template`, `fetchTemplateAssignees`; si hay → abrir modal; sino → navegar como hoy.

**Entrada persistente (opcional/futuro):** botón "Re-asignar a alumnas" en `EvaluationDetailPage`/`PlanDetailPage` cuando el plan es template con asignaciones, para no depender solo del momento de la edición.

---

## Validación
- lint 0, build OK, vitest verde (tests de `reassignTemplate`/`fetchTemplateAssignees` con mock de supabase).
- Smoke: editar template asignado → modal aparece → re-asignar → clon nuevo con estructura actual + viejo archivado → resultados viejos visibles en histórico.
- **No pushear sin OK de Franco** (main auto-deploya a prod).

## Gotchas
- Archive-then-assign: si el assign falla después del archive, la alumna queda sin eval activa momentáneamente. El bulk reporta por-alumna y permite reintentar.
- Re-clonar **no** migra resultados al clon nuevo (por diseño). No confundir con "editar la copia de la alumna" (eso sería otro feature: edición directa del clon).
