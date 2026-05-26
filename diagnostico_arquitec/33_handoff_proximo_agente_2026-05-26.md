# 33 — Handoff próximo agente (2026-05-26)

**Sesión:** 2026-05-26
**Foco:** los 4 bugs de evaluaciones reportados por Franco (doc 32 Opción A).
**Estado al cierre:** las 4 fases del plan implementadas, 257/257 tests verdes, doc 32 cerrado, commits a `main` con push pendiente cuando Franco apruebe el smoke.

---

## TL;DR

Franco reportó 4 bugs cruzados de evaluaciones (asignar desde la pestaña, desasignar, eval asignada vacía, solo aparece una eval para asignar). El doc 32 los documentó como Opción A/B/C; Franco eligió A. Ataques:

1. **Bug 3 (clon vacío)** — fixed back: la RPC `assign_template_to_student` ahora clona `evaluation_tests`. Migración + backfill del clon vivo de Anto.
2. **Bug 4 (solo aparece Eval Inicial)** — fixed front + data: `DuplicatePlanModal.jsx:38` pasa a `is_template: true`; backfill SQL marcó como `true` a las 3 evals con 0 assignments.
3. **Bug 2 (desasignar)** — feature nueva: action ✕ en `EvaluationCard` + `UnassignEvaluationModal`; UPDATE `plan_assignments` con active=false + status='archived' (Q4 13.7 Anto).
4. **Bug 1 (asignar desde lista)** — feature nueva: botón UserPlus en `EvaluationsPage` + `AssignEvalToStudentModal`; reutiliza `assignTemplateToStudent`.

C1-C4 (inconsistencias colaterales detectadas durante el diagnóstico) **NO** se atacaron — Franco pidió dejarlas para la próxima sesión.

---

## 1. Lo que pasó en la sesión

### Diagnóstico (mañana)

Pre-flight OK (Supabase MCP → bvexjanqmfypmtgoapbt, browser francellone disponible, memoria Q1 leída). La carpeta seleccionada por Cowork fue la subcarpeta vacía con sólo `CLAUDE.md`; Franco confirmó que el scope era la carpeta padre `gym_app/`.

El reporte original venía de un cambio de tema: estaba planificada una sesión de orden/escalado del proyecto pero Franco pivotó a 4 bugs concretos de evaluaciones. La sesión se reorientó.

Hallazgos clave del diagnóstico (todos en doc 32):

- **5 de 6 evals** tenían `is_template=false` — solo 1 era plantilla legítima.
- **El clon vivo de Anto** (`EVALUACION INICIAL — anto almanza`) tenía 0 evaluation_tests contra los 8 del padre.
- **La RPC `assign_template_to_student`** clonaba `plans + plan_blocks + plan_exercises + plan_assignments` pero NO `evaluation_tests`.
- **`DuplicatePlanModal.jsx:38`** hardcodeaba `is_template: false`, contradiciendo B4+Q10 del 24/05.
- **`EvaluationsPage`** no tenía action de asignar.
- **`EvaluationCard`** no tenía action de desasignar.

### Implementación (tarde)

Fase 1 (Bug 3 — back):

- Migración `supabase/migrations/20260526120000_assign_template_clones_evaluation_tests.sql`. Aplicada vía MCP.
- Backfill data fix: copiar 8 tests del template `EVALUACION INICIAL` (id `2b9a3a29-...`) al clon de Anto (id `e9bab8ec-...`). Aplicado vía MCP.
- **Hallazgo durante implementación**: el primer intento de la RPC seteaba `parent_plan_id := p_template_id` para cerrar C1, pero el trigger `plans_validate_parent` exige que parent_plan_id apunte a training (no a eval). La RPC se rehizo SIN ese set; C1 queda DIFERIDO formalmente (ver §3).

Fase 2 (Bug 4):

- `DuplicatePlanModal.jsx:38` cambiado a `is_template: true` con comentario explicativo.
- Backfill SQL: `UPDATE plans SET is_template=true WHERE plan_type='evaluation' AND is_template=false AND NOT EXISTS(plan_assignments con ese plan_id)`. Esto marcó 3 evals (las que tenían 0 assignments). Las 2 con assignments completados (HIP THRUST, CHIN UPS de abril) quedaron intactas — el trigger `trg_pa_forbid_template` podría rechazar el flip; Anto las puede recrear desde la UI si las quiere usar.

Fase 3 (Bug 2):

- `EvaluationCard` en `StudentEvaluationsTab.jsx`: outer `<button>` → `<div role="button" tabIndex>` para permitir botón anidado de desasignar (a11y OK). Botón ✕ en header solo cuando `!historical && status ∈ {active, paused}`.
- `UnassignEvaluationModal` agregado al final del archivo. UPDATE atomic con `active=false, status='archived'`, callback `onRefresh`.

Fase 4 (Bug 1):

- `EvaluationsPage.jsx`: botón UserPlus al lado del Delete en cards con `is_template !== false`.
- `AssignEvalToStudentModal` agregado al final del archivo. Carga `profiles WHERE role='student'` lazy al abrir + dropdown + llama `assignTemplateToStudent` con `templateId + studentId + startDate=today`.

### Validación

- `npm run lint`: 0 errores, 71 warnings (baseline 72 — bajamos 1).
- `npm run build`: 3263 modules transformed OK; el comando final falla en cleanup de `dist/` por sandbox limit (no es error de código).
- `npx vitest run`: **257/257 verdes**, sin regresiones.
- Smoke browser: NO realizado — Franco quería que avance directo, los SQL/RPC fueron concluyentes. **Recomendación: hacer smoke antes del push si Franco aprueba.**

---

## 2. Estado del repo al cierre

### Archivos tocados

| Archivo | Tipo | Bug |
|---|---|---|
| `supabase/migrations/20260526120000_assign_template_clones_evaluation_tests.sql` | new | 3 |
| `src/features/plans/components/DuplicatePlanModal.jsx` | mod | 4 |
| `src/features/evaluations/pages/StudentEvaluationsTab.jsx` | mod | 2 |
| `src/features/evaluations/pages/EvaluationsPage.jsx` | mod | 1 |
| `diagnostico_arquitec/32_plan_bugs_evaluaciones.md` | new | (plan) |
| `diagnostico_arquitec/33_handoff_proximo_agente_2026-05-26.md` | new | (handoff) |

### Migraciones aplicadas a prod (MCP)

1. `assign_template_clones_evaluation_tests` — RPC nueva (sin parent_plan_id).
2. `assign_template_clones_evaluation_tests_no_parent` — re-apply de la RPC (revertir el seteo de parent_plan_id que rebotó por trigger).
3. `backfill_anto_eval_inicial_clone_tests` — copiar 8 tests al clon.
4. `backfill_evaluation_templates_is_template_true` — marcar 3 evals como template.

Las 4 son idempotentes / acción-única. No hay rollback automático; si algo va mal, revertir manualmente.

### Commits planeados (todavía sin push al cierre)

```
fix(evaluations): clonar evaluation_tests en assign_template_to_student (Bug 3 doc 32)
fix(plans): DuplicatePlanModal genera plantillas, no instancias (Bug 4 doc 32)
feat(evaluations): desasignar evaluación desde EvaluationCard (Bug 2 doc 32)
feat(evaluations): asignar a alumno desde EvaluationsPage (Bug 1 doc 32)
docs(diagnostico_arquitec): plan 32 + handoff 33 cierre Opción A (doc 32)
```

---

## 3. Pendientes / follow-ups conocidos

### Inmediato — smoke browser

Idealmente Franco abre el browser francellone (`gym-appv2.vercel.app`) después del push y valida:

1. **Bug 3**: ir al perfil de Anto → tab Evaluaciones → ver que `EVALUACION INICIAL — anto almanza` muestra las 8 pruebas (no vacía).
2. **Bug 4**: ir al perfil de un alumno → tab Evaluaciones → click "Asignar evaluación" → confirmar que el dropdown muestra 4 templates (no solo 1).
3. **Bug 2**: en ese mismo tab, ver el ✕ al lado del chevron en una eval activa → click → confirm modal aparece → desasignar → la eval desaparece.
4. **Bug 1**: ir a /coach/evaluations → ver UserPlus en cada card de template → click → modal abre con dropdown de alumnos → asignar.

### C1-C4 — inconsistencias colaterales detectadas

Franco pidió "estemos atentos porque después seguirían las inconsistencias". Las que están sin atacar (del doc 32 §inconsistencias colaterales):

- **C1**: la RPC no setea `parent_plan_id` en el clon. Se intentó y rebotó por trigger `plans_validate_parent` (la columna está reservada para linkeo eval-template→training-template). Para resolver: dividir el trigger en dos semánticas (linkeo conceptual vs trazabilidad de clonado) o agregar una columna `cloned_from_plan_id` separada en `plans`. **Severidad media** (auditoría/futuro multi-coach).
- **C2**: el filtro `is_template !== false` deja pasar `null`. Normalizar a `is_template = true` explícito. **Severidad baja** (no hay data con NULL hoy).
- **C3**: `EvaluationsPage` muestra templates y clones mezclados. Cuando haya más clones (1 alumno = 1 clon por eval asignada) la lista se va a saturar. Idea: tabs "Plantillas" / "Asignadas". **Severidad media** (UX).
- **C4**: `EvaluationsPage` no filtra clones por coach creador. Cuando entre el 2º coach va a doler. **Severidad media**.

### Decisión pendiente sobre las 2 evals legacy

- `EVALUACION HIP THRUST` (24/04, 1 plan_ex, 1 assignment completed de Franco Cellone)
- `EVALUACION CHIN UPS Y SENTADILLA` (24/04, 2 plan_ex, 1 assignment completed de Franco Cellone)

Quedaron como `is_template=false`. Franco / Anto pueden:
- (a) **Recrearlas desde la UI**: en `/coach/plans/new` → tipo evaluación. Quedarán con `is_template=true` automáticamente.
- (b) **Forzar flip a true**: requiere validar que el trigger `trg_pa_forbid_template` no rechace UPDATE con assignments completed (es BEFORE INSERT según el nombre, pero conviene confirmar).

Mi voto: **(a)** — más limpio, sin riesgo de trigger. Anto decide si las quiere reusar.

### Tests UI mínimos sugeridos para próxima sesión

- `EvaluationCard.test.jsx`: render con status active → muestra ✕; render con historical=true → NO muestra ✕.
- `EvaluationsPage.test.jsx`: render con plan is_template=true → muestra UserPlus; is_template=false → NO muestra.
- `assign_template_to_student` SQL test: insertar template con evaluation_tests, llamar RPC, verificar que el clon tiene los mismos tests.

---

## 4. Gotchas / aprendizajes para el próximo agente

1. **`parent_plan_id` en `plans` está reservado** por el trigger `plans_validate_parent` para linkeo eval-template → training-template. Si alguna vez se quiere reusar esa columna para template→clon, primero hay que tocar el trigger.

2. **`DuplicatePlanModal.jsx`** ahora produce `is_template: true`. Si en algún test/flow se asumía que el duplicado era instancia personal, revisar. Hoy no hay nada que lo asuma (`PlansPage` filtra por `is_template=false` para mostrar "instancias", pero esos son los clones de la RPC, no los duplicados manuales).

3. **El backfill `is_template=true`** NO cubrió las 2 evals con assignments completed. Si Anto reporta "estas dos evals todavía no aparecen en el dropdown", la respuesta correcta es "creá una nueva desde Planes → Nueva evaluación" — el flow nuevo las hace template por default.

4. **`EvaluationCard`** ya no es un `<button>` outer — es `<div role="button">`. Si en el futuro hay algún test E2E que hace `cy.get('button:contains("EVALUACION INICIAL")')`, tiene que cambiar a `cy.get('[role="button"]')`.

5. **El handoff 30 mencionaba** que el cartel "no cumple las reglas" se traducía desde la RPC. Ese fix sigue intacto — no se tocó `errorHelpers.js`.

---

## 5. Recomendación de orden para la próxima sesión

1. **Smoke browser de los 4 bugs** (5-10 min). Confirmar que funcionan en prod.
2. **Si todo OK**: avanzar con uno de los items del backlog que estaban en cola pre-doc 32 (handoff 31 §Opción A): **B2** (notif clickeables), **Q11** (badge "falta video"), **Q4** "desasignar evaluaciones" — ahora resuelto, sacar del backlog.
3. **Si Franco quiere atacar las colaterales C1-C4**: empezar por C3 (UX en `EvaluationsPage`, tabs Plantillas/Asignadas). Es la más visible cuando crezca el volumen.

---

**Cerrado por:** agente Cowork sesión 2026-05-26
**Próximo agente:** lee este handoff + doc 32 + `MEMORY.md`. Si Franco arranca con "¿cómo quedó lo de las evals?", la respuesta corta es: "Las 4 fases del doc 32 implementadas, smoke pendiente. C1-C4 quedan como follow-up que él decidió postergar."
