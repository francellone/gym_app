# 35 — Handoff próximo agente (2026-05-26 tarde, cierre inconsistencias C1-C4)

**Sesión:** 2026-05-26 (continuación de la tarde tras smoke iteración 2)
**Foco:** cerrar las inconsistencias colaterales C1-C4 que quedaron pendientes del doc 32.
**Estado:** Opción A del doc 34 implementada. 4 migraciones aplicadas + 1 fix front. 257/257 tests verdes.

---

## TL;DR

Doc 34 cerrado con Opción A (C1+C2+C3, ya que C4 quedó absorbido por C3+RLS). Cambios:

- **C2 (schema):** `plans.is_template` ahora `NOT NULL DEFAULT true`, consistente con B4+Q10.
- **C3 (UX):** `EvaluationsPage` filtra clones del listado y de los conteos (mismo pattern que `PlansPage` aplicó hace 2 días).
- **C1 (linaje):** columna nueva `plans.cloned_from_plan_id` (separada de `parent_plan_id` que está reservado por el trigger `plans_validate_parent`). RPC actualizada para llenarla. Backfill parseó el sufijo `(template_id=<uuid>)` del description y rellenó 6 clones (3 evals + 3 training); los 7 clones legacy sin sufijo quedaron NULL, documentado en el COMMENT de la columna.
- **C4:** absorbido. La RLS `coach_manage_own_plans` ya cubre multi-coach. La parte mismo-coach se resuelve con el filtro `isClone` de C3.

---

## 1. Cambios aplicados

### Migraciones SQL (4 nuevas, todas aplicadas via MCP en prod)

| Timestamp | Nombre | Qué hace |
|---|---|---|
| `20260526150000` | `plans_is_template_default_true_not_null` | ALTER COLUMN is_template SET DEFAULT true + SET NOT NULL. |
| `20260526150100` | `plans_add_cloned_from_plan_id` | ADD COLUMN cloned_from_plan_id uuid REFERENCES plans(id) ON DELETE SET NULL + INDEX + COMMENT. |
| `20260526150200` | `assign_template_clones_with_cloned_from` | CREATE OR REPLACE FUNCTION assign_template_to_student con cloned_from_plan_id := p_template_id en el INSERT del clon. |
| `(sin archivo)` | `backfill_cloned_from_plan_id_from_description` | Backfill via regex sobre description. 6 clones rellenos, 7 legacy NULL. |

### Código modificado

| Archivo | Qué hace |
|---|---|
| `src/features/evaluations/pages/EvaluationsPage.jsx` | `isClone(p) = p.is_template === false` + filtra clones del listado y de los conteos (header `templates.length`, cards EVAL_TYPES counts). |

---

## 2. Estado al cierre

### `plans` table

```
plan_type    is_template    total
training     true            8
training     false           8  (4 legacy NULL cloned_from_plan_id, 3 con linaje, 1 legacy)
evaluation   true            3
evaluation   false           5  (3 con linaje, 2 legacy 24/04 NULL)
```

is_template ahora `NOT NULL DEFAULT true`. La RPC sigue forzando `false` para clones.

### Trazabilidad de clones

6 con linaje completo (cloned_from_plan_id apunta al template):
- `EVALUACION INICIAL — Prueba` x2 (clones de `EVALUACION INICIAL`)
- `EVALUACION INICIAL — anto almanza` (clon de `EVALUACION INICIAL`)
- `PLAN 1 💪🏼🥳 — Ana Moran`
- `Plan 5 - Hipertrofia A — Franco`
- `Plan 3 - Fuerza Básica — Franco Cellone`

7 sin linaje (legacy, cloned_from_plan_id=NULL — documentado en COMMENT):
- 5 training legacy: `Plan 2`, `PLAN 11 FRANCO C`, `PLAN 1 APP`, `M1: Gonza`, `PLAN 10 FRANCO`
- 2 evaluation legacy del 24/04: `EVALUACION HIP THRUST`, `EVALUACION CHIN UPS Y SENTADILLA`

### Tests / Lint / Build

- 257/257 verdes.
- 0 errores ESLint, 70 warnings (estable vs último check).
- Build no probado en esta tanda; mod de un solo file pequeño.

---

## 3. C4 resolución (importante para no buscarlo después)

C4 = "filtrar clones por coach creador en EvaluationsPage" se descartó como item separado:

- **Multi-coach**: cubierto por RLS `coach_manage_own_plans` con `USING ((created_by = auth.uid()) AND is_coach())`. Cuando entre Carlos o Gonza como coach activo, no verán los clones de Anto.
- **Mismo coach viendo sus propios clones**: cubierto por C3 (`isClone` filter). Anto no ve sus propios clones en `EvaluationsPage`.

No requiere acción adicional. Documentado en doc 34 §re-evaluación.

---

## 4. Pendientes / follow-ups

### Inmediato

- **Smoke browser** post-deploy (Vercel auto-deploya tras push):
  1. `/coach/evaluations` debe mostrar **3 templates** (no 8): EVALUACION INICIAL, plan 1 anto DIA A, TEST PLAN 1 ANTO DIA B. Las instancias clonadas y las 2 legacy del 24/04 ya no aparecen acá; siguen visibles desde el perfil del alumno.
  2. Conteos de las cards EVAL_TYPES en el header deben coincidir con templates (no incluir clones).
  3. Asignar una eval nueva → confirmar que el clon resultante tiene `cloned_from_plan_id` apuntando al template (verificable con SQL si hace falta).

### Quedan como follow-up sin urgencia

- **Legacy del 24/04 (HIP THRUST, CHIN UPS)** siguen `is_template=false` con `cloned_from_plan_id=NULL`. Visibles desde el perfil de Franco Cellone (que tiene las assignments completed) pero no desde EvaluationsPage. Si Anto pide reusarlas, se recrean desde la UI (van a entrar como template `true` automáticamente).
- **EvaluationDetailPage**: cuando expandís un template, hoy NO muestra la lista de pruebas (solo muestra resultados de alumnos). El bug 3 iter 2 cubrió la vista del coach desde el perfil del alumno; el view "biblioteca" sigue mostrando solo resultados. Es UX coherente pero podría sumarse un tab "Pruebas asignadas" si se requiere preview desde la lista del coach.
- **Tabs Plantillas / Asignadas** en `EvaluationsPage`: por ahora `EvaluationsPage` solo muestra templates (gracias a C3). Si en algún momento se requiere ver clones también desde acá (auditoría), sumar tab. No urgente.

---

## 5. Gotchas / aprendizajes para el próximo agente

1. **`cloned_from_plan_id` ≠ `parent_plan_id`.**
   - `cloned_from_plan_id`: linaje template → clon. Lo setea la RPC al asignar. NULL en templates y legacy.
   - `parent_plan_id`: linkeo eval-template → training-template (reservado por trigger `plans_validate_parent`). NULL en clones.
   - No mezclar. Si en el futuro alguna feature necesita "qué clones existen de este template", usar `cloned_from_plan_id`.

2. **`is_template` ahora NOT NULL DEFAULT true.** Si algún flujo nuevo inserta un plan sin especificar `is_template`, va a entrar como template (consistente con B4+Q10). Para crear una instancia hay que pasarlo explícito en `false` (lo que hace la RPC).

3. **El backfill del 26/05 no cubrió los legacy del 24/04.** Si en el futuro Franco quiere darles linaje formal, hay que matchear por title contra algún template hipotético — pero hoy no hay template padre identificable, así que probablemente sigan NULL.

4. **El query original de Anto (`EVALUACION INICIAL — anto almanza`) ahora tiene `cloned_from_plan_id` = el id del template** además de los 8 evaluation_tests del backfill anterior. La asignación queda completa.

---

## 6. Recomendación de orden para la próxima sesión

1. Smoke browser de C2+C3+C1 + iteración 2 del doc 32 (5-10 min).
2. Si todo OK: avanzar con uno de los items del backlog que quedaron pre-doc 32 — handoff 31 §Opción A sugería **B2** (notif clickeables, continuación natural de Q3).
3. Si Franco quiere algo más estratégico: G2 (Dashboard semanal con alertas) tiene plan documentado pendiente y Anto ya respondió todas las decisiones.

---

**Cerrado por:** agente Cowork sesión 2026-05-26 tarde
**Próximo agente:** doc 34 + este handoff + memorias actualizadas (`project_doc34_inconsistencias_2026_05_26.md` opcional).
