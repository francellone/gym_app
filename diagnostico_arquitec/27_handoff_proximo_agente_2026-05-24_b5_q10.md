# Handoff próximo agente — 2026-05-24 (B5 + Q10 cerrados)

> **Continuación directa del handoff 25** (24/05 — B3 + B4 cerrados).
> Esta sesión: B5 (botón muerto) + Q10 (cartel "Plan personalizado sin
> alumnos para asignar") cerrados extendiendo el modelo template a
> training. Sin migración SQL (decisión Franco). Auditoría histórica
> profunda confirma integridad sana.

## Pre-flight al arrancar próxima sesión

1. Leer este doc + handoff 25 + doc 26 (plan B5+Q10) + doc 13 (backlog Ronda 3).
2. Memoria: leer `project_plans_template_estructura.md` (actualizada para reflejar que el modelo template aplica a TODOS los plan_type).
3. Supabase MCP → `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1).
4. Browser: usar **francellone** (`deviceId 5c324fc5-...`).
5. `git log -5` para verificar si Franco mergeó el commit B5+Q10.

## Items cerrados esta sesión

### Auditoría de integridad histórica (verificable)

Antes de tocar nada, audité el flujo de asignación a lo largo del tiempo porque Franco preguntó por integridad. Hallazgos clave:

- **Único corte de lógica**: migración `fix_2_1_y_raices_template_assignments` (2026-05-15 12:10) instaló trigger `trg_pa_forbid_template` + RPC `assign_template_to_student`. Antes de eso, INSERT directo a `plan_assignments` era válido. Después, el plan_id debe apuntar a `is_template=false`.
- **Alineación del front**: commit `10f4ffb fix(plan-assignments): usar RPC assign_template_to_student al asignar plantillas`. Desde ahí, cero INSERT directos en `src/` (verificado con grep).
- **Función `migrate_assignment_off_template(p_assignment_id uuid)`**: helper SQL que se usó como rescate al aplicar el trigger. Clona el plan completo (blocks, exercises, workout_logs, workout_sessions, evaluation_results), reapunta el assignment al clon, y deja descripción autogenerada `[Clonado de "<plantilla>" (template_id=...) el <fecha> — instancia personal del alumno]`. Esto explica los 3 clones del 15/05 con título `<original> — <alumno>` sin parent_plan_id (gap conocido).

Clasificación de los 8 planes training con `is_template=false`:

| Categoría | Cantidad | Detalle |
|---|---|---|
| `legacy_pre_trigger` | 3 | PLAN 11, PLAN 1 APP, PLAN 10 FRANCO. Pre-15/05, asignados directo, todos con assignments en distintos status. |
| `rpc_clone_no_parent` | 3 | "Plan 3 — Fuerza Básica — Franco Cellone" (assign archived), "PLAN 1 💪🏼🥳 — Ana Moran" (2 active), "Plan 5 - Hipertrofia A — Franco" (1 active). Generados por `migrate_assignment_off_template` el 15/05. |
| `original_huérfano` | 2 | **Plan 2** (Anto, 24/05, caso de la captura) + **M1: Gonza** (Gonza Aguera, 13/04, pre-trigger nunca asignado). |

**Veredicto**: integridad sana. Cada plan se explica con la regla vigente en su fecha de creación.

### Hallazgo lateral: alumnos con nombre casi idéntico a sus coaches

- Coach **Anto Almanza** (`4d7b89ef-...`, `anto.au.almanza@gmail.com`) tiene una alumna llamada **anto almanza** (`21a0ea25-...`, `annto51099@gmail.com`) — `coach_id` confirma la relación. La alumna YA tiene PLAN 1 APP activo.
- Coach **Gonza Aguera** (`7203b81e-...`, `prueba_user1@gmail.com`) tiene un alumno **Gonzalo Aguera** (`d94c52c8-...`, `gonza.13.aguera@gmail.com`) — `coach_id` confirma. El alumno no tiene plan asignado.

Esto disparó la pregunta: "los huérfanos, ¿no eran para los alumnos?" Decisión Franco: no migrar nada en BD, ni a `is_template=true` ni asignándolos a esos alumnos. El coach recrea si los necesita.

### B5 — Botón muerto "+ Agregar ejercicio" (CERRADO)

`PlanDetailPage.jsx` línea ~857: `<button>` sin `onClick`. Eliminado. Quedó comentario explicativo. Los botones "+ Agregar ejercicio" dentro de cada bloque se mantienen (funcionan).

### Q10 — Cartel "Plan personalizado sin alumnos para asignar" (CERRADO — futuros planes)

Diagnóstico: el cartel aparece cuando `plan.is_template === false && assignments.length === 0`. La causa raíz coincide exactamente con B4: el checkbox "Guardar como plantilla reutilizable" en `CreatePlanPage.jsx` quedaba desmarcado por default → el coach no lo tildaba → plan inasignable.

**Fix (3 archivos)** — replicar exactamente el patrón de B4 para training:
- `CreatePlanPage.jsx`: checkbox eliminado para todo `plan_type` (ya estaba oculto para evaluation desde B4). INSERT fuerza `is_template: true` siempre.
- `EditPlanPage.jsx`: checkbox eliminado para todo `plan_type`. UPDATE preserva el valor existente (clones siguen siendo clones; legacy is_template=false siguen siendo legacy).
- `PlansPage.jsx`: renombrado `isEvalClone` → `isClone` y generalizado a `p.is_template === false`. Filtra del listado y de los contadores `trainingCount`, `evalCount`, "X planes en total".

**Scope explícito**:
- Sólo cambios de UI. **Cero migraciones SQL.**
- El cartel "Plan personalizado (sin alumnos para asignar)" en `PlanDetailPage.jsx` líneas 950-962 **se mantiene como está**. Sólo se ve para los 8 planes legacy `is_template=false` si Anto entra por URL directa. Si futuras quejas, agregar CTA "Convertir en plantilla y asignar" en esa rama.

## Datos huérfanos (decisión Franco: NO tocar)

- **Plan 2** de Anto (24/05) — invisible en PlansPage post-filtro, accesible sólo por URL directa.
- **M1: Gonza** (13/04) — invisible.

Los 2 quedan inasignables. Si los coaches los quieren usar, los recrean — ahora cualquier plan nuevo se crea con `is_template=true` y es asignable de una.

## Validación

- ESLint en archivos tocados: **0 errors**, warnings preexistentes.
- Vitest: **249/249 verdes**.
- Smoke browser: **pendiente del deploy**. Sugerencia:
  1. Login Anto → `/coach/plans` → tab "Entrenamiento" → contar (esperado: **8 plantillas**, los 8 con `is_template=false` ocultos).
  2. Crear plan training "TEST 24/05 TRAINING" → guardar (sin checkbox visible).
  3. SQL: `SELECT title, is_template FROM plans WHERE created_by='4d7b89ef-...' AND title='TEST 24/05 TRAINING';` → debe estar `is_template=true`.
  4. Ficha de alumno (ej "anto almanza") → tab Planes → "Asignar plan" → dropdown incluye "TEST 24/05 TRAINING".
  5. PlanDetailPage de "TEST 24/05 TRAINING" → NO aparece "+ Agregar ejercicio" en el header (B5). Los botones dentro de cada bloque sí siguen.
  6. URL directa a Plan 2 (`/coach/plans/9d2512f9-0bbd-4b93-93f9-64b1a35cffd6`) → confirmar que el cartel triste sigue ahí (esperado: sí, no se tocó).

## Pendientes Ronda 3 (doc 13)

Cerrados a la fecha de Ronda 3: B1, Q3, Q7, Q8, prereq archive→public + rename a intake_profile_snapshots, Q6, Q1 (Opción C), F4 (Opción A localStorage), B3, B4, **B5**, **Q10**.

Quedan abiertos:
- **B2** — Notif de plan/eval no clickeables (extensión natural de Q3). 2-3h.
- **Q9** — Asignar alumno desde evaluación recién creada. Depende parcialmente de B3+B4 ya cerrado. 2-3h.
- **Q11** — Badge visual ejercicios sin video/nota. 2-3h.
- **F11** — Autocierre + notif bloque >24hs. 6-8h, plan dedicado (colisiona con F4 autosave).

Pendientes Ronda 1+2: Q2, Q4, Q5, F1, F2, F3, F5, F6, F7, F8, F9, F10, G1, G2.

## Próximo paso recomendado

**B2 + Q9** juntos (~5h). Ambos son mecánicos y se benefician del scaffolding ya tocado en sesiones anteriores (B2 reusa el patrón de `NotificationBell.jsx` que se sumó en Q3+Q6; Q9 reusa `AssignEvaluationForm` que ya está en `StudentEvaluationsTab.jsx`).

Alternativa sin código: avanzar **G1** o **G2** (dashboard coach con alertas, tiene transcripción en `diagnostico_arquitec/assets/G2_dashboard_coach_alertas_transcripcion.md`).

## Archivos tocados

- `src/features/plans/pages/PlanDetailPage.jsx` (1 edición — B5)
- `src/features/plans/pages/CreatePlanPage.jsx` (2 ediciones — Q10)
- `src/features/plans/pages/EditPlanPage.jsx` (1 edición — Q10)
- `src/features/plans/pages/PlansPage.jsx` (2 ediciones — Q10)
- `diagnostico_arquitec/26_plan_fix_B5_Q10_training_template.md` (NUEVO)
- `diagnostico_arquitec/27_handoff_proximo_agente_2026-05-24_b5_q10.md` (NUEVO, este doc)
- `diagnostico_arquitec/assets/B5_Q10_plan_personalizado_sin_alumnos_transcripcion.md` (ya existía como untracked al iniciar la sesión)
- Memoria: actualizar `project_evaluaciones_estructura.md` → renombrar o reescribir como `project_plans_template_estructura.md` (modelo aplica a todo plan_type).
- Pendiente Franco: pegar binario `B5_Q10_plan_personalizado_sin_alumnos.png` al lado del .md.

## Trampas conocidas

- **Working tree con residuos al cierre del 24/05**: `dist-verify-q1/` y `dist-verify-f4/` (limpiar con `rm -rf dist-verify-*` o sumar a `.gitignore`). El `22_handoff_proximo_agente_2026-05-23_madrugada.md` modificado de sesión anterior sigue pendiente — preguntar a Franco si commitea o descarta.
- **husky + lint-staged falla en sandbox por permisos sobre `.git/objects`** y/o `.git/index.lock`. Commits desde la terminal de Franco con `git commit --no-verify` si hace falta.
- **`isClone` ahora aplica también a training**: si se revierte el filtro de PlansPage, hay que revertir TAMBIÉN el "X planes en total" de la cabecera (línea ~116).
- **El cartel triste no se eliminó del código** — sigue en `PlanDetailPage.jsx` líneas 950-962. Sólo se mostraría para los 8 planes legacy con URL directa. Si Franco quiere limpiarlo, decidir copy nuevo + CTA "Convertir en plantilla y asignar".
- **Smoke con cuidado de no romper PLAN 1 APP de la alumna anto almanza**: ese plan es legacy, sigue activo, sigue funcionando. Si la cuenta de Anto coach lo abre por URL directa, va a ver "Plan personalizado (sin alumnos para asignar)" en la sección Alumnos — confuso pero esperado (el assignment está, pero la sección lista vacía porque is_template=false). **Doble check antes de cambiar cualquier cosa sobre `PlanDetailPage` que pueda afectar legacy.**

## Commit sugerido

```
fix(plans): extender modelo template a training; quitar B5 botón muerto (B5 Q10)
```
