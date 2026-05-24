# Plan 24 — Fix B3 + B4: bugs UX en flow de evaluaciones

> Continuación de doc 13 §B3 + §B4. Pedidos del coach Anto en la Ronda 3
> (2026-05-24). Diagnóstico hecho con Supabase MCP + lectura de código
> (ver §3 abajo) — confirmado que NO son bugs de back: son UX que mezcla
> "recetas" (plantillas) con "fotocopias" (clones por alumno).

---

## 1. Decisiones de Franco (24/05)

Las 3 decisiones quedaron tomadas vía AskUserQuestion:

| # | Decisión | Elección |
|---|---|---|
| 1 | B4 — checkbox "Guardar como plantilla reutilizable" en eval | **Sacar el checkbox; toda eval creada es plantilla asignable** |
| 2 | B3 — qué hacer con los clones (instancias personales) en el listado del coach | **Esconderlos del recetario; sólo aparecen en la ficha del alumno** |
| 3 | Datos huérfanos (2 evals con `is_template=false` sin assignments) | **Dejar como están; Anto las recrea si las necesita** |

**Regla heredada de doc 13**: decisiones de producto las toma Franco directo, no se espera a Anto.

---

## 2. Scope acotado

**Lo que SÍ se toca (scope evaluaciones)**:
- `CreatePlanPage.jsx` — ocultar checkbox `is_template` cuando `plan_type='evaluation'`, forzar `is_template=true` en el INSERT.
- `EditPlanPage.jsx` — ocultar checkbox `is_template` cuando es eval. **NO** forzar valor en el UPDATE: preservar `is_template` tal cual estaba (un clon sigue siendo clon).
- `PlansPage.jsx` — filtrar `is_template=false` cuando `plan_type='evaluation'` (esconder clones de eval del listado y del contador de la tab).

**Lo que NO se toca (scope training)**:
- Para `plan_type='training'`, el checkbox `is_template` sigue como hoy: visible y opcional. No hay pedido explícito de Anto y la lógica conceptual difiere (training one-shot personalizado tiene sentido).
- Los clones de training siguen visibles en `PlansPage` como hoy. Si en el futuro Anto reporta la misma confusión para training, se extiende el filtro.

**Lo que NO se toca (datos)**:
- Las 4 evaluaciones existentes con `is_template=false` quedan como están:
  - 2 con assignments ("EVALUACION HIP THRUST", "EVALUACION CHIN UPS Y SENTADILLA") son clones legítimos y van a quedar escondidas del listado por el filtro nuevo.
  - 2 sin assignments ("TEST PLAN 1 ANTO DIA B", "plan 1 anto DIA A") quedan huérfanas pero seguras (decisión Franco). Anto las puede recrear.

---

## 3. Diagnóstico (reproducible)

Verificado contra `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1) el 24/05.

**Estructura del modelo**:
- `plans` con `is_template boolean`, `parent_plan_id uuid`, `plan_type ∈ {training, evaluation}`.
- Trigger `trg_pa_forbid_template` prohíbe `plan_assignments.plan_id` apuntando a un plan con `is_template=true`.
- RPC `assign_template_to_student` clona el plan entero (blocks + exercises) a una instancia con `is_template=false`, título `"<original> — <alumno>"`. Inserta `plan_assignments` apuntando al clon.

**SQL de diagnóstico** (Anto = `4d7b89ef-28af-4407-9d91-b5616e806ce3`):

```sql
SELECT title, is_template,
       (SELECT count(*) FROM plan_exercises WHERE plan_id = p.id) AS n_exercises,
       (SELECT count(*) FROM plan_assignments WHERE plan_id = p.id) AS n_assignments
FROM plans p
WHERE plan_type = 'evaluation' AND created_by = '4d7b89ef-28af-4407-9d91-b5616e806ce3'
ORDER BY created_at DESC;
```

Resultado al 24/05:

| title | is_template | n_exercises | n_assignments | Interpretación |
|---|---|---|---|---|
| TEST PLAN 1 ANTO DIA B | false | 2 | 0 | **Huérfana** — Anto la creó sin tildar checkbox |
| plan 1 anto DIA A | false | 2 | 0 | **Huérfana** — mismo motivo |
| EVALUACION INICIAL — anto almanza | false | 0 | 1 | **Clon vacío** de la plantilla vacía |
| EVALUACION INICIAL | **true** | 0 | 0 | Plantilla original (vacía pero asignable) |
| EVALUACION HIP THRUST | false | 1 | 1 | Clon legítimo |
| EVALUACION CHIN UPS Y SENTADILLA | false | 2 | 1 | Clon legítimo |

**Causa de B4**: `CreatePlanPage.jsx:290` setea default `is_template: false`. El checkbox "Guardar como plantilla reutilizable" (línea 866-877) queda desmarcado y Anto no lo tilda. El dropdown de asignación filtra por `is_template !== false` → las evaluaciones nuevas no aparecen como asignables.

**Causa de B3**: La RPC siempre clona (por diseño). Los clones aparecen en `PlansPage` sin filtro → Anto los ve como "evaluaciones aparte que él no creó".

---

## 4. Implementación

### 4.1 `src/features/plans/pages/CreatePlanPage.jsx`

- **Línea ~290** (estado inicial): cambiar `is_template: false` → mantener `false` por compat con training, pero forzar a `true` en el payload del INSERT para evaluaciones.
- **Línea ~434** (INSERT): `is_template: plan.plan_type === 'evaluation' ? true : plan.is_template`.
- **Línea ~866-877** (checkbox JSX): envolver en `{plan.plan_type !== 'evaluation' && (...)}`.

### 4.2 `src/features/plans/pages/EditPlanPage.jsx`

- **Línea ~1011-1022** (checkbox JSX): envolver en `{!isEval && (...)}`.
- **Línea ~570** (UPDATE): dejar `is_template: plan.is_template` tal cual (preserva el valor existente — clones siguen siendo clones).

### 4.3 `src/features/plans/pages/PlansPage.jsx`

- **Línea ~86** (filtered): agregar exclusión de clones de eval:
  ```js
  const isEvalClone = p.plan_type === 'evaluation' && p.is_template === false
  return matchSearch && matchType && !isEvalClone
  ```
- **Línea ~93** (evalCount): contar sólo plantillas: `plans.filter((p) => p.plan_type === 'evaluation' && p.is_template !== false).length`.

### 4.4 Datos

- **No tocar**. Decisión Franco. Las 2 evals huérfanas quedan invisibles para Anto (porque tienen `is_template=false`). Si las quiere usar, las recrea — y ahora se crearán bien.

---

## 5. Validación

- `npm run lint` clean.
- `npm test` — no hay tests sobre PlansPage / CreatePlanPage hoy; los tests existentes (workouts, evaluaciones helpers) deben seguir verdes.
- Smoke browser francellone:
  1. Login Anto → "Planes" → tab "Evaluación" → contar (debería ser 1: "EVALUACION INICIAL", las 5 con `is_template=false` se esconden).
  2. Crear nueva evaluación "TEST 24/05" → guardar (sin tildar nada, porque el checkbox no existe ya).
  3. Verificar en BD: `is_template=true`. Verificar en "Planes" → aparece en el listado con badge "Plantilla".
  4. Ir a ficha de cualquier alumno → tab Evaluaciones → "Asignar evaluación" → en el dropdown debe aparecer "TEST 24/05".

---

## 6. Riesgos y consideraciones

- **Inconsistencia training vs eval**: el checkbox sigue existiendo para training. Es decisión consciente (Franco no autorizó tocar training en esta vuelta). Si Anto reporta confusión para training, extender el patrón.
- **Coach que tenía una plantilla vacía** (caso real: "EVALUACION INICIAL" de Anto está vacía): no se toca. Si Anto la quiere completar, va a `EditPlanPage` y agrega ejercicios. El fix no afecta este caso.
- **Clones de eval ya creados**: quedan invisibles en `PlansPage`, pero siguen accesibles desde `StudentDetailPage → tab Evaluaciones`. Esto es la intención. Los `evaluation_results` no se rompen.
- **Migración SQL**: no hace falta. Todo es cambio de UI.

---

## 7. Commit

Una sola commit:
```
fix(plans): hide is_template UI for evals; force template on create; filter eval clones from PlansPage (B3 B4)
```
