# Changelog técnico — Backend Supabase

**Proyecto:** `bvexjanqmfypmtgoapbt`
**Período:** 2026-05-14 (diagnóstico) → 2026-05-15 (ejecución completa)
**Convención:** este doc es la **única fuente de verdad consolidada** del estado del back. Cada entrada describe qué se aplicó, por qué, y cómo se taparon las raíces. No repite lo que está en los handoffs (que son auditoría histórica del flujo coordinado con el front) ni en el diagnóstico original.

---

## Cómo leer este doc

- **Sección 1** — timeline cronológico de las migraciones que se aplicaron al schema.
- **Sección 2** — estado actual de la BD (qué hay vivo y para qué sirve cada cosa).
- **Sección 3** — decisiones de diseño que se tomaron y por qué.
- **Sección 4** — pendientes y handoffs abiertos.
- **Sección 5** — cómo verificar la salud del sistema.

---

## 1. Timeline de migraciones aplicadas

Todas las migraciones se aplicaron vía `apply_migration` del MCP de Supabase. Quedan registradas en el historial nativo del proyecto. Lista en orden cronológico:

### Día 1 (2026-05-14) — Diagnóstico

Auditoría manual del schema. Sin cambios.

### Día 2 (2026-05-15) — Ejecución

| # | Migración | Bug atacado | Resumen |
|---|---|---|---|
| 1 | `fix_2_1_y_raices_template_assignments` | 2.1 + raíces 2.1/2.3 | Función helper `migrate_assignment_off_template`; clonó 8 plantillas mal asignadas; cerró 5 evals con results pendientes; instaló triggers `trg_close_eval_on_result` y `trg_pa_forbid_template` |
| 2 | `add_rpc_assign_template_to_student` | 2.1 (front API) | RPC pública para que el front clone plantilla → instancia + crea assignment en un solo call atómico |
| 3 | `fix_2_7_archive_backup_and_2_2_sessions_consistency` | 2.2 + 2.7 | Movió `plan_assignments_backup_20260508` al schema `archive`; eliminó 7 sessions phantom; backfilleó started_at/finished_at en 6 sessions con logs sin dates; cerró 5 sessions abandonadas; corrigió 3 con finished sin started; instaló CHECK `sessions_finished_requires_started` |
| 4 | `fix_3_1_3_2_3_4_indexes_and_on_delete` | 3.1 + 3.2 + 3.4 | Borró 3 índices duplicados; creó 11 índices faltantes en FKs; uniformó `ON DELETE` a `SET NULL` en 5 FKs de `workout_*` → `plans/plan_*` |
| 5 | `enable_pg_cron_extension` | 3.3 | Habilitó extensión `pg_cron` |
| 6 | (4 cron jobs en una sola llamada) | 3.3 | Agendó `release_due_forms_daily`, `notify_expiring_plans_daily`, `notify_stagnation_weekly`, `notify_weekly_summary` |
| 7 | `add_cleanup_abandoned_sessions_cron` | raíz 2.2 | Función `fn_cleanup_abandoned_sessions` + cron diario `cleanup_abandoned_sessions_daily` para cerrar sessions abiertas >24h |
| 8 | `add_schema_health_check_weekly_cron` | raíz 2.7/3.1/3.2/3.4 | Función `fn_schema_health_check` + cron semanal que detecta 6 tipos de regresiones y notifica a los coaches |
| 9 | `fix_health_check_false_positives_and_wellbeing_dup` | (fix del propio health check) | Ajustó la query de "índices duplicados" para considerar partial indexes; eliminó un duplicado real en `wellbeing_logs` que el check había descubierto |
| 10 | `fix_3_5_3_6_3_7_audit_test_accounts_borg_v2` | 3.5 + 3.6 + 3.7 | Trigger `trg_audit_profile_changes` que pobla `student_edit_history` automáticamente; columna `profiles.is_test` (4 cuentas marcadas); dropeó `workout_sessions.borg_scale` y `borg_notes` (0% uso); recreó view `v_workout_session_intensity` sin las columnas legacy |
| 11 | `fix_2_5_consolidate_student_profiles_into_profiles` | 2.5 | Migró datos faltantes de `student_profiles` a `profiles` (regla acordada: pisar profile excepto en 2 conflictos puntuales); reescribió `process_intake_submission` para escribir directo a `profiles`; movió `student_profiles` al schema `archive` |
| 12 | `fix_2_6_descripcion_lesiones` | 2.6 | Columna `profiles.descripcion_lesiones`; CHECK `profiles_lesiones_requires_detail`; pobló dato real para Franco |
| 13 | `update_process_intake_to_read_descripcion_lesiones` | 2.6 (complemento) | Actualizó `process_intake_submission` para leer `descripcion_lesiones` del JSON del intake |
| 14 | `fix_4_x_deuda_media` | 4.1 a 4.7 | NOT NULL en 5 columnas FK core (`plan_exercises.plan_id`, `.exercise_id`, `workout_logs.student_id`, `workout_sessions.student_id`, `workout_block_logs.student_id`); policy DELETE en notifications; COMMENT en columnas legacy; trigger `intake_form_templates_updated_at` |
| 15 | `fix_2_4_step1_schema_and_catalog_classification` | 2.4 Fase 1.A | Agregó 5 columnas en `workout_logs` + 2 en `exercises` + 2 en `plan_exercises`; instaló 4 CHECK constraints; pre-clasificó los 275 ejercicios del catálogo con heurística (143 bodyweight + 132 with_weight) + 19 marcados `default_unilateral` |
| 16 | `fix_2_4_step2_backfill_v4` | 2.4 Fase 1.B | Backfilleó los 422 `workout_logs` a las columnas jsonb (409 parseados, 47 unilaterales detectados, 12 con `reps_unit`, 149 with_weight, 273 bodyweight, 0 violaciones); re-instaló los constraints con validación implícita |
| 17 | `fix_2_4_step3_rpc_and_volume_helper` | 2.4 Fase 1.C | Helper `calculate_log_volume(log_id)`; RPC `save_workout_log` con doble escritura interna a columnas viejas para coexistencia |
| 18 | `fix_5_1_5_3_exercises_cosmetic` | 5.1 + 5.3 | `exercises.created_by` cambió a `ON DELETE SET NULL`; columna `is_active` agregada con 167 ejercicios sin uso marcados `false`; índice parcial sobre activos |

### Día 3 (2026-05-16) — Auditoría post-refactor + fixes de cobertura

Auditoría externa detectó 8 grietas finas que el linter de Supabase identifica pero las queries de health check no cubrían. Detalle completo en `02_auditoria_post_refactor_2026-05-16.md`.

| # | Migración | Bug atacado | Resumen |
|---|---|---|---|
| 19 | `post_audit_2026_05_16_critical_high_fixes` | 2.1 + 2.2 + 2.3 + 2.4 de la auditoría | View `v_workout_session_intensity` con `security_invoker=on` (ya no bypassea RLS); CHECK `sessions_finished_after_started` instalado + 2 sesiones invertidas corregidas; policy `notifications_insert_service` restringida a `service_role`; 9 funciones SD legacy con `SET search_path = public` |
| 20 | `post_audit_2026_05_16_medium_fixes_and_cleanup` | 2.6 + 2.7 + 2.8 + 3.1 + 3.2 | Migrado 1 assignment archived que apuntaba a template + health check ampliado a cualquier status (field renombrado a `assignments_to_templates_any_status`); 3 `plan_exercises` huérfanos mapeados a 2 plan_blocks nuevos auto-creados; RPC `assign_template_to_student` actualizada con `COALESCE(auth.uid(), p.created_by)` + backfill de 13 templates seed con Anto como creator; helpers `_tmp_*` renombrados a `_intake_*` + `process_intake_submission` actualizada; 3 notifs `schema_health_alert` falsas marcadas como leídas |

**Total acumulado:** 20 migraciones atómicas. Cero rollbacks definitivos.

### Día 8 (2026-05-21) — Hardening Tier 1 + fix RLS soft-delete notes (student)

Sesiones del 21/05. Las dos primeras se hicieron en el bloque AM/mediodía (Tier 1) y quedaron sólo como `.sql` en `supabase/migrations/` sin entrada acá — se documentan ahora junto con el fix del bug de la noche.

| # | Migración | Bug atacado | Resumen |
|---|---|---|---|
| 21 | `fix_search_path_six_functions` (`20260521003824`) | Tier 1 — search_path fijo | Reescribe 6 funciones legacy con `SET search_path = public, pg_temp` para evitar resolución insegura de identificadores (advisor de Supabase resuelto). |
| 22 | `enable_rls_on_archive_notes_backups` (`20260521135103`) | Tier 1 — RLS en `archive.*_notes_*` | Habilita RLS en las 5 tablas `archive.*_notes_20260517` con `deny-by-default`. Backups históricos del refactor v25/v26 quedan sólo accesibles por service_role. |
| 23 | `fix_student_select_own_notes_any_state` (`20260521222957`) | Bug prod: student no podía borrar su nota | Agrega policy `Student select own notes any state` (SELECT, `USING author_id = auth.uid() AND author_role = 'student'`). Tapa raíz documentada en `12_fix_rls_student_delete_notes_2026-05-21.md`. |

**Detalle del bug #23 (resumen — desarrollo completo en handoff 12):**

- **Síntoma:** desde el modelo de threads (commit `5357945`, 17/05) hasta el 21/05 PM, ningún student logró borrar su propia nota en prod (0 deletions de student-notes vía UI; las 3 "borradas" del 17/05 son service_role en smoke v25/v26).
- **Causa raíz:** la policy `Student read shared notes of own thread` (SELECT) tenía `(deleted_at IS NULL)` en `USING`. En un `UPDATE ... RETURNING` (que es lo que dispara Supabase JS con `.update(...).select(...)`), Postgres exige que el NEW row también pase el USING de SELECT. Al setear `deleted_at = now()`, el NEW row deja de pasar → `42501 new row violates row-level security policy`. Coach no se ve afectado porque su SELECT policy no chequea `deleted_at`.
- **Fix elegido (alternativa A):** policy SELECT adicional acotada al autor (sin `deleted_at` en `USING`). El front mantiene su filtro `.is('deleted_at', null)` en queries normales, así que la nota sigue desapareciendo de la lista visible tras soft-delete; sólo cambia que el RETURNING del propio `softDeleteNote` se completa.
- **Alternativas descartadas:** (B) quitar `deleted_at IS NULL` de la policy existente — más invasivo, cambia visibilidad histórica; (C) RPC SECURITY DEFINER `delete_note` — más superficie de mantenimiento por un caso puntual.

**Total acumulado actualizado:** 23 migraciones atómicas. Cero rollbacks definitivos.

### Día 10 (2026-05-23) — Limpieza schema `archive` + rename semántico + Q6 perfil editable

| # | Migración | Bug atacado | Resumen |
|---|---|---|---|
| 24 | `move_student_profiles_to_public_with_clarifying_comments` | `archive.student_profiles` mal ubicada (pendiente desde 21/05, `known-exceptions.md` + `11_plan_tier_3_2.md §2.1`) | `ALTER TABLE archive.student_profiles SET SCHEMA public` + `COMMENT ON TABLE` + `COMMENT ON COLUMN` en 5 columnas. Las policies, FKs, trigger y RLS viajaron con la tabla. Diagnóstico previo encontró que la tabla estaba **huérfana** (0 RPCs y 0 archivos del front la referencian) — no era operacional como decía el doc 11. El move bajó el riesgo a casi cero; los COMMENTs evitan que cualquier dev futuro la confunda con source-of-truth (eso es `public.profiles`). Schema `archive` ahora cumple convención: 100% backups deny-by-default. Handoff 16. |
| 25 | `rename_student_profiles_to_intake_profile_snapshots` | Defensa adicional: nombre semántico (handoff 16 §"Sugerencia opcional") | `ALTER TABLE public.student_profiles RENAME TO intake_profile_snapshots` + rename de 2 policies, 1 trigger, 4 constraints (PK + 2 FKs + UNIQUE) para coherencia. COMMENT ON TABLE actualizado con histórico (archive → public → rename). El nombre nuevo cuenta el rol sin necesidad de leer COMMENTs. Continuación inmediata de #24 dentro del mismo handoff. |
| 26 | `q6_notify_coach_on_profile_change` | Q6 doc 13: alumno NO puede editar peso/altura/objetivo desde su perfil, y cuando lo hace no avisa al coach | Trigger nuevo `fn_notify_profile_change` (AFTER UPDATE en `profiles`) que inserta en `notifications(type='profile_change')` cuando cambia uno de 7 campos críticos: `weight_kg, target_weight_kg, goal, tiene_lesiones, patologias, descripcion_lesiones, weekly_frequency`. `height_cm` queda fuera (decisión Franco — no es estratégico). Self-notif suprimida (`auth.uid() = coach_id` → skip) para evitar ruido cuando el coach edita desde `StudentDetailPage`. Audit existente (`trg_audit_profile_changes`) sigue intacto: single-responsibility, este trigger sólo notifica. CHECK constraint `notifications_type_check` ampliado de 11 a 12 tipos. Handoff 17. |

**Total acumulado actualizado:** 26 migraciones atómicas. Cero rollbacks definitivos.

### Día 17 (2026-05-30) — F1: notif al coach cuando el alumno cumple una evaluación

| # | Migración | Bug atacado | Resumen |
|---|---|---|---|
| 27 | `notify_coach_on_eval_completed_F1` | F1 doc 13: no había notificación cuando el alumno completaba una evaluación | `CREATE OR REPLACE` de `fn_close_eval_on_result` (trigger AFTER INSERT en `evaluation_results`). Mantiene el cierre de la asignación y suma un `INSERT INTO notifications(type='evaluation_completed')` al coach del alumno (`profiles.coach_id`, mismo patrón que `fn_notify_session_completed`). Dedup por `student_id+plan_id+día`. El `plan_title` del payload usa el título del **template** vía `cloned_from_plan_id` (cae al título del clon si no hay linaje), para no mostrar "— alumno". |
| 28 | `add_evaluation_completed_to_notifications_type_check` | El CHECK `notifications_type_check` no incluía el tipo nuevo | Sin esto, el `INSERT` del trigger violaba el CHECK y, al ser AFTER INSERT, **abortaba la carga del `evaluation_result` entero** (rompía completar evals). Se amplió el constraint de 12→13 tipos sumando `evaluation_completed`. Detectado por smoke SQL antes de pushear el front. |

**Total acumulado actualizado:** 28 migraciones atómicas. Cero rollbacks definitivos. Smoke con `DO`+rollback confirmó: 1 notif al coach correcto, título limpio del template.

### Día 3 — Decisiones NO ejecutadas (registradas)

| Hallazgo de la auditoría | Decisión |
|---|---|
| 2.5 — 3 alumnos sin `weight_kg` | **No se ataca a nivel back.** El front muestra mensaje cuando NULL pidiendo cargar peso. `calculate_log_volume` devuelve NULL silencioso para bodyweight sin peso — comportamiento intencional. |
| 2.5 — `juan_1` y `prueba@` probablemente test | No se marcan `is_test=true` automáticamente. El coach decide caso por caso. La columna `is_test` se mantiene para uso opcional. |
| 3.3 — 22 índices "unused" | Sin acción. Evaluar en 1-2 meses con tráfico real. |
| 3.4 — Patrones RLS ineficientes | Sin acción. Bajo prioridad con volumen actual (9 alumnos). |
| 3.5 — `auth_leaked_password_protection` | Sin acción desde SQL. Requiere config manual en Dashboard → Authentication. |

---

## 2. Estado actual de la BD

### 2.1. Schema

#### Columnas agregadas durante el proyecto

| Tabla | Columna | Tipo | Propósito |
|---|---|---|---|
| `workout_logs` | `actual_reps_jsonb` | jsonb | Array de reps por set (reemplazo limpio del text sucio) |
| `workout_logs` | `actual_weights_jsonb` | jsonb | Array de pesos por set |
| `workout_logs` | `weight_mode` | text | `with_weight` \| `barbell_only` \| `bodyweight` |
| `workout_logs` | `unilateral` | boolean | Si true, reps son POR LADO; volumen ×2 |
| `workout_logs` | `reps_unit` | text | NULL, `reps`, `pasos`, `respiraciones` o `segundos` |
| `exercises` | `default_weight_mode` | text | Default heredado al asignar al plan |
| `exercises` | `default_unilateral` | boolean | Idem unilateral |
| ~~`exercises`~~ | ~~`is_active`~~ | ~~boolean~~ | **DROPEADA el 2026-05-27** (migración `20260527165112_drop_exercises_is_active_junk_flag`). Era una foto de "sin uso al 16/05" que nunca se mantuvo viva; el front la respetaba sólo en `notes/api.js`. Decisión de producto: el coach debe ver todos los ejercicios sin distinción y la organización visual se resuelve por etiquetas. |
| `plan_exercises` | `weight_mode` | text NULL | Override opcional del default del exercise |
| `plan_exercises` | `unilateral` | boolean NULL | Override opcional del default del exercise |
| `profiles` | `is_test` | boolean | Cuenta de prueba/dev (4 marcadas) |
| `profiles` | `descripcion_lesiones` | text | Detalle de lesión musculoesquelética |
| `student_edit_history` | `changed_by` | (ahora NULL-able) | Permite cambios sistémicos (cron/migración) sin user |

#### Columnas dropeadas

| Tabla | Columna | Razón |
|---|---|---|
| `workout_sessions` | `borg_scale` | 0% de uso (todos los logs usaban `borg_per_day` jsonb) |
| `workout_sessions` | `borg_notes` | Idem |

#### Tablas movidas a schema `archive`

| Tabla | Razón |
|---|---|
| `archive.plan_assignments_backup_20260508` | Tabla de backup en `public` (12 filas, ya en producción) |
| ~~`archive.student_profiles`~~ | **Revertida + renombrada 2026-05-23** (migraciones #24 y #25, handoff 16): se descubrió que era huérfana, no operacional. Movida de vuelta a `public.student_profiles` con `COMMENT ON TABLE`, luego renombrada a `public.intake_profile_snapshots` para que el nombre cuente el rol. Source-of-truth sigue siendo `public.profiles`. |

### 2.2. CHECK constraints activos

| Tabla | Constraint | Qué valida |
|---|---|---|
| `workout_logs` | `workout_logs_weight_mode_check` | `weight_mode IN ('with_weight','barbell_only','bodyweight')` |
| `workout_logs` | `workout_logs_reps_unit_check` | `reps_unit IS NULL OR IN ('reps','pasos','respiraciones','segundos')` |
| `workout_logs` | `workout_logs_bodyweight_no_weights` | Si `weight_mode='bodyweight'`, `actual_weights_jsonb` debe ser NULL/vacío |
| `workout_logs` | `workout_logs_reps_weights_same_length` | `jsonb_array_length(reps) = jsonb_array_length(weights)` cuando ambos existen |
| `workout_sessions` | `sessions_finished_requires_started` | No puede haber `finished_at` sin `started_at` |
| `profiles` | `profiles_lesiones_requires_detail` | Si `tiene_lesiones=true`, debe haber `descripcion_lesiones` o `patologias` real |
| `exercises` | `exercises_default_weight_mode_check` | Idem `weight_mode_check` pero a nivel catálogo |
| `plan_exercises` | `plan_exercises_weight_mode_check` | Idem pero permitiendo NULL (hereda del exercise) |
| `notifications` | `notifications_type_check` | Extendido con `schema_health_alert` |

### 2.3. Triggers preventivos activos

| Trigger | Tabla | Cuándo | Función |
|---|---|---|---|
| `trg_close_eval_on_result` | `evaluation_results` | AFTER INSERT | Auto-cierra `plan_assignment` (eval) al cargar resultados |
| `trg_pa_forbid_template` | `plan_assignments` | BEFORE INSERT/UPDATE | Rechaza assignments que apunten a `is_template=true` |
| `trg_audit_profile_changes` | `profiles` | AFTER UPDATE | Pobla `student_edit_history` con diff columna por columna |
| `intake_form_templates_updated_at` | `intake_form_templates` | BEFORE UPDATE | Mantiene `updated_at` actualizado |

### 2.4. Cron jobs activos (`pg_cron`)

| Job | Schedule UTC | Función |
|---|---|---|
| `release_due_forms_daily` | `0 9 * * *` | `release_due_forms()` |
| `notify_expiring_plans_daily` | `0 10 * * *` | `fn_notify_expiring_plans()` |
| `notify_stagnation_weekly` | `0 11 * * 1` | `fn_notify_stagnation()` |
| `notify_weekly_summary` | `0 12 * * 1` | `fn_notify_weekly_summary()` |
| `cleanup_abandoned_sessions_daily` | `0 5 * * *` | `fn_cleanup_abandoned_sessions()` — cierra sessions abiertas >24h |
| `schema_health_check_weekly` | `0 13 * * 1` | `fn_schema_health_check()` — audita 6 categorías de regresiones y notifica a coaches. **Ampliado 2026-05-16:** el Check 6 ahora cuenta `assignments_to_templates_any_status` (sin filtrar por status). |

Horario en zona Argentina (UTC-3): los cron diarios corren entre 2 y 7 AM, los semanales lunes entre 8 y 10 AM.

### 2.5. Funciones públicas RPC creadas

| Función | Parámetros principales | Devuelve | Propósito |
|---|---|---|---|
| `assign_template_to_student` | `template_id, student_id, ...` | jsonb `{assignment_id, plan_id, ...}` | Clona plantilla → instancia + crea assignment, atómico. **Actualizada 2026-05-16:** el clon ahora usa `COALESCE(auth.uid(), p.created_by)` para que `created_by` refleje al coach que ejecuta. |
| `migrate_assignment_off_template` | `assignment_id` | uuid (nuevo plan_id) | Helper para migrar assignments existentes (usado en el backfill 2.1 y en el fix del archived el 2026-05-16) |
| `save_workout_log` | `student_id, plan_id, plan_exercise_id, logged_date, weight_mode, reps, ...` | uuid (log_id) | Crea/actualiza un log con doble escritura interna a columnas viejas |
| `calculate_log_volume` | `log_id` | numeric | Volumen total del log respetando weight_mode + unilateral |
| `fn_cleanup_abandoned_sessions` | — | integer (cerradas) | Backend del cron diario |
| `fn_schema_health_check` | — | jsonb (reporte) | Backend del cron semanal |

### 2.6. Índices creados/borrados

**Creados** (12 en total):
- 11 índices en FKs que estaban sin cubrir (`idx_evaluation_tests_exercise_id`, `idx_exercises_created_by`, `idx_ifa_plan_assignment_id`, `idx_ifa_template_id`, `idx_plan_assignments_replaced_by`, `idx_plan_exercises_exercise_id`, `idx_student_edit_history_changed_by`, `idx_student_profiles_submission_id`, `idx_workout_block_logs_plan_id`, `idx_workout_logs_plan_id`, `idx_workout_sessions_plan_id`).
- ~~1 índice parcial sobre `exercises (is_active=true)`~~ — dropeado junto con la columna el 2026-05-27.

**Borrados** (4 duplicados):
- `idx_workout_logs_student` (duplicado de `idx_workout_logs_student_id`)
- `idx_workout_sessions_student` (duplicado de `idx_workout_sessions_student_id`)
- `idx_evaluation_results_student_id` (cubierto por `idx_evaluation_results_student`)
- `idx_wellbeing_logs_user_date` (cubierto por el UNIQUE INDEX de la PK compuesta)

### 2.7. Vistas

| Vista | Estado |
|---|---|
| `v_workout_session_intensity` | Recreada sin las columnas borg legacy. Usa `borg_per_day` jsonb como única fuente. |

---

## 3. Decisiones de diseño tomadas

Decisiones de fondo que no se ven directamente en el schema pero que guían cómo todo está conectado:

### 3.1. Plantilla vs instancia (2.1)

- **Plantilla** (`plans.is_template=true`) = receta reutilizable. La coach edita sin afectar a alumnos.
- **Instancia** (`is_template=false`) = copia personal de un alumno. Una por alumno.
- Cada vez que se asigna una plantilla a un alumno, se clona → se crea instancia → el `plan_assignment` apunta a la instancia.
- **El trigger `trg_pa_forbid_template` impone esto a nivel BD.** El front debe usar la RPC `assign_template_to_student`.
- Trazabilidad: cada clon registra en su `description` el `template_id` de origen.

### 3.2. Modos de peso (2.4)

- **3 modos por log:** `with_weight` (con discos/mancuernas), `barbell_only` (solo barra olímpica), `bodyweight` (peso corporal).
- **Herencia:** `log.weight_mode` resuelto = `log.weight_mode ?? plan_exercise.weight_mode ?? exercise.default_weight_mode ?? 'with_weight'`. Idem `unilateral`.
- **Reps unilaterales SIEMPRE por lado**, nunca total. Volumen = reps × peso × (2 si unilateral).
- **Bodyweight** usa `profiles.weight_kg` para calcular volumen. Si está NULL, el front muestra "Peso corporal sin registrar".

### 3.3. No eliminar, dar consistencia (principio general)

- Tablas obsoletas → `archive` (no DROP).
- Columnas con datos → COMMENT como deprecadas (no DROP) hasta confirmar 0% uso real.
- Columnas con 0% uso confirmado y semántica reemplazada → DROP (caso `borg_scale`, `borg_notes`).
- Datos sucios → reorganizados a campos correctos (`unilateral`, `notes`, `reps_unit`) sin perder información.

### 3.4. Doble escritura temporal (2.4 Fase 2)

- La RPC `save_workout_log` escribe a las columnas nuevas Y a las viejas (`actual_reps`, `actual_weights`, `actual_weight`) en formato JSON limpio.
- Esto permite que código legacy del front (mientras no migra) siga leyendo de las viejas sin ver datos sucios.
- Cuando el front confirme 1-2 sprints estables leyendo solo nuevas, se dropean las viejas en Fase 3.

### 3.5. Cuentas test (`is_test`)

- 4 cuentas marcadas `is_test=true`: `alumno_prueba`, `student1`, `franalvarez319`, `juan_1234`.
- El front puede filtrar `is_test=false` en dashboards de la coach cuando lo implemente.
- Excepción documentada: 113 workout_logs de `student1` quedaron huérfanos sin sesión parent (eran logs históricos en un plan que después se reclasificó a evaluation; el trigger `workout_sessions_block_evaluations` impide crearles sesiones).

### 3.6. Health check semanal como red de seguridad

- 6 categorías de chequeos: índices duplicados, FKs sin índice, tablas tipo backup en `public`, FKs con `ON DELETE` no estándar en `workout_*`, sessions abandonadas >48h, **assignments apuntando a templates en cualquier status** (ampliado 2026-05-16; antes solo `status='active'`).
- Si encuentra anomalías, notifica a TODOS los coaches via la tabla `notifications` (tipo `schema_health_alert`).
- Es **reactivo** (te avisa después que pasó), no preventivo. Para preventivo usamos triggers (raíz tapada).

### 3.7. `weight_kg NULL` se acepta en el back, el front comunica al usuario

- `calculate_log_volume` devuelve **NULL silencioso** cuando el log es bodyweight y el alumno no tiene `weight_kg` cargado.
- **El back no obliga a tener `weight_kg`**: ningún CHECK lo exige, ningún trigger lo dispara.
- **El front es la capa que comunica**: cuando detecta `weight_kg=NULL` en un alumno, muestra un banner pidiéndolo y un CTA para cargarlo.
- Esta separación permite que cuentas test, perfiles a medio cargar y altas en proceso sigan funcionando sin romper queries.

### 3.8. `is_test` se mantiene como columna opcional

- Creada en 3.6 con 4 cuentas marcadas (`alumno_prueba`, `student1`, `franalvarez319`, `juan_1234`).
- **No es obligatorio marcar cada cuenta nueva.** El coach decide caso por caso si una cuenta nueva es de prueba.
- Sirve como source-of-truth para que el front pueda filtrar dashboards/métricas en el futuro sin hardcodear emails.
- Costo cero hoy; valor latente si el equipo crece o se delega.

### 3.9. Helpers permanentes deben tener nombre semántico

- Si una función plpgsql va a sobrevivir más allá de su migración (porque otra función la consume), **no debe llamarse `_tmp_*`**.
- Aprendizaje del refactor: durante 2.5 quedaron 2 funciones `_tmp_*` que en realidad eran dependencias permanentes de `process_intake_submission`. Renombradas a `_intake_*` el 2026-05-16.
- Convención: prefijo `_<dominio>_` para helpers internos (ej. `_intake_`, `_backfill_`), sin prefijo si son públicas/RPC.

---

## 4. Pendientes y handoffs abiertos

### 4.1. Pendientes del back

- **2.4 Fase 3** — DROP de columnas viejas `actual_reps`, `actual_weights`, `actual_weight`. Esperar 1-2 sprints de estabilidad del front antes de ejecutar.

### 4.2. Pendientes del front (esperando trabajo del agente del front)

- **9.1** — Mejora UX del banner saveError (recuperable vs persistente por error code). Handoff entregado en `handoff_91_banner_saveerror_para_front.md`. Cero impacto en BD.
- **2.2 sub-validación con datos reales** — el front implementó el flujo de sessions; falta validar con logs reales de alumnos entrenando.
- **UI de catálogo (`is_active`, `default_weight_mode`, `default_unilateral`)** — Anto necesita poder filtrar/editar estos campos desde la biblioteca de ejercicios.

### 4.3. Deuda técnica conocida (no urgente)

- **Duplicados en catálogo por mayúsculas/minúsculas** (ej. "Chin Ups" vs "chin ups", "Jefferson" vs "jefferson"). Documentado en handoff 2.4 sección 11.4. Conviene merge en un sprint propio.
- **Logs textos puros no parseables** (~8 logs con "igual q video" o similar). Su contenido está preservado en `notes`. No requiere acción.

---

## 5. Cómo verificar la salud del sistema

### 5.1. Manual on-demand

```sql
-- Reporte completo de salud del schema
select public.fn_schema_health_check();
-- Esperado: todos los counts en 0.

-- Volumen de un log
select public.calculate_log_volume('<log_id>');

-- Sessions abandonadas que el cron diario cerrará en su próximo run
select count(*) from public.workout_sessions
where started_at is not null and finished_at is null
  and started_at < now() - interval '24 hours';
```

### 5.2. Logs de cron jobs

```sql
select jobid, jobname, status, return_message, start_time, end_time
from cron.job_run_details
order by start_time desc
limit 20;
```

### 5.3. Auditoría de cambios en perfiles

```sql
select seh.changed_at, p.email as alumno,
       coalesce(seh.changed_by::text, 'SYSTEM') as quien,
       seh.field_name, seh.old_value, seh.new_value
from public.student_edit_history seh
join public.profiles p on p.id = seh.student_id
order by seh.changed_at desc
limit 50;
```

### 5.4. Si el health check emite alerta

1. Leer la notification (tipo `schema_health_alert`) — el campo `data` (jsonb) tiene los counts por categoría.
2. Identificar qué subió de 0.
3. Investigar el subset específico (ej. si "índices duplicados > 0", correr la query de detalle de la sección 3.2 del handoff de health check para ver cuáles).
4. Decidir si es un cambio legítimo (refactor en curso) o regresión (revertir).

---

## 6. Métricas finales del refactor

- **27 hallazgos del diagnóstico original** + **8 grietas de la auditoría post-refactor** → todos resueltos o documentados con decisión consciente.
- **20 migraciones atómicas** aplicadas en 3 días, 0 rollbacks definitivos.
- **422 workout_logs procesados** sin pérdida de datos (409 parseados al schema nuevo, 8 con texto puro preservado en `notes`).
- **275 ejercicios del catálogo** pre-clasificados con heurística (143 bodyweight + 132 with_weight, ajustable desde UI).
- **9 plan_assignments mal asignados** migrados sin pérdida (8 en 2.1 + 1 archived en la auditoría); 12 logs en uso activo de Ana preservados, 113 logs históricos de student1 preservados.
- **13 plans con `created_by` NULL** backfilleados a Anto; futuros clones quedan blindados via RPC actualizada.
- **3 plan_exercises huérfanos** mapeados a 2 plan_blocks recién creados.
- **Cero data loss** en alumnos reales.
- **6 cron jobs + 7 triggers + 10 CHECK constraints + 6 RLS policies** instalados como guardrails automáticos.

El back está en condiciones de funcionar autónomamente con los guardrails. La estabilidad final del sistema depende de que el front complete sus pendientes (9.1 banner UX, validación de 2.2 con datos reales) y de que el cron de health check semanal se mantenga en verde.
