# `known-exceptions.md` — trampas operacionales conocidas de gym_app

Catálogo de excepciones, dragons y "esto no es como parece" que ya pisamos al menos una vez. Cada entrada tiene: **síntoma** (lo que verías de afuera), **causa** (qué hay debajo) y **mitigación** (qué hacer ahora — o qué NO hacer).

Mantener este archivo es más barato que redescubrir cada bug. Cuando algún agente (o vos del futuro) caza una nueva trampa, sumá una entrada acá.

Última actualización: 2026-05-23.

---

## RLS

### RLS + `UPDATE … RETURNING` con tombstone en la policy SELECT

- **Síntoma**: un UPDATE sobre `notes` (típicamente un soft-delete: `SET deleted_at=now()`) ejecutado por el autor falla con `42501: new row violates row-level security policy for table "notes"`. El mismo UPDATE como service_role funciona.
- **Causa**: Postgres aplica al NEW row del `UPDATE … RETURNING` la combinación lógica de **todas las USING aplicables**, no sólo el WITH CHECK del policy UPDATE. Si una policy SELECT del mismo rol filtra por `deleted_at IS NULL` (o cualquier tombstone que el UPDATE modifica), la NEW row no la pasa y el UPDATE falla.
- **Mitigación aplicada el 21/05** (migración `20260521222957_fix_student_select_own_notes_any_state.sql`): crear una policy SELECT extra estrictamente acotada al autor (`author_id = auth.uid() AND author_role = 'student'`), sin condición sobre `deleted_at`. Eso le da al UPDATE un camino para pasar el SELECT-check, sin exponer notas borradas en la UI (el front sigue filtrando con `.is('deleted_at', null)`).
- **Patrón a vigilar**: cualquier tabla que (1) tenga RLS, (2) use soft-delete, (3) tenga una policy SELECT con filtro sobre la columna de soft-delete y (4) el front haga `.update(...).select(...)`. Hoy sólo `notes` está resuelto. Revisar antes de meter soft-delete en `notifications` o `evaluation_results`.
- **Cobertura de tests**: pendiente — agregar caso "student soft-deletes own note" en `supabase/tests/rls_smoke_tests.sql` (los smoke tests actuales sólo cubren SELECT cross-student, no INSERT/UPDATE/DELETE).
- **Referencias**: `diagnostico_arquitec/12_fix_rls_student_delete_notes_2026-05-21.md`.

### `profiles` no tiene policy DELETE — y es intencional

- **Síntoma**: querer "borrar" un alumno desde el front tira error de RLS.
- **Causa**: `COMMENT ON TABLE profiles` documenta que no hay policy DELETE para preservar integridad referencial (un `DELETE` cascadearía contra `workout_logs`, `plan_assignments`, `notes`, `evaluation_results`, `notifications`, etc.).
- **Mitigación**: "borrar" un alumno = `UPDATE profiles SET active=false` y/o `is_test=true`. Si se requiere borrado real en el futuro, exponer endpoint admin con `service_role`, no policy DELETE.

### `public.student_profiles` es snapshot inmutable del intake, NO source-of-truth

- **Síntoma**: existe una tabla `public.student_profiles` (4 filas) con columnas que parecen "perfil del alumno" (`objetivo_principal`, `nivel_experiencia`, `frecuencia_semanal`, `lugar_entrenamiento`, `tiene_lesiones`, `patologias`, `nombre`, `apellido`). Tentador leerla en features nuevas → **no hacerlo**.
- **Realidad**: es snapshot inmutable del intake form al momento de alta. Los datos vivos del perfil viven en `public.profiles` (`goal`, `level`, `weekly_frequency`, `lugar_entrenamiento`, `tiene_lesiones`, `patologias`, `descripcion_lesiones`, `weight_kg`, `height_cm`, `target_weight_kg`). `public.intake_form_submissions.responses` contiene la misma data en jsonb cuando `submission_id IS NOT NULL`.
- **Mitigación / defensa**: la tabla tiene `COMMENT ON TABLE` explícito + `COMMENT ON COLUMN` en `objetivo_principal`, `nivel_experiencia`, `frecuencia_semanal`, `raw_data`, `submission_id` que apuntan a sus equivalentes operacionales. Cualquier `\d+ public.student_profiles` en psql o introspección por dashboard lo muestra. Si abrís un PR que lea de esta tabla, asumí que estás en el camino equivocado y mirá `public.profiles` primero.
- **Por qué se mantiene viva**: valor histórico — saber qué dijo el alumno cuando arrancó (antes de cualquier edición posterior del coach o del propio alumno). Útil eventualmente para F8 (historial de peso/objetivo) si se quiere mostrar el valor "original" del intake como baseline.
- **Cero callers actuales**: 0 funciones Postgres la referencian, 0 archivos del front la referencian. `process_intake_submission` lee de `intake_form_submissions.responses` y escribe directo a `public.profiles`.

---

## Plans & asignaciones

### Nunca hacer INSERT directo en `plan_assignments` con un `plan_id` de template

- **Síntoma**: `INSERT INTO plan_assignments (plan_id, student_id, ...) VALUES (<template-id>, ...)` falla con error del trigger `plan_assignments_forbid_template`.
- **Causa**: el modelo es "un template se CLONA a una instancia personal y la instancia es lo que se asigna". Permitir asignar el template directo hace que un edit del coach modifique los planes de TODOS los alumnos asignados.
- **Mitigación**: usar SIEMPRE la RPC `assign_template_to_student(...)` que clona atómicamente y devuelve `{assignment_id, plan_id, template_id, student_id}`. El front ya lo hace desde `features/plans/assignmentHelpers.js` y `PlanDetailPage`.
- **Si encontrás `plan_assignments` viejos apuntando a templates** (pre-trigger): ejecutar `migrate_assignment_off_template(p_assignment_id)` — clona el template y reasigna el `plan_id`.

### `plan_assignments.linked_assignment_id` vs `replaced_by_assignment_id`

- `linked_assignment_id`: el plan actual es continuación de uno anterior (secuencia natural).
- `replaced_by_assignment_id`: el plan actual fue reemplazado por otro (substitución, ej. el coach cambió de programa de hipertrofia a uno de fuerza). El "replaced_by" se setea en el plan VIEJO al crearse el nuevo.

No confundir: secuencia ≠ substitución. La UI las muestra distinto.

---

## Workouts

### `save_workout_log` escribe a columnas viejas Y nuevas

- **Síntoma**: `workout_logs` tiene columnas `actual_reps`, `actual_weights`, `actual_weight` (legacy v22-) Y `reps_jsonb`, `weights_jsonb`, `weight_mode`, `unilateral`, `reps_unit` (v23+). Cualquier código que lea una sola "rama" da resultados parciales.
- **Causa**: refactor v23 (2026-05-10) introdujo el modelo nuevo (`*_jsonb` permite arrays variables, `weight_mode` permite `bodyweight`/`with_weight`/`barbell_only`) sin migrar todos los consumidores en un solo commit. La RPC `save_workout_log` escribe en ambos para coexistencia.
- **Mitigación**: NO leer columnas viejas en código nuevo. NO escribir a columnas nuevas saltándose la RPC (la coherencia entre los dos sets la garantiza ella). Cuando se haga el sunset, va a haber un commit `chore(workouts): drop legacy actual_* columns` con migración.

### `workout_sessions` rechaza planes `plan_type='evaluation'`

- **Síntoma**: INSERT/UPDATE en `workout_sessions` con un `plan_id` que apunta a un plan de tipo `evaluation` falla.
- **Causa**: trigger `workout_sessions_block_evaluations`. Los evals viven conceptualmente en `evaluation_results`, no en sessions. Si una eval se registrara como session, contaminaba el calendario y el ranking de adherencia.
- **Mitigación aplicada**: para registrar una evaluación, usar `evaluation_results` + `evaluation_test_responses`, no `workout_sessions`. La UI del coach ya lo hace.
- **Excepción conocida** (del COMMENT en `workout_logs`): `student1@gmail.com` (cuenta test) tiene **113 logs históricos** en su clon "Plan 1 - Introducción — Franco" (`plan_type=evaluation`) **sin `workout_sessions` parent**. Los logs son anteriores al trigger. Como es cuenta test, se deja así. Si se elimina la cuenta o se reclasifica el clon a `training`, este caso se resuelve.

### Workout sessions abandonadas se cierran solas

- `workout_sessions.finished_at` puede quedar NULL si el alumno cierra la app sin tocar el botón "Finalizar".
- Un cron diario corre `fn_cleanup_abandoned_sessions()` que cierra las sessions con `started_at >24h` y `finished_at NULL`:
  - Si hay `workout_logs` hijos: `finished_at = max(log.updated_at)`.
  - Si no: `finished_at = started_at + 90 min`.
- Implicancia: **no asumir** que `started_at` y `finished_at` están "cerca" en sessions viejas — pueden haberse cerrado artificialmente.

---

## Notes (panel coach↔alumno, v24/v31)

### Las 7 columnas legacy `*.notes` siguen vivas — el shim transmuta a `public.notes`

- **Síntoma**: hay un `legacy_notes_shim_log` con filas nuevas cada semana. ¿No estaban migradas a `public.notes`?
- **Causa**: `fn_legacy_notes_shim` es un trigger write-through: cuando algo escribe a las columnas legacy (`profiles.notes`, `workout_logs.notes`, `workout_block_logs.notes`, `evaluation_results.notes`, `evaluation_test_responses.notes`, `evaluation_test_responses.coach_comment`, `evaluation_test_responses.student_comment`) **NO bloquea** el INSERT/UPDATE original, sino que además crea la nota correspondiente en `public.notes` (m26).
- **Sunset**: cuando `legacy_notes_shim_log` deje de recibir filas con `outcome='created'` por una semana entera, significa que el front migró 100% y se puede dropear el trigger y las columnas. Hoy todavía recibe filas — el sunset no llegó.
- **Filas con `outcome='error'`**: investigar caso por caso. Una de v24 tuvo problemas con `coach_comment` vacíos.

### `notes_resolve_context` denormaliza, pero `context_type='free'` respeta el cliente

- `notes.exercise_id`, `muscle_group`, `block_type`, `note_date` se resuelven en el trigger `notes_resolve_context` a partir del `context_type` + `context_id`.
- **Excepción**: cuando `context_type='free'`, el trigger respeta los valores que mandó el cliente (no los sobreescribe). Eso permite notas "libres" con tagging manual de músculo/fecha. v26b.

### Realtime no emite el UPDATE de soft-delete (¿siempre?)

- Reportado en commits del 17/05 y mitigado en `afb3ea7` (21/05 PM): cuando un client borra una nota propia, el `UPDATE notes SET deleted_at=now()` a veces no llegaba al realtime de los demás. Solución: `removeNoteLocally` + `onDeleted` callback en `NoteCard.jsx` para hacer optimistic remove desde el caller.
- **No es bug propio del realtime de Supabase** — está relacionado con el problema RLS+RETURNING descrito arriba (cuando el UPDATE fallaba en BD, el cliente "veía" el optimistic delete pero nada más). Ya resuelto con la policy adicional.

### `UltimoRegistro` tiene su propio `useAuth()` dentro

- **Síntoma**: si movés el componente `UltimoRegistro` (en `src/features/evaluations/pages/StudentEvaluationsTab.jsx` ~línea 569) a otro archivo, `saveComments` empieza a recibir `coachId: undefined`.
- **Causa**: `UltimoRegistro` no hereda el `profile` del padre — tiene su propio `useAuth()` interno, necesario para `coachId: profile?.id` al guardar comentarios.
- **Mitigación**: si lo movés, mantenelo o pasalo como prop explícita. NO asumir herencia desde el padre.

---

## Identity / accounts

### `get_coach_id()` está DEPRECATED — no usar en código nuevo

- Devuelve **un coach arbitrario** sin `ORDER BY` (puede cambiar entre llamadas con el mismo dataset).
- Se sigue manteniendo sólo para no romper migraciones viejas que la referencian.
- **Alternativas correctas**:
  - Si el caller es coach (`is_coach()` = true): `auth.uid()`.
  - Si el caller es student: `my_coach_id()` (devuelve `profiles.coach_id`).
- **Cuándo dropearla**: cuando una pasada de `grep get_coach_id` en `supabase/migrations/` y en el front devuelva cero callers. Lo cual no es hoy.

### Crear alumnos: SIEMPRE vía edge function `create-student`

- **Por qué**: signUp directo desde el front rompe la sesión del coach (Supabase Auth tiene un único "current user" por navegador). La edge function `create-student` usa un cliente aislado (`supabaseIsolated`) que no toca cookies/localStorage del browser.
- **NO**: `supabase.auth.signUp({ email, password })` desde código del coach.
- **SÍ**: `supabase.functions.invoke('create-student', { body: {...} })`.

---

## Operacional / sandbox de Cowork

### El sandbox no puede borrar/mover archivos preexistentes

- **Síntoma**: durante una sesión de agente, comandos como `rm dist/`, `git mv massive_rename`, edición de `.husky/_/`, etc. fallan o devuelven warnings.
- **Causa**: el filesystem del sandbox de Cowork es read-only sobre archivos que ya existían antes de la sesión (sí permite crear nuevos, sí permite editar archivos que vos abriste en la sesión).
- **Mitigación**: cualquier refactor que mueva/borre archivos tiene que terminar en un bloque `bash` que Franco corre en su terminal. Patrón vivo desde el 21/05 (handoff `10_*` lección 2).
- **Casos típicos afectados**: cleanup de `dist-batch*`/`vite.config.js.timestamp-*.mjs`, `git mv` masivos al reorganizar features, `chmod +x` en `.husky/pre-commit`.

### MCP de Supabase está atado a UNA cuenta — cambiar de proyecto = perder el otro

- **Síntoma**: Franco tiene dos proyectos Supabase en cuentas distintas (gym_app en `francellone@gmail.com` / org `gymorg`, y la app de clubes en otra cuenta / org `dpcmuifonrkdpnizuzbs`). El MCP de Cowork sólo permite **un PAT activo** por connector remoto.
- **Causa**: el connector Supabase de Cowork (`https://mcp.supabase.com/mcp`) guarda un único auth — reconectarlo con otro PAT pisa el anterior.
- **Mitigación**: para alternar, reconectar el connector con el PAT de la cuenta correspondiente. El dashboard web sigue mostrando ambas orgs, lo que cambia es sólo el acceso del MCP. Si en algún momento Cowork agrega soporte para múltiples instancias del mismo connector o si Franco mete una cuenta como miembro de la otra org, esto deja de ser problema.

---

## Pendientes operativos (no son trampas, pero figuran como "ojo con esto" en handoffs)

- `auth_leaked_password_protection` está **desactivado** en Supabase Auth. Es un toggle manual en Dashboard → Authentication → Password Protection. Aparece en advisors como WARN desde el 16/05.
- 26 RPCs tienen `GRANT EXECUTE` a `anon`. La mayoría (~11) no se llaman desde el front actual — candidatas a `REVOKE EXECUTE FROM anon`. Ver `api-rpcs.md` §"Pendiente para futuro hardening".
- Los `supabase/tests/rls_smoke_tests.sql` actuales (6 tests) sólo cubren SELECT cross-student. Pendiente sumar INSERT/UPDATE/DELETE y un caso de soft-delete student.

---

## Cómo sumar una entrada nueva acá

1. ¿Pasa más de una vez? Sí → entrada acá. No → comentario inline donde está el código + entrada en el handoff de la sesión correspondiente.
2. Estructura: **síntoma** → **causa** → **mitigación**. Sin esa estructura el archivo se vuelve un montón de prosa que nadie relee.
3. Si la entrada lleva a cambio de código o nueva migración: linkear al commit / migración / handoff que la fixea.
4. Si una entrada queda **obsoleta** (porque se fixeó el patrón estructural, no sólo el caso puntual): no la borres — agregá un encabezado `### [RESUELTA <fecha>] <título>` y movela al final del documento, archivada. Mostrar el "antes" sigue siendo útil.

---

## Entradas resueltas (archivo)

### [RESUELTA 2026-05-23] `archive.student_profiles` mal ubicada

- **Síntoma original (vigente hasta el 23/05)**: tabla en schema `archive` con 4 filas vivas, 13 columnas, 2 policies activas (`coach_read_own_student_profiles`, `student_manage_own_student_profiles`). Convención del repo dice "archive = backup deny-by-default sólo `service_role`" — esta no cumplía.
- **Causa**: histórico — quedó en `archive` por una migración interrumpida que no se completó.
- **Resolución**: migración `move_student_profiles_to_public_with_clarifying_comments` (2026-05-23, handoff 16). `ALTER TABLE archive.student_profiles SET SCHEMA public` + `COMMENT ON TABLE` + `COMMENT ON COLUMN` en 5 columnas para que cualquier dev/agente futuro entienda que es snapshot inmutable del intake (no source-of-truth). Policies, FKs, trigger y RLS viajaron con la tabla automáticamente.
- **Hallazgo en el diagnóstico previo**: la tabla estaba huérfana (0 funciones Postgres la referencian, 0 archivos del front la referencian). NO era operacional como se asumía en el doc 11 §2.1 — era residuo del flujo original del intake que `process_intake_submission` ya no usa (proyecta directo a `public.profiles`). Esto bajó el riesgo del move a casi cero (sin refactor en front).
- **Defensa contra recaída**: ver entrada vigente "`public.student_profiles` es snapshot inmutable del intake, NO source-of-truth" más arriba.
