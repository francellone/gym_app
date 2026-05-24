# Handoff próximo agente — 2026-05-24 (B3 + B4 cerrados)

> **Continuación directa del handoff 22** (madrugada del 24 — Q1 cerrado +
> F4 autosave plan doc 23). Esta sesión: diagnóstico + fix de los bugs B3
> y B4 de la Ronda 3 del coach Anto (doc 13). Además se sumó la regla
> global de decisiones (Franco decide, no Anto).

## Pre-flight al arrancar próxima sesión

1. Leer este doc + handoff 22 + doc 24 (plan de B3+B4) + doc 13 (backlog Ronda 3).
2. Memoria nueva: `feedback_decisiones_franco_no_anto.md` y `project_evaluaciones_estructura.md`.
3. Supabase MCP → `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1).
4. Browser: usar **francellone** (`deviceId 5c324fc5-...`).
5. Working dir: `~/Desktop/gym_app/gym_app/`. Vite: `npm run dev` →
   `http://localhost:5173`.
6. `git log -5` para verificar si Franco mergeó el commit B3+B4.

## Items cerrados esta sesión

### Diagnóstico de evaluaciones — modelo del sistema

Las "evaluaciones" del coach **no son una entidad separada**: viven en `public.plans` con `plan_type='evaluation'`. Hay un sistema **template-based**:

- `plans.is_template boolean` — distingue plantilla (asignable) de instancia personal (clon).
- `plans.parent_plan_id uuid` — tracking de origen del clon (gap: la RPC no lo llena al clonar).
- Trigger `trg_pa_forbid_template` prohíbe que `plan_assignments.plan_id` apunte a un plan con `is_template=true`.
- RPC `assign_template_to_student(template_id, student_id, ...)` clona el plan entero (blocks + exercises) en una instancia nueva con `is_template=false`, título `"<original> — <alumno>"`, e inserta el `plan_assignments` apuntando al clon.

Memoria: `project_evaluaciones_estructura.md`.

### B3 — UX confusa de clones en `PlansPage` (CERRADO)

> *"Una vez creada evaluación inicial, al asignarla a alguien se crea otra aparte sin contenido."* — Anto

**No era bug del back**. Los clones se generan por diseño. El problema: `PlansPage.jsx` mostraba TODO (plantillas + clones), y Anto veía "EVALUACION INICIAL — anto almanza" (vacía porque la plantilla original también lo estaba) como si fuera "otra evaluación" creada por error.

**Fix**: `PlansPage.jsx` filtra `is_template=false` de las evaluaciones en el listado y en los contadores de tabs. Los clones siguen accesibles desde `StudentDetailPage → tab Evaluaciones` (que es donde tienen sentido).

```js
const isEvalClone = (p) => p.plan_type === 'evaluation' && p.is_template === false
const filtered = plans.filter((p) => {
  if (isEvalClone(p)) return false
  ...
})
const evalCount = plans.filter((p) => p.plan_type === 'evaluation' && !isEvalClone(p)).length
```

**Scope acotado**: para training (también puede tener clones) NO se aplica el filtro. Decisión consciente de Franco. Si Anto reporta la misma confusión para training, extender el patrón.

### B4 — Checkbox `is_template` desmarcado por default (CERRADO)

> *"Cuando estoy en el apartado alumnos evaluación me sale solo la de evaluación inicial ya asignada y las evaluaciones (ya creadas) no me aparecen como opción."* — Anto

Causa raíz:
- `CreatePlanPage.jsx:290` default `is_template: false`.
- Checkbox "Guardar como plantilla reutilizable" en línea 866-877, **desmarcado** por default.
- Dropdown de asignación (`StudentEvaluationsTab.jsx:258-260`) filtra `is_template !== false`.
- Anto nunca tildaba el checkbox → 5/6 evaluaciones quedaron con `is_template=false` → no aparecían como asignables.

**Fix (3 archivos)**:
- `CreatePlanPage.jsx`: checkbox oculto cuando `plan_type='evaluation'`; en el INSERT se fuerza `is_template: plan.plan_type === 'evaluation' ? true : plan.is_template`.
- `EditPlanPage.jsx`: checkbox oculto cuando `isEval`. **NO** se fuerza en el UPDATE — preserva el valor existente (un clon sigue siendo clon).
- `PlansPage.jsx`: filtro ya descrito en B3.

**Scope acotado**: para training se conserva el checkbox. Decisión consciente.

### Regla global de decisiones (NUEVA)

A partir del 24/05, **las decisiones de producto sobre el backlog del coach las toma Franco directo**, sin esperar a Anto. Excepciones: maquetas/screenshots de WhatsApp, copy específico, criterios comerciales puros (cuándo cobra).

Aplicada retroactivamente al doc 13 (header de Ronda 3). Memoria: `feedback_decisiones_franco_no_anto.md`.

## Items NO cerrados (pendientes Ronda 3 según doc 13)

Sigue pendiente lo demás de Ronda 3 del 24/05:

- **B2** — Notif de plan/eval no clickeables (extensión natural de Q3 que solo cubrió notas). 2-3h.
- **B5** — Botón "Agregar ejercicio" en cabecera de plan muerto. 1h (eliminar) o 3-4h (implementar modal). Decisión pendiente de Franco.
- **Q9** — Asignar alumno desde evaluación recién creada. Depende parcialmente del fix de B3+B4 ya cerrado. 2-3h.
- **Q10** — Cartel "sin alumno" en plan con CTA "Asignar alumno". 2h.
- **Q11** — Badge visual ejercicios sin video/nota. 2-3h.
- **F11** — Autocierre + notif bloque >24hs. 6-8h, requiere plan doc dedicado (colisiona con F4 autosave).

## Datos huérfanos (decisión Franco: NO tocar)

Hay 2 evaluaciones de Anto con `is_template=false` sin assignments ("TEST PLAN 1 ANTO DIA B", "plan 1 anto DIA A"). Con el filtro nuevo quedan invisibles. Decisión Franco: dejarlas así. Anto las recrea si las necesita (ahora se crearán bien).

## Validación

- ESLint: 0 errors, warnings preexistentes (no introducidas por este fix).
- Vitest: 249/249 verdes.
- Smoke browser: pendiente del deploy. Sugerencia para post-deploy:
  1. Login Anto → `/coach/plans` → tab "Evaluación" → contar (esperado: 1 visible — la "EVALUACION INICIAL" plantilla; las 5 con `is_template=false` deben estar ocultas).
  2. Crear nueva eval "TEST 24/05" → guardar (sin checkbox visible).
  3. SQL: `SELECT title, is_template FROM plans WHERE created_by='4d7b89ef-...' AND title='TEST 24/05';` → debe estar `is_template=true`.
  4. Ficha de un alumno → tab Evaluaciones → "Asignar evaluación" → dropdown debe incluir "TEST 24/05".

## Próximo paso recomendado

Atacar **B5 + B2 + Q10** en la próxima sesión (todos chicos y muy visibles para Anto). Sesión 12 del orden actualizado del doc 13.

## Archivos tocados

- `src/features/plans/pages/CreatePlanPage.jsx` (2 ediciones)
- `src/features/plans/pages/EditPlanPage.jsx` (1 edición)
- `src/features/plans/pages/PlansPage.jsx` (2 ediciones)
- `diagnostico_arquitec/13_pedidos_coach_anto_2026-05-21.md` (Ronda 3 + cierre B3/B4 + regla nueva)
- `diagnostico_arquitec/24_plan_fix_B3_B4_evaluaciones.md` (NUEVO)
- `diagnostico_arquitec/25_handoff_proximo_agente_2026-05-24.md` (NUEVO, este doc)
- Memoria: `feedback_decisiones_franco_no_anto.md`, `project_evaluaciones_estructura.md`.

## Commit sugerido

```
fix(plans): hide is_template UI for evals; force template on create; filter eval clones from PlansPage (B3 B4)
```
