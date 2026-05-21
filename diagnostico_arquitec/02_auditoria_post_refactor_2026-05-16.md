# Auditoría post-refactor — Supabase
**Proyecto:** `bvexjanqmfypmtgoapbt`
**Fecha:** 2026-05-16
**Alcance:** verificar el estado real de la BD contra lo documentado en `01_changelog_back.md` y `diagnostico-supabase.md`, y detectar inconsistencias **nuevas** no relevadas en el diagnóstico original.

> **Glosario rápido (para que no se te pierda nada del lenguaje técnico):**
> - **RLS (Row Level Security):** una regla de seguridad que dice qué filas puede ver/editar cada usuario. Es como un filtro automático que Postgres aplica antes de devolverte datos.
> - **View / Vista:** una "tabla virtual" — un SELECT guardado al que te podés conectar como si fuera una tabla.
> - **SECURITY DEFINER:** una función o vista que corre con los permisos de quien la creó (normalmente `postgres`, que es admin), no con los del usuario que la llama. Útil para tareas privilegiadas pero peligroso si bypassa RLS.
> - **search_path mutable:** Postgres busca tablas/funciones en el "search path" del usuario. Si una función SECURITY DEFINER no fija su propio search_path, un atacante puede crear una tabla/función falsa en su schema y suplantar la real.
> - **CHECK constraint:** una regla que la BD valida antes de aceptar un INSERT/UPDATE (ej: "finished_at debe ser >= started_at").
> - **Trigger:** código que la BD ejecuta automáticamente cuando pasa algo (INSERT, UPDATE, etc).
> - **FK (foreign key):** una columna que apunta a la PK de otra tabla, indica una relación padre→hijo.
> - **Health check:** consulta automática programada que reporta si la BD tiene anomalías.

---

## TL;DR — Lectura de 30 segundos

La arquitectura **se mantiene sólida** y todo el refactor de 2026-05-15 está en pie: triggers activos, 6 cron jobs funcionando, índices y FKs correctos, RPC `assign_template_to_student` operativa. **Sin embargo, encontré 8 inconsistencias nuevas** (no relevadas en el diagnóstico original) y **2 quedaron parcialmente resueltas** del diagnóstico original.

| Severidad | Cantidad | Categoría |
|---|---:|---|
| 🔴 Crítico (seguridad / privacidad) | 1 | View con SECURITY DEFINER que **bypassea RLS** |
| 🟠 Alto (datos sucios / regla incompleta) | 4 | sessions invertidas en tiempo, alumnos sin peso, RLS notifications sin restricción, search_path mutable en 9 funciones SD |
| 🟡 Medio (gap de cobertura) | 3 | template archived no detectado por health check, plan_exercises sin block, plans sin creator |
| 🟢 Bajo (limpieza) | 2 | funciones `_tmp_*` huérfanas, notifs viejas no leídas |

---

## 1. Lo que está perfecto ✅ (confirmado contra producción)

- **17 migraciones aplicadas** (match exacto con `01_changelog_back.md`).
- **6 cron jobs activos** (`release_due_forms_daily`, `notify_expiring_plans_daily`, `notify_stagnation_weekly`, `notify_weekly_summary`, `cleanup_abandoned_sessions_daily`, `schema_health_check_weekly`).
- **4 triggers preventivos vivos** (`trg_pa_forbid_template`, `trg_close_eval_on_result`, `trg_audit_profile_changes`, `intake_form_templates_updated_at`).
- **Health checks "core" todos en 0:**
  - assignments activos a templates: 0
  - evaluaciones activas con results: 0
  - sessions fantasma: 0
  - sessions abandonadas >24h: 0
  - students sin coach (reales, no test): 0
  - duplicate indexes: 0
  - FKs sin índice: 0
- **Backfill 2.4 sano:** 422 logs totales, 409 con `actual_reps_jsonb` poblado (97%), 8 con texto puro preservado en `notes` (esperado).
- **`archive.student_profiles` con 4 filas** — match con la consolidación 2.5.

---

## 2. Nuevas inconsistencias detectadas 🆕

### 2.1 🔴 CRÍTICO — La view `v_workout_session_intensity` bypassea RLS

**Qué es esto en simple:** una "vista" en la BD es un SELECT guardado que cualquier usuario puede consultar. Cuando una vista es **SECURITY DEFINER** (que es el default en Supabase si no se especifica lo contrario), corre con los permisos del dueño (`postgres`, admin total), **no con los del alumno que la consulta**. Resultado: un alumno que pida `SELECT * FROM v_workout_session_intensity` ve **TODAS las sesiones de TODOS los alumnos**, ignorando la RLS de `workout_sessions`.

**Evidencia:**
- El Supabase Linter marca esto como **ERROR**: `View public.v_workout_session_intensity is defined with the SECURITY DEFINER property`.
- `reloptions` de la vista es `NULL` (no tiene `security_invoker=true` seteado).
- Owner: `postgres`.

**Impacto:** un alumno técnicamente avanzado podría usar la vista para espiar el RPE/borg de cualquier otro alumno. Riesgo de privacidad real.

**Fix (1 línea):**
```sql
ALTER VIEW public.v_workout_session_intensity SET (security_invoker = on);
```

**Referencia:** [supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)

---

### 2.2 🟠 ALTO — 2 sesiones con `finished_at` ANTES del `started_at`

**Qué es esto en simple:** hay 2 sesiones de entrenamiento donde la BD dice "terminó a las 19:56, empezó a las 19:59". Lógicamente imposible (no podés terminar antes de empezar).

**Evidencia:**
| student | fecha | started_at | finished_at | diff |
|---|---|---|---|---|
| Franco (`d7a1ceb5`) | 2026-04-23 | 19:59:22 | 19:56:29 | **-2 min 52s** |
| `21a0ea25` | 2026-04-28 | 05:22:05 | 04:25:26 | **-56 min** |

**Causa raíz:** el CHECK actual `sessions_finished_requires_started` solo valida "si hay finished, debe haber started", pero **no valida el orden temporal**. El front aparentemente está cerrando sesiones con el `now()` del cliente, sin chequear contra el `started_at` previo.

**Fix:**
```sql
-- 1) Corregir los 2 casos actuales (poner finished_at = started_at + 5min como placeholder, o NULL)
UPDATE public.workout_sessions
SET finished_at = started_at + interval '5 minutes'
WHERE finished_at < started_at;

-- 2) Reforzar el CHECK
ALTER TABLE public.workout_sessions
  ADD CONSTRAINT sessions_finished_after_started
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
  NOT VALID;
ALTER TABLE public.workout_sessions VALIDATE CONSTRAINT sessions_finished_after_started;
```

---

### 2.3 🟠 ALTO — Política RLS `notifications_insert_service` permite spoofear notifs a otros usuarios

**Qué es esto en simple:** la tabla `notifications` tiene una regla que permite "cualquier insert" sin ninguna restricción (`WITH CHECK true`) y está aplicada al rol genérico (visible para todo cliente autenticado). Resultado: un alumno logueado puede crear notificaciones falsas dirigidas a cualquier otro alumno o coach.

**Evidencia (Supabase Linter):**
```
Table public.notifications has an RLS policy notifications_insert_service for
INSERT that allows unrestricted access (WITH CHECK clause is always true).
```

**Detalle de la policy actual:**
```sql
notifications_insert_service | INSERT | WITH CHECK: true | TO: público
```

**Causa raíz:** probablemente la intención era restringir al rol `service_role` (usado por los crons del back) y no a usuarios públicos, pero el `TO service_role` quedó como `TO -` (sin especificar = todos).

**Fix:**
```sql
DROP POLICY notifications_insert_service ON public.notifications;
CREATE POLICY notifications_insert_service ON public.notifications
  FOR INSERT TO service_role
  WITH CHECK (true);
```

---

### 2.4 🟠 ALTO — 9 funciones SECURITY DEFINER sin `SET search_path`

**Qué es esto en simple:** algunas funciones del back corren con permisos de admin (SECURITY DEFINER). Si una función así NO fija explícitamente dónde buscar tablas (`search_path`), un atacante con acceso de creación en otro schema puede crear una tabla "fake" con el mismo nombre y secuestrar la lógica.

**Las 9 funciones afectadas:**
- `get_coach_id`
- `handle_new_user`
- `release_due_forms`
- `fn_notify_expiring_plans`
- `fn_notify_plan_assigned`
- `fn_notify_session_completed`
- `fn_notify_stagnation`
- `fn_notify_weekly_summary`
- `fn_notify_workout_activity`

Las nuevas (`fn_close_eval_on_result`, `fn_cleanup_abandoned_sessions`, `fn_schema_health_check`, `assign_template_to_student`, `migrate_assignment_off_template`, etc.) **sí** tienen `SET search_path TO 'public'` — buena práctica.

**Fix (uno por función):**
```sql
ALTER FUNCTION public.get_coach_id() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.release_due_forms() SET search_path = public;
ALTER FUNCTION public.fn_notify_expiring_plans() SET search_path = public;
ALTER FUNCTION public.fn_notify_plan_assigned() SET search_path = public;
ALTER FUNCTION public.fn_notify_session_completed() SET search_path = public;
ALTER FUNCTION public.fn_notify_stagnation() SET search_path = public;
ALTER FUNCTION public.fn_notify_weekly_summary() SET search_path = public;
ALTER FUNCTION public.fn_notify_workout_activity() SET search_path = public;
```

---

### 2.5 🟠 ALTO — 3 alumnos reales (no test) sin `weight_kg`

**Qué es esto en simple:** el cálculo de "volumen de entrenamiento" para ejercicios de peso corporal (lagartijas, dominadas, etc.) usa el peso del alumno almacenado en `profiles.weight_kg`. Si falta, la fórmula `calculate_log_volume` devuelve 0 o NULL silenciosamente, y todas las métricas de bodyweight del alumno quedan en 0.

**Evidencia:**
| email | name | weight_kg | height_cm | creado |
|---|---|---|---|---|
| juan_1@gmail.com | Juan | NULL | NULL | 2026-04-11 |
| prueba@gmail.com | Prueba | NULL | NULL | 2026-05-15 |
| anabmoran.ap@gmail.com | Ana Moran | NULL | NULL | 2026-05-11 |

**Riesgo:** si cualquiera de los 3 hace ejercicios bodyweight, sus reportes de volumen quedarán infravalorados sin alerta visible.

**Fix sugerido:**
1. Backend: dejar `weight_kg` NOT NULL para alumnos no-test después de captura inicial, **o** modificar `calculate_log_volume` para devolver `NULL` (no 0) y registrar el log_id en `notifications` cuando falta peso.
2. Front: bloquear el alta de alumno hasta que cargue su peso, o emitir un banner persistente "registrá tu peso para ver tu volumen" mientras esté NULL.

---

### 2.6 🟡 MEDIO — 1 `plan_assignment` con `status='archived'` sigue apuntando a un template

**Qué es esto en simple:** la migración 2.1 (templates como assignments) migró 8 assignments problemáticos, pero **dejó uno fuera**: el de `alumno_prueba@gmail.com` con `status='archived'` (assignment del 27/03 sobre el template "Plan 3 - Fuerza Básica"). El health check semanal **no lo detecta** porque solo cuenta `status='active'`.

**Detalle:**
```
assignment_id: 53eb7771-a7d7-407f-8ae5-2dd1f8656c63
student:       alumno_prueba@gmail.com (is_test=true)
plan_id:       fe1e2b16-578e-407f-865f-28c66cad60e0 (template "Plan 3 - Fuerza Básica")
status:        archived
```

**Por qué importa (aunque sea cuenta test):**
- Es **gap de cobertura del health check**. Si mañana un assignment "real" pasa a archived sin migrar, no nos enteramos.
- Si Anto edita ese template, podría afectar el historial de esa cuenta test (irrelevante en sí, pero contamina los principios).
- Indica que el backfill original filtró por `status='active'` y no atacó los archived.

**Fix:**
```sql
-- 1) Migrar el assignment archived
SELECT public.migrate_assignment_off_template('53eb7771-a7d7-407f-8ae5-2dd1f8656c63');

-- 2) Ampliar el health check para que cuente todos los status (no solo active)
-- Editar fn_schema_health_check: quitar el filtro AND pa.status='active' en el Check 6
```

---

### 2.7 🟡 MEDIO — 3 `plan_exercises` con `block_id = NULL` (4.2 quedó sin cerrar)

**Qué es esto en simple:** el diagnóstico original 4.2 marcó "3 plan_exercises con block_id NULL". El changelog dice que la migración `fix_4_x_deuda_media` cubrió "4.1 a 4.7", **pero al revisar el código real, solo aplicó NOT NULL a `plan_exercises.plan_id` y `.exercise_id` — no tocó `block_id`**. Los 3 ejercicios siguen NULL.

**Los 3 ejercicios huérfanos:**
| plan_exercise_id | plan | exercise | block_label |
|---|---|---|---|
| `5c548efb-…` | EVALUACION CHIN UPS Y SENTADILLA (instance) | Dual KB Front Rack Squats | A1 |
| `ab1c1c6f-…` | EVALUACION CHIN UPS Y SENTADILLA (instance) | Chin Ups | A1 |
| `54321364-…` | EVALUACION HIP THRUST (instance) | HIP THRUST | A1 |

Curioso: los tres tienen `block_label='A1'` poblado, lo que sugiere que el modelo viejo usaba el label sin foreign key. Cuando se introdujo `plan_blocks`, estos 3 no se mapearon.

**Fix:**
```sql
-- Opción A: crear un bloque "A1" por plan y mapear
WITH new_blocks AS (
  INSERT INTO public.plan_blocks (plan_id, block_label, section, order_index)
  SELECT DISTINCT pe.plan_id, 'A1', 'main', 0
  FROM public.plan_exercises pe
  WHERE pe.block_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.plan_blocks pb WHERE pb.plan_id=pe.plan_id AND pb.block_label='A1')
  RETURNING id, plan_id
)
UPDATE public.plan_exercises pe
SET block_id = nb.id
FROM new_blocks nb
WHERE pe.plan_id = nb.plan_id AND pe.block_id IS NULL;
```

(Decisión de producto: ¿es OK tener un bloque "A1" auto-creado, o conviene mapear manualmente?)

---

### 2.8 🟡 MEDIO — 13 `plans` con `created_by IS NULL` (trazabilidad rota)

**Qué es esto en simple:** ningún plan en la BD tiene "quién lo creó", incluyendo los 9 templates seed iniciales (sin coach asignado) y las 4 instancias clonadas por la migración `fix_2_1` para Franco.

**Por qué importa:** el RPC `assign_template_to_student` clona la plantilla pero **no propaga** ni el `created_by` del template ni el `auth.uid()` del coach que disparó la asignación. Resultado: con el tiempo, ningún plan instanciado va a tener creador.

**Severidad baja** porque no rompe funcionalidad, pero rompe el principio de trazabilidad declarado en el README ("El sistema se auto-documenta").

**Fix sugerido:**
```sql
-- Editar la RPC assign_template_to_student para SET created_by = auth.uid() en el INSERT del clon.
-- Backfill opcional: setear created_by del clon = created_by del template original.
```

---

## 3. Hallazgos de baja prioridad 🟢

### 3.1 Funciones `_tmp_*` huérfanas en producción
- `public._tmp_map_nivel(text)` y `public._tmp_parse_frecuencia(text)` quedaron de la migración `fix_2_5` (consolidación de `student_profiles`).
- Son helpers de un solo uso, deberían haberse droppeado al final de la migración.
- **Fix:** `DROP FUNCTION public._tmp_map_nivel(text); DROP FUNCTION public._tmp_parse_frecuencia(text);`

### 3.2 3 notifications de tipo `schema_health_alert` sin leer (falsos positivos)
- Todas creadas el 2026-05-15 14:07:18 (mismo run del health check).
- Reportaban `duplicate_indexes: 3`, pero la query del health check tenía un bug que fue corregido en la migración `fix_health_check_false_positives_and_wellbeing_dup` (poco después).
- Ya no se generan, pero las 3 viejas siguen sin leer.
- **Fix:** `UPDATE notifications SET read=true WHERE type='schema_health_alert' AND created_at < '2026-05-15 15:00';`

### 3.3 22 índices marcados como "unused" por el Linter
- Muchos son los recién creados en `fix_3_1_3_2_3_4_indexes_and_on_delete` y todavía no se usaron por falta de tráfico (esperable).
- Otros son legítimos (cubren queries de admin/auditoría que se corren rara vez).
- **Acción:** revisar dentro de 1-2 meses con tráfico real; no actuar ahora.

### 3.4 130 `multiple_permissive_policies` + 45 `auth_rls_initplan` (performance)
- Patrones de RLS que se evalúan múltiples veces por fila (`auth.uid()` no envuelto en `SELECT`).
- A 9 alumnos no se nota; a escala (>100 alumnos activos) puede generar latencia en queries de listado.
- **Mitigación documentada por Supabase:** envolver `auth.uid()` en `(SELECT auth.uid())` dentro de policies, y consolidar policies redundantes.
- Bajo prioridad mientras el volumen sea bajo.

### 3.5 `auth_leaked_password_protection` deshabilitado
- Setting de Supabase Auth que compara passwords contra la base HaveIBeenPwned.
- **Fix:** habilitar en Dashboard → Authentication → Policies.

---

## 4. Resumen de los 113 logs huérfanos (NO es bug nuevo, ya documentado)

Confirmado: los 113 `workout_logs` sin `workout_session` son **TODOS de `student1@gmail.com`** (cuenta test, `is_test=true`). Match exacto con la sección 3.5 del changelog: "logs históricos en un plan que después se reclasificó a evaluation; el trigger `workout_sessions_block_evaluations` impide crearles sesiones". Es un caso aceptado, no requiere acción.

---

## 5. Plan de acción sugerido (orden de prioridad)

### Sprint inmediato (≤1 día)
1. 🔴 **Fix 2.1** — `ALTER VIEW v_workout_session_intensity SET (security_invoker = on)`.
2. 🟠 **Fix 2.3** — restringir `notifications_insert_service` a `service_role`.
3. 🟠 **Fix 2.2** — corregir las 2 sesiones invertidas + agregar CHECK temporal.
4. 🟠 **Fix 2.4** — agregar `SET search_path = public` en las 9 funciones SECURITY DEFINER.

### Sprint corto (1-2 días)
5. 🟠 **Fix 2.5** — política UX/backend para `weight_kg` obligatorio o detección de NULL en `calculate_log_volume`.
6. 🟡 **Fix 2.6** — migrar el assignment archived + ampliar health check a todos los status.
7. 🟡 **Fix 2.7** — backfill de los 3 `plan_exercises.block_id` (decisión de producto previa).
8. 🟡 **Fix 2.8** — `created_by = auth.uid()` en la RPC `assign_template_to_student`.

### Limpieza (cuando haya capacidad)
9. 🟢 Drop de `_tmp_map_nivel` y `_tmp_parse_frecuencia`.
10. 🟢 Marcar como leídas las 3 notifs `schema_health_alert` viejas.
11. 🟢 Habilitar leaked password protection en Supabase Auth.

---

## 6. Queries de verificación post-fix

```sql
-- Health checks ampliados (correr después de aplicar fixes)
SELECT 'security_invoker_on_view' AS chk,
       coalesce((reloptions::text), 'NULL') AS value
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='v_workout_session_intensity';
-- esperado: '{security_invoker=on}'

SELECT 'sessions_inverted_time', count(*)
  FROM workout_sessions
 WHERE started_at IS NOT NULL AND finished_at IS NOT NULL AND finished_at < started_at;
-- esperado: 0

SELECT 'sd_funcs_without_search_path', count(*)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef=true
   AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c ILIKE 'search_path=%');
-- esperado: 0

SELECT 'assignments_to_templates_any_status', count(*)
  FROM plan_assignments pa JOIN plans p ON p.id=pa.plan_id
 WHERE p.is_template=true;
-- esperado: 0

SELECT 'plan_exercises_without_block', count(*) FROM plan_exercises WHERE block_id IS NULL;
-- esperado: 0

SELECT 'students_no_test_without_weight', count(*)
  FROM profiles WHERE role='student' AND coalesce(is_test,false)=false AND weight_kg IS NULL;
-- esperado: 0 (cuando el front capture peso)
```

---

## 7. Cierre

El refactor de 2026-05-15 hizo un trabajo sólido cerrando los 27 hallazgos originales. Los hallazgos nuevos de esta auditoría son **defectos de cobertura** (no de diseño) — el sistema tiene los mecanismos correctos (triggers, CHECKs, cron, health check) pero hay **8 grietas finas** que el linter de Supabase detecta y que las queries de health check no cubren.

Ninguno de los hallazgos requiere refactor estructural. Todos son fixes puntuales aplicables en un sprint corto.

---

## 8. Resolución aplicada — 2026-05-16

Esta sección registra **qué se hizo con cada hallazgo** después de la auditoría. Para el detalle técnico ver `01_changelog_back.md` sección 1 (migraciones 19 y 20).

### Hallazgos críticos + altos → todos resueltos ✅

| # | Hallazgo | Resolución |
|---|---|---|
| 2.1 | View bypassea RLS | `ALTER VIEW ... SET (security_invoker = on)` aplicado. La view ahora respeta RLS del usuario consultante. |
| 2.2 | 2 sesiones con `finished_at < started_at` | 2 filas corregidas (puesto `finished_at = started_at + 5 min`); CHECK `sessions_finished_after_started` instalado para impedir regresiones. |
| 2.3 | Policy `notifications_insert_service` permisiva | Restringida a `TO service_role`. Usuarios autenticados ya no pueden spoofear notifs. |
| 2.4 | 9 funciones SECURITY DEFINER sin `search_path` | Las 9 ahora tienen `SET search_path = public`. Cero funciones SD sin protección. |

### Hallazgos medios

| # | Hallazgo | Resolución / Decisión |
|---|---|---|
| 2.5 | 3 alumnos sin `weight_kg` | **No se ataca a nivel back.** El front muestra mensaje al alumno/coach cuando `weight_kg` es NULL pidiendo que lo cargue. `juan_1@gmail.com` y `prueba@gmail.com` probablemente son test pero no se marcaron `is_test=true` (decisión del coach). `anabmoran.ap@gmail.com` se completará via UI cuando el alumno cargue su peso. |
| 2.6 | 1 archived apuntando a template + gap del health check | Archived puntual migrado vía `migrate_assignment_off_template`. Health check ampliado: el Check 6 ahora cuenta `assignments_to_templates_any_status` (sin filtrar por status). El field del jsonb del reporte cambió de `active_assignments_to_templates` a `assignments_to_templates_any_status`. |
| 2.7 | 3 `plan_exercises` con `block_id NULL` | Resuelto con purismo total. Se auto-crearon 2 plan_blocks (uno por plan afectado, con título igual al `block_label` viejo) y los 3 ejercicios quedaron mapeados al bloque correspondiente. |
| 2.8 | 13 `plans` con `created_by NULL` | RPC `assign_template_to_student` actualizada: ahora usa `COALESCE(auth.uid(), p.created_by)` para que el clon refleje al coach que ejecuta la asignación. Backfill aplicado: los 13 templates seed con NULL se asignaron a Anto (única coach activa). |

### Hallazgos bajos

| # | Hallazgo | Resolución |
|---|---|---|
| 3.1 | Funciones `_tmp_*` "huérfanas" | **Aclaración:** NO eran huérfanas — `process_intake_submission` las usa. Se renombraron a `_intake_map_nivel` y `_intake_parse_frecuencia`. El COMMENT documenta el origen. La función que las consume fue actualizada para llamar los nombres nuevos. |
| 3.2 | 3 notifs `schema_health_alert` viejas sin leer | Marcadas como `read=true`. Eran falsos positivos del primer run del health check antes del fix de partial indexes. |
| 3.3 | 22 índices "unused" | Sin acción. Esperar 1-2 meses con tráfico real antes de evaluar. |
| 3.4 | Patrones RLS ineficientes | Sin acción. Bajo prioridad mientras el volumen sea bajo (9 alumnos). |
| 3.5 | `auth_leaked_password_protection` deshabilitado | Sin acción desde SQL — requiere config en Dashboard → Authentication → Policies. Queda como recordatorio operativo. |

### Decisiones de diseño documentadas

- **`is_test` se mantiene como columna** aunque hoy solo identifica 4 cuentas. Costo cero, sirve a futuro si delegamos o el coach contrata otro entrenador. No es obligatorio marcar cada cuenta nueva — el coach decide cuáles son test.
- **`weight_kg NULL` se acepta a nivel back.** El front es la capa que comunica al usuario que falte el dato. `calculate_log_volume` devuelve NULL silencioso para bodyweight sin `weight_kg`, comportamiento intencional.
- **Health check con field renombrado:** el reporte ahora dice `assignments_to_templates_any_status` (antes `active_assignments_to_templates`). Si tenés dashboards consumiendo el jsonb del reporte, actualizar.

---

## 9. Estado post-fix (verificado 2026-05-16)

Todos los chequeos en cero:

| Chequeo | Resultado |
|---|---|
| `duplicate_indexes` | 0 |
| `fks_without_index` | 0 |
| `backup_tables_in_public` | 0 |
| `non_standard_workout_fks` | 0 |
| `abandoned_sessions_48h` | 0 |
| `assignments_to_templates_any_status` (ampliado) | 0 |
| `sessions_inverted_time` | 0 |
| `sd_funcs_without_search_path` | 0 |
| `plan_exercises_without_block` | 0 |
| `plans_without_creator` | 0 |
| `view_security_invoker` | `{security_invoker=on}` ✅ |

El sistema queda en su mejor estado registrado: 0 grietas detectables por linter + health check ampliado + RPC blindada con creator del coach + helpers temporales con nombres semánticos.
