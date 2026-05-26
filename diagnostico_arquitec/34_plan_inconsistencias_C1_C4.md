# 34 — Plan de cierre inconsistencias C1-C4 (post doc 32)

**Fecha:** 2026-05-26 (tarde)
**Origen:** doc 32 §inconsistencias colaterales — Franco dijo "estemos atentos porque después seguirían". Ahora vamos.
**Estado:** PLAN, sin tocar código. Esperando OK por opción (A/B/C).

---

## Re-evaluación de C1-C4 con datos reales (verificado contra prod 26/05 tarde)

| Item | Severidad inicial (doc 32) | Severidad re-evaluada | Por qué cambió |
|---|---|---|---|
| **C1** — RPC no setea linaje template→clon | Media | Media (sin cambio) | Sigue valiendo. Solución limpia: columna nueva `cloned_from_plan_id`, no hackear `parent_plan_id`. |
| **C2** — `is_template !== false` deja pasar NULL | Baja | Baja (sin cambio) | Hoy NO hay data con `is_template=NULL`. Pero el `column_default` actual es `false`, lo cual contradice B4+Q10. Limpieza de schema. |
| **C3** — EvaluationsPage mezcla templates + clones | Media | Media-alta | Crece con cada asignación. Hoy ya hay 5 instancias vs 3 templates. Replicar pattern de PlansPage (`isClone` filter + tabs). |
| **C4** — Filtrar clones por coach creador | Media | **Baja / absorbida** | **La RLS `coach_manage_own_plans` ya cubre multi-coach** (`USING (created_by = auth.uid()) AND is_coach()`). Lo que queda — que el coach 1 no vea SUS PROPIOS clones — se resuelve como subset de C3. |

---

## Datos relevantes en prod (al 26/05 PM)

```
plans (22 filas en total):
  evaluation + is_template=true   → 3   (templates)
  evaluation + is_template=false  → 5   (instancias clonadas + legacy del 24/04)
  training   + is_template=true   → 8   (templates)
  training   + is_template=false  → 8   (instancias)

profiles (role=coach):
  Anto Almanza  (anto.au.almanza@gmail.com)
  Carlos Sosa   (prueba_user@gmail.com)
  Gonza Aguera  (prueba_user1@gmail.com)
```

**`plans.is_template`:** `is_nullable=YES`, `column_default=false`. Cero filas con NULL hoy.

**RLS sobre `plans`:** policy `coach_manage_own_plans` con `USING ((created_by = auth.uid()) AND is_coach())`. Aísla coaches entre sí.

**`plans_validate_parent`** trigger: bloquea `parent_plan_id` salvo que apunte a un training template (reservado para linkeo eval→training).

---

## Bug por bug — análisis técnico

### C3 — UX mezclando templates y clones en `EvaluationsPage` (prioridad alta)

**Hoy:** la lista de `/coach/evaluations` muestra los 8 evals de Anto (3 templates + 5 instancias). Cada asignación nueva suma 1 instancia. UX se va a saturar.

**PlansPage** ya resolvió esto el 24/05 (B3+Q10). Pattern (`src/features/plans/pages/PlansPage.jsx`):

```js
const isClone = (p) => p.is_template === false
const filtered = plans.filter((p) => {
  if (isClone(p)) return false      // ← clones afuera del recetario
  ...
})
```

Y los conteos del header excluyen clones. Las instancias se ven solo desde el perfil del alumno (`StudentDetailPage` → tab Evaluaciones), que es donde tienen sentido.

**Fix sugerido:** replicar el patrón `isClone` en `EvaluationsPage.jsx`. ~10-15 LOC. Tabs no son estrictamente necesarios (la página YA filtra por `eval_type` con cards arriba); con el filtro `isClone` alcanza. Si Franco quiere tabs "Plantillas / Asignadas" después, se puede sumar.

### C2 — `is_template` default + nullability

**Hoy:** schema declara `column_default false`. Pero la convención B4+Q10 dice "todo plan se crea como template". `CreatePlanPage:440` lo fuerza a `true`. `DuplicatePlanModal:38` ahora también (fix de hoy). `assign_template_to_student` SQL fuerza `false` para el clon explícito.

Si por algún flujo nuevo o legacy entra una row sin pasar por esos 3 paths, el default `false` la marca como instancia. Eso ya pasó con las evals del 24/04.

**Fix sugerido:** migración SQL:

```sql
ALTER TABLE public.plans
  ALTER COLUMN is_template SET DEFAULT true,
  ALTER COLUMN is_template SET NOT NULL;
```

Riesgo: nulo (no hay filas con NULL hoy). Beneficio: cualquier INSERT futuro que omita la columna entra como template, consistente con B4+Q10. Las inserciones explícitas con `false` siguen funcionando (RPC, etc.). ~3 LOC.

### C1 — Trazabilidad template → clon

**Hoy:** el clon tiene `parent_plan_id=NULL` (reservado para eval-template→training-template). El linaje se reconstruye parseando el sufijo `[Clonado de "..." (template_id=...)]` del `description`.

Riesgos:
- Si alguien edita el description manualmente desde `EditPlanPage`, se pierde la traza.
- Auditar "todos los clones de un template" requiere `LIKE '%(template_id=...%'`, ineficiente y frágil.
- A futuro: feature "ver evolución del alumno en una eval" (comparar registros entre asignaciones del mismo template) necesita el linaje formal.

**Fix sugerido:** columna nueva separada del `parent_plan_id` semántico:

```sql
ALTER TABLE public.plans
  ADD COLUMN cloned_from_plan_id uuid REFERENCES public.plans(id);

CREATE INDEX plans_cloned_from_plan_id_idx ON public.plans(cloned_from_plan_id);
```

+ actualizar la RPC `assign_template_to_student` para que el INSERT del clon incluya `cloned_from_plan_id := p_template_id`.

+ backfill SQL one-shot que parsee el sufijo del `description` y rellene la columna para los clones existentes (5 evals + 8 training instancias). El parsing es directo porque el formato es estable: `(template_id=<uuid>)`.

~40 LOC SQL en total. Riesgo bajo (columna nueva, no toca semántica existente).

### C4 — Filtrar clones por coach creador

**Resolución:** la mayor parte ya está cubierta por:
- RLS (`coach_manage_own_plans`): cuando entre Carlos o Gonza como coach activo, no van a ver los clones de Anto en `EvaluationsPage`.
- C3 (filtro `isClone`): cuando se aplique, Anto tampoco va a ver SUS propios clones en su `EvaluationsPage` — solo aparecerán en perfiles de alumnos.

**Sin acción adicional.** C4 se cierra implícitamente con C3.

---

## Opciones de implementación

### Opción A — Cierre completo C1+C2+C3 (recomendada)

Orden de ataque:

1. **C2** primero (3 LOC SQL, cero riesgo). Migración + chao.
2. **C3** después (replicar `isClone` filter en `EvaluationsPage.jsx`, ~15 LOC JSX).
3. **C1** al final (columna nueva + RPC update + backfill SQL, ~40 LOC).

**Estimación:** ~60-80 LOC en total. Una sesión chica.

**Pros:** cierra los 4 items (C4 absorbido por C3). Schema queda limpio y consistente con B4+Q10. Trazabilidad formal de clones a futuro.
**Contras:** mete 2 migraciones SQL en la misma sesión. Si alguna sale mal hay que coordinar reverts.

### Opción B — Solo C3 (UX visible)

Lo más doloroso para el coach es la lista que crece. Atacar solo eso en esta sesión.

**Estimación:** ~15 LOC JSX. 20 minutos.

**Pros:** mínimo riesgo. Cierra el item más visible.
**Contras:** C1 y C2 quedan para otra sesión y el contexto de hoy se diluye.

### Opción C — C2 + C3 (sin C1)

C1 es la que más toca SQL (columna nueva + backfill) y la menos visible. Diferirla a una sesión propia podría ser razonable.

**Estimación:** ~20 LOC.

**Pros:** schema limpio + UX limpia, riesgo bajo.
**Contras:** la trazabilidad sigue siendo parsing-de-string. Si Franco quiere "ver progreso histórico del alumno en una eval" después, hay que hacer C1 antes.

---

## Recomendación

**Opción A.**

Argumentos:

1. C1 + C2 + C3 son chicos individualmente (60-80 LOC total). La sesión ya tiene todo el contexto cargado.
2. C2 es 3 LOC, riesgo nulo — no hay razón para diferirlo.
3. C1 es la única que toca migración no trivial (columna nueva), pero es **aditiva**: no modifica nada existente, solo agrega. Reversión es DROP COLUMN.
4. Tras esto, el modelo template/clon de evaluaciones queda cerrado del todo. El próximo agente arranca limpio.

Opción B / C son válidas si Franco quiere diferir riesgo, pero el ratio impacto/esfuerzo de Opción A es el mejor.

---

## Preguntas abiertas (input de Franco)

1. **C1 backfill** — el parseo del `description` con `(template_id=<uuid>)` cubre los clones generados por la RPC (post 15/05). Los clones legacy del 24/04 (HIP THRUST, CHIN UPS de Franco Cellone) no tienen ese sufijo. Opciones:
   - (a) Dejar `cloned_from_plan_id=NULL` para esos legacy y comentarlo. Simple, transparente.
   - (b) Intentar matchear por `title LIKE 'EVALUACION HIP THRUST%'` contra algún template hipotético. No hay template padre identificable, así que probablemente queda NULL igual.

   **Mi voto:** (a).

2. **C2 default cambio** — ¿esto puede romper algún test/fixture? Reviso antes de aplicar, pero conviene tener tu OK para tocarlo.

3. **C3 tabs vs filtro plano** — `EvaluationsPage` ya tiene cards de filtro por `eval_type`. ¿Querés sumar tabs "Plantillas / Asignadas" también, o con el filtro plano (`isClone` solo) alcanza? Mi voto: filtro plano para arrancar, tabs si la lista crece más.

---

## Si Franco aprueba la Opción A, próximos pasos concretos

1. Migración SQL `2026052<XX>_plans_is_template_default_true_not_null.sql` (C2).
2. Migración SQL `2026052<XX>_plans_add_cloned_from_plan_id.sql` (C1 parte schema).
3. Recrear RPC `assign_template_to_student` con el INSERT incluyendo `cloned_from_plan_id := p_template_id` (C1 parte runtime).
4. Backfill SQL: parsear `description` de clones existentes para rellenar `cloned_from_plan_id`.
5. `EvaluationsPage.jsx`: agregar `isClone` filter + ajuste de conteos en cards (C3).
6. Tests + lint + build + commits + handoff 35.

---

**Próximo paso:** OK explícito de Franco con `opción A/B/C`.
