# Handoff próximo agente — 2026-05-24 PM (B5 + Q10 validados en prod)

> **Reemplaza al handoff 27**. Esta es la versión final tras smoke en prod
> + fix del cabo suelto del counter "Todos". Todo lo de la sesión 24/05
> está cerrado y verificado.

## Pre-flight al arrancar próxima sesión

1. Leer este doc + handoff 25 + doc 26 (plan B5+Q10) + doc 13 (backlog Ronda 3).
2. Memoria nueva/actualizada: `project_b5_q10_cierre.md` (actualizado), `project_evaluaciones_estructura.md` (renombrado conceptualmente → modelo template aplica a training también), `feedback_vercel_push_required.md` (nueva — sandbox no auto-pushea).
3. Supabase MCP → `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1).
4. Browser: usar **francellone** (`deviceId 5c324fc5-...`).
5. `git log -3` para confirmar HEAD en `5987f45` o más nuevo.

## Estado de cierre 24/05

**Cerrado y mergeado a main**:
- `d03b69d` fix(plans): extender modelo template a training; quitar B5 botón muerto (B5 Q10)
- `9920b54` docs(diagnostico_arquitec): plan 26 + handoff 27 + asset B5/Q10
- `5987f45` fix(plans): tab Todos cuenta sin clones (cabo suelto Q10)

**Validado en prod con smoke browser francellone (6/6 pasos OK)**:
1. `/coach/plans` muestra 9 plantillas (Todos 10 / Entr. 9 / Eval. 1). Antes mostraba 16 / 21.
2. Crear plan training sin checkbox `is_template` visible. ✓
3. SQL: `is_template=true` automático. ✓
4. Plan aparece como opción en dropdown "Asignar plan" en ficha de alumna. ✓
5. PlanDetailPage sin "+ Agregar ejercicio" en header. Cartel "Asignar alumno" aparece para plantillas. ✓
6. URL directa a Plan 2 (huérfano de Anto): cartel "Plan personalizado (sin alumnos para asignar)" persiste — esperado, no se tocó esa rama.

**Cleanup post-smoke**: plan de prueba `TEST 24/05 TRAINING` borrado de BD.

## Decisiones clave tomadas (no revisar a menos que cambie el contexto)

- **Modelo template-clon unificado**: TODO `plan_type` (training + evaluation) se crea con `is_template=true` desde el front. Checkbox eliminado. Asignación va por `assign_template_to_student` que clona.
- **Cero migración SQL**: los 8 planes legacy con `is_template=false` quedan invisibles en PlansPage. Se ven sólo desde ficha del alumno. Plan 2 (Anto) + M1 (Gonza) huérfanos sin acceso desde recetario.
- **Regla decisiones Franco**: backlog del coach lo define Franco directo, no se espera a Anto (salvo maquetas/copy/criterios comerciales).

## Pendientes Ronda 3 (doc 13)

Cerrados hasta hoy: B1, Q3, Q7, Q8, prereq archive→public + rename a intake_profile_snapshots, Q6, Q1, F4, B3, B4, **B5**, **Q10**.

Quedan abiertos:
- **B2** — Notif de plan/eval no clickeables. Extensión natural de Q3. **2-3h. Próximo recomendado.**
- **Q9** — Asignar alumno desde evaluación recién creada. Reusa código de B3+B4. 2-3h.
- **Q11** — Badge visual ejercicios sin video/nota. 2-3h.
- **F11** — Autocierre + notif bloque >24hs. 6-8h, plan dedicado (colisiona con F4 autosave).

Pendientes Ronda 1+2: Q2, Q4, Q5, F1, F2, F3, F5, F6, F7, F8, F9, F10, G1, G2.

## Por dónde seguiría yo

**Opción 1 — Cluster B2 + Q9 (~5h)** — recomendado.
Ambos son mecánicos y arrastran patrones ya tocados:
- B2 reusa `NotificationBell.jsx` (tocado en Q3+Q6). Sumar tipos `plan_assigned` y `evaluation_assigned` al `TYPE_CONFIG` + `getNotificationTargetUrl`. CHECK constraint de `notifications.type` ya tiene los tipos (`fn_notify_plan_assigned` los emite). El gap es sólo el front: hacerlas clickeables y resolver target URL al PlanDetailPage / EvaluationDetailPage correspondiente.
- Q9 reusa `AssignEvaluationForm` que vive en `StudentEvaluationsTab.jsx`. Hoy el flow es: crear eval → guardar → volver a ficha de alumno → tab Evaluaciones → Asignar. Q9 pide acortar: post-guardar mostrar modal/CTA "¿Asignar a alumno ahora?" en `CreatePlanPage.jsx` cuando `plan_type='evaluation'`. Empieza el formulario de asignación directo.

**Opción 2 — Sesión sin código: cerrar decisiones de producto pendientes con Franco.**
Hay items que requieren maqueta/copy: Q4, Q5, F1, F2, F3. Si Anto los manda por WhatsApp, transcribirlos al `diagnostico_arquitec/assets/` y avanzar las preguntas de producto con Franco directo. Útil cuando el modo es chill (tiempo limitado).

**Opción 3 — G1/G2 (dashboard coach con alertas).**
G2 ya tiene transcripción base en `diagnostico_arquitec/assets/G2_dashboard_coach_alertas_transcripcion.md` con 7 triggers + resumen alumno. Pendiente afinar preguntas #13 y #14 con Franco. Cero código todavía, sólo producto.

## Trampas conocidas (actualizadas)

- **Sandbox de Cowork NO pushea automático**. Si verificás cambios en prod y no aparecen, primero `git status -sb` para ver si está ahead. Memoria: `feedback_vercel_push_required.md`.
- **`git commit -am` NO incluye untracked**. Para docs/assets nuevos hace falta `git add` explícito.
- **Service worker en `/sw.js`** puede mantener bundle viejo. Si tras push sigue sin verse el cambio: `(await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister())` + reload con `?_=fresh`.
- **husky + lint-staged falla en sandbox** por permisos sobre `.git/objects` y/o `.git/index.lock`. Commits desde Franco con `git commit --no-verify`. Si lock huérfano: `rm -f .git/index.lock`.
- **Cartel triste en `PlanDetailPage.jsx:950-962`** sigue ahí. Solo se ve para los 8 planes legacy con URL directa. Si Anto reporta, sumar CTA "Convertir en plantilla y asignar".
- **Working tree al cierre del 24/05 PM**: limpio salvo `vitest.config.js.timestamp-*.mjs` (memoria sabida) y posibles `dist-verify-*` que aparezcan en próximas sesiones. Doc 22 (modificado de sesión vieja) **se commiteó accidentalmente con `d03b69d`** porque venía como `M` en working tree desde el inicio + se usó `-am`. Sin impacto pero conviene saberlo si revisás historia.
- **Counter del listado de Planes**: hay 3 lugares que cuentan (header "X planes en total", tabs Todos/Entr/Eval, labels chicos). Todos respetan `isClone`. Si se agrega un counter más, mantener el invariante.

## Archivos tocados

- `src/features/plans/pages/PlanDetailPage.jsx` (1 edición — B5)
- `src/features/plans/pages/CreatePlanPage.jsx` (2 ediciones — Q10)
- `src/features/plans/pages/EditPlanPage.jsx` (1 edición — Q10)
- `src/features/plans/pages/PlansPage.jsx` (3 ediciones — Q10 filtro + contadores + cabo suelto Todos)
- `diagnostico_arquitec/26_plan_fix_B5_Q10_training_template.md`
- `diagnostico_arquitec/27_handoff_proximo_agente_2026-05-24_b5_q10.md` (SUPERSEDED por este doc 28)
- `diagnostico_arquitec/28_handoff_proximo_agente_2026-05-24_b5_q10_validado.md` (este)
- `diagnostico_arquitec/assets/B5_Q10_plan_personalizado_sin_alumnos_transcripcion.md`
- Pendiente Franco: pegar binario `B5_Q10_plan_personalizado_sin_alumnos.png` al lado del .md.

## Commit sugerido para este handoff

```
docs(diagnostico_arquitec): handoff 28 — B5+Q10 validados en prod + cabo suelto counter
```
