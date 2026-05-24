# Plan 26 — Fix B5 + Q10: extender modelo template a training

> Continuación de doc 13 §B5 + §Q10. Cierra los dos pedidos visibles en la
> captura de Anto del 24/05 (`assets/B5_Q10_plan_personalizado_sin_alumnos_*`).
> Diagnóstico hecho con Supabase MCP + git log + lectura del trigger SQL —
> confirmado que NO hay bugs de back y la integridad histórica está sana
> (ver §3). Es UX puro.

---

## 1. Decisiones de Franco (24/05)

Las 3 decisiones quedaron tomadas vía AskUserQuestion:

| # | Decisión | Elección |
|---|---|---|
| 1 | Q10 — ¿cómo encaramos el cartel "personalizado sin alumnos"? | **Replicar fix B4 a training**: ocultar checkbox `is_template`, forzar `true` en INSERT. El cartel deja de aparecer para futuros planes porque ya no quedan en `is_template=false`. |
| 2 | PlansPage — ¿qué hacemos con los 8 planes training `is_template=false` que ya existen? | **Ocultarlos del listado** (consistente con evals, B3). Quedan accesibles desde ficha del alumno. |
| 3 | UPDATE quirúrgico de los 2 huérfanos (Plan 2 de Anto, M1 de Gonza) | **No migrar nada en BD**. Quedan invisibles. Anto/Gonza los recrean si los necesitan (los nuevos se crearán bien). |

**Regla heredada de doc 13**: decisiones de producto las toma Franco directo, no se espera a Anto.

---

## 2. Scope acotado

**Lo que SÍ se toca**:
- `PlanDetailPage.jsx` — eliminar botón muerto "+ Agregar ejercicio" (B5, líneas 857-859).
- `CreatePlanPage.jsx` — ocultar checkbox `is_template` para training también (hoy sólo lo oculta para evaluation). Forzar `is_template=true` en el INSERT para training.
- `EditPlanPage.jsx` — ocultar checkbox para training también. **NO** forzar valor en el UPDATE: preserva `is_template` tal cual estaba (un clon/instancia personal sigue siendo lo que era).
- `PlansPage.jsx` — extender filtro `isEvalClone` → `isClone` que aplica también a training. Contadores de tabs ajustados.

**Lo que NO se toca**:
- BD: cero migraciones. Los 8 planes existentes con `is_template=false` quedan como están.
- `PlanDetailPage.jsx` sección "Alumnos asignados" — el copy "Plan personalizado (sin alumnos para asignar)" se mantiene. Sólo se ve si Anto entra por URL directa a un plan legacy (ya no hay caminos de listado).
- Función SQL `migrate_assignment_off_template` — sigue existiendo como helper de migración extraordinaria, no se usa en esta vuelta.

---

## 3. Diagnóstico (reproducible)

Verificado contra `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1) el 24/05.

### 3.1 Cómo cambió la lógica con el tiempo

Único corte: migración **`fix_2_1_y_raices_template_assignments`** (2026-05-15 12:10), que instaló:
- Trigger `trg_pa_forbid_template` — rechaza con `check_violation` cualquier intento de apuntar `plan_assignments.plan_id` a `is_template=true`.
- RPC `assign_template_to_student` — clona la plantilla a una instancia personal (`is_template=false`) y crea el assignment, atómico.

Antes del 15/05 no había restricción: el front hacía INSERT directo a `plan_assignments` desde cualquier plan. El front se alineó al back con el commit **`10f4ffb fix(plan-assignments): usar RPC assign_template_to_student al asignar plantillas`** — desde ahí no quedó ningún INSERT directo en `src/`. Verificado con grep.

También existe la función `migrate_assignment_off_template(p_assignment_id uuid)` que se usó para rescatar assignments que apuntaban a plantillas al aplicarse el trigger: clona blocks/exercises/workout_logs/workout_sessions/evaluation_results, reapunta el assignment al clon, y deja el clon con título `"<original> — <alumno>"` + descripción autogenerada `[Clonado de "<plantilla>" (template_id=...) el <fecha> — instancia personal del alumno]`. Eso explica los 3 clones del 15/05 con ese patrón de título.

### 3.2 Clasificación de los 8 planes training con `is_template=false`

| Plan | Coach | Created | n_ex | n_assign (todos status) | Categoría |
|---|---|---|---|---|---|
| Plan 2 | Anto Almanza | 2026-05-24 | 7 | 0 | **original_huérfano** (caso de la captura) |
| Plan 3 - Fuerza Básica — Franco Cellone | Anto | 2026-05-16 | 0 | 1 archived | rpc_clone (sin uso) |
| PLAN 1 💪🏼🥳 — Ana Moran | Anto | 2026-05-15 | 21 | 2 active | rpc_clone |
| Plan 5 - Hipertrofia A — Franco | Anto | 2026-05-15 | 1 | 1 active | rpc_clone |
| PLAN 11 FRANCO C | Anto | 2026-05-03 | 25 | 3 (active+replaced+archived) | legacy pre-trigger |
| PLAN 1 APP | Anto | 2026-04-24 | 15 | 2 (active+archived) | legacy pre-trigger |
| M1: Gonza | Gonza Aguera | 2026-04-13 | 0 | 0 | **original_huérfano** (pre-trigger nunca asignado) |
| PLAN 10 FRANCO | Anto | 2026-04-13 | 20 | 1 replaced | legacy pre-trigger |

**Veredicto integridad:** sana. Cada plan se explica con la regla vigente en su fecha de creación. No hay assignments rotos, no hay flujos paralelos. El trigger es la única puerta y está cerrada desde el 15/05.

### 3.3 Por qué NO se migraron los huérfanos

Decisión Franco. Detalles:

- **M1: Gonza** — el alumno "Gonzalo Aguera" (`coach_id` apunta a Gonza, sin planes activos) sería un destinatario natural, pero Franco prefirió no tocar data de otro coach.
- **Plan 2** — la alumna "anto almanza" (distinta del coach Anto Almanza; `coach_id` apunta a Anto coach) **ya tiene PLAN 1 APP activo**. Reemplazar su plan vigente sin que Anto lo confirme es muy invasivo. Migrar a `is_template=true` también se descartó: Anto puede recrearlo si quiere.

---

## 4. Implementación

### 4.1 `src/features/plans/pages/PlanDetailPage.jsx` (B5)

Líneas **857-859** — eliminar el `<button>` sin handler:
```jsx
<button className="btn-primary flex items-center gap-1.5 text-sm">
  <Plus size={13} /> Agregar ejercicio
</button>
```
El flujo natural de agregar ejercicio es desde dentro de cada bloque (UI existente y funcional). No se agrega replacement.

### 4.2 `src/features/plans/pages/CreatePlanPage.jsx` (Q10 — create)

- **Línea ~438** (INSERT): cambiar `is_template: plan.plan_type === 'evaluation' ? true : plan.is_template` → `is_template: true` (siempre).
- **Líneas ~875-888** (checkbox JSX): cambiar `{plan.plan_type !== 'evaluation' && (...)}` → eliminar el bloque entero (el checkbox no aplica más ni para training ni para eval).
- Estado inicial línea ~290 `is_template: false` — dejar como está (sirve sólo de fallback; no se lee porque el INSERT fuerza true).

### 4.3 `src/features/plans/pages/EditPlanPage.jsx` (Q10 — edit)

- **Líneas ~1014-1027** (checkbox JSX): cambiar `{!isEval && (...)}` → eliminar el bloque entero.
- UPDATE: dejar `is_template: plan.is_template` tal cual (preserva el valor existente — instancias personales legacy siguen siendo instancias personales; plantillas siguen siendo plantillas).

### 4.4 `src/features/plans/pages/PlansPage.jsx` (Q10 — filtro listado)

- **Línea ~93**: cambiar `isEvalClone` → `isClone` (generalizar):
  ```js
  const isClone = (p) => p.is_template === false
  ```
- **Línea ~95-100** (filtered): reemplazar `if (isEvalClone(p)) return false` → `if (isClone(p)) return false`.
- **Línea ~102-103** (contadores):
  - `trainingCount`: ahora `plans.filter((p) => (!p.plan_type || p.plan_type === 'training') && !isClone(p)).length`.
  - `evalCount`: ahora `plans.filter((p) => p.plan_type === 'evaluation' && !isClone(p)).length`.

---

## 5. Validación

- `npm run lint` clean.
- `npm test` — no hay tests sobre PlansPage / CreatePlanPage hoy; los existentes (workouts, evaluaciones helpers, assignmentHelpers, useLocalStorageDraft) deben seguir verdes. Esperado 249/249.
- Smoke browser francellone:
  1. Login Anto → "Planes" → tab "Entrenamiento" → contar (debería ser **8 plantillas visibles**, no 16; los 8 con `is_template=false` se ocultan).
  2. Crear plan training "TEST 24/05 TRAINING" → guardar (sin checkbox visible).
  3. SQL: `SELECT title, is_template FROM plans WHERE created_by='4d7b89ef-...' AND title='TEST 24/05 TRAINING';` → debe estar `is_template=true`.
  4. Ficha de un alumno → tab "Planes" → "Asignar plan" → en el dropdown debe aparecer "TEST 24/05 TRAINING".
  5. PlanDetailPage de "TEST 24/05 TRAINING" → confirmar que NO aparece el botón "+ Agregar ejercicio" del header (eliminado por B5). Los botones "+ Agregar ejercicio" dentro de cada bloque sí siguen.

---

## 6. Riesgos y consideraciones

- **Visibilidad legacy**: Anto pasa de ver 16 cards a 8 en el listado de training. Los 7 clones siguen accesibles desde ficha del alumno. **Plan 2 + M1: Gonza quedan invisibles desde el recetario** (URL directa funciona). Si esto causa fricción real, levantar el filtro `isClone` para training (revert localizado).
- **Inconsistencia leve**: el cartel "Plan personalizado (sin alumnos para asignar)" sigue apareciendo en `PlanDetailPage` líneas 950-962 si Anto entra por URL directa a un plan legacy. No se cambia el copy en esta vuelta. Si futuras quejas, ampliar para mostrar CTA "Convertir en plantilla y asignar".
- **Clones de RPC**: los 3 clones generados por `migrate_assignment_off_template` el 15/05 no tienen `parent_plan_id` por gap conocido. No se toca acá (no afecta).
- **Migración SQL**: no hace falta. Todo es cambio de UI.

---

## 7. Commit

Una sola commit:
```
fix(plans): extender modelo template a training; quitar B5 botón muerto (B5 Q10)
```
