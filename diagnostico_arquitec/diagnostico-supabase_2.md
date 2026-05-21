# Diagnóstico de consistencia — Supabase

**Proyecto:** `bvexjanqmfypmtgoapbt` (gymorg, plan Free, sa-east-1, NANO)
**Fecha del análisis:** 2026-05-17
**Alcance:** Completo — esquema, tipos, FKs, índices, RLS, triggers/funciones, integridad de datos, comparación con el modelo objetivo, drill-down sobre `francellone@gmail.com`, auditoría de alumnos sin coach.

---

## TL;DR

La base está **bien estructurada en lo conceptual** (modelo coach/alumno, planes con bloques, plantillas, evaluaciones, intake forms, RLS habilitado en todas las tablas). Pero el drill-down sobre datos reales reveló **bugs sistémicos del flujo de la app que la BD no impide y un agujero asimétrico en las RLS**.

**Top 5 hallazgos críticos (afectan integridad relacional, permisos y métricas):**

1. **Agujero asimétrico en RLS:** el coach puede crear y asignar planes a un alumno que no es suyo (o que no tiene coach), pero después no puede ver el progreso de ese alumno. 5 de 18 plan_assignments (28%) están en este estado; uno de los alumnos afectados (`student1@gmail.com`) tiene 114 workout_logs invisibles para su coach.
2. **9 de 18 plan_assignments (50%) apuntan a un plan-PLANTILLA** en vez de a una instancia. Editar el template afecta a varios alumnos en silencio.
3. **`workout_sessions` pre-creadas vacías como calendario** + **113 `workout_logs` sin sesión padre**: dos bugs simétricos del mismo flow.
4. **Evaluaciones nunca se cierran** — 8 `plan_assignments` de tipo evaluation siguen `status='active'` aunque sus `evaluation_results` ya fueron cargados.
5. **`workout_logs.actual_reps` / `actual_weights` son `text` pero almacenan JSON-arrays sucios** (`["12 ","12cl","3 (1 cada 15seg)"]`), conviviendo con una columna numeric vieja `actual_weight` redundante.

| # | Severidad | Cantidad |
|---|---|---:|
| 🔴 Críticos (datos, semántica, permisos, métricas) | | 8 |
| 🟠 Altos (performance, auditoría, scheduler) | | 6 |
| 🟡 Medios (deuda técnica) | | 8 |
| 🟢 Bajos (cosmético / nice-to-have) | | 5 |

---

## 1. Inventario general

- **23 tablas** + **1 vista** (`v_workout_session_intensity`) en schema `public`.
- **81 índices** totales · **26 funciones plpgsql** · **21 triggers** · **50 RLS policies**.
- **0 enums reales** (todos los enums implementados como `TEXT` con CHECK).
- **Extensiones activas:** `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`. **NO** está `pg_cron`.
- **Event trigger `ensure_rls`** activo → fuerza RLS automáticamente en tablas nuevas ✅.
- **3 coaches, 11 students** (creció desde 9 en pocos días → base activa). 4 students sin `coach_id`.

### Tablas y conteos (al 2026-05-17)

| Tabla | Filas | Tamaño | Notas |
|---|---:|---:|---|
| evaluation_results | 6 | 96 kB | |
| evaluation_test_responses | 8 | 80 kB | |
| evaluation_tests | 8 | 48 kB | |
| exercise_tag_assignments | 192 | 104 kB | |
| exercise_tags | 11 | 64 kB | |
| exercises | 275 | 184 kB | 167 sin usar (61%) |
| intake_form_assignments | 3 | 136 kB | |
| intake_form_submissions | 3 | 136 kB | |
| intake_form_templates | 3 | 176 kB | |
| notifications | 22 | 80 kB | 20 sin leer (91%) |
| **plan_assignments** | 18 | 112 kB | **9 a templates · 5 a alumnos sin coach** |
| plan_assignments_backup_20260508 | 12 | 16 kB | Backup en prod |
| plan_blocks | 25 | 64 kB | |
| plan_exercises | 127 | 120 kB | 3 con `block_id NULL` |
| plans | 17 | 56 kB | 11 templates + 6 instancias |
| profiles | 14 | 64 kB | 3 coaches + 11 students |
| push_subscriptions | 0 | 32 kB | Feature dormida |
| student_edit_history | 1 | 64 kB | Sin trigger que la alimente |
| student_profiles | 4 | 48 kB | Deprecada con datos divergentes |
| wellbeing_logs | 14 | 64 kB | |
| workout_block_logs | 8 | 96 kB | |
| **workout_logs** | 410 | 248 kB | 113 sin session · formatos sucios |
| **workout_sessions** | 39 | 144 kB | 19 sin finalizar · muchas fantasmas |

---

## 2. Hallazgos críticos 🔴 (ordenados por impacto)

### 2.1. **Agujero asimétrico en las RLS policies del coach** *(nuevo, top-1)*

Al auditar los 4 alumnos sin `coach_id` descubrí que **no son simples cuentas de test**: dos tienen actividad real, y los 5 `plan_assignments` de esos alumnos fueron creados por la coach Anto Almanza.

| Email | coach_id | assignments | logs | sessions | evaluations |
|---|---|---:|---:|---:|---:|
| alumno_prueba@gmail.com | NULL | 2 | 0 | 0 | 0 |
| **student1@gmail.com** | **NULL** | **3** | **114** | **1** | **3** |
| franalvarez319@gmail.com | NULL | 0 | 0 | 0 | 0 |
| juan_1234@gmail.com | NULL | 0 | 0 | 0 | 0 |

`student1@gmail.com` es el **segundo alumno más activo del sistema** (114 logs, atrás solo de `francellone@gmail.com` con 269). Sus planes fueron creados y asignados por Anto, pero su `coach_id` es NULL.

**Por qué pasa:** las RLS policies son asimétricas:

| Policy | Condición real | Resultado |
|---|---|---|
| `coach_manage_own_assignments` (INSERT/UPDATE/DELETE en `plan_assignments`) | `is_coach() AND plans.created_by = auth.uid()` | Permite asignar a cualquier alumno |
| `coach_view_own_students_logs` (SELECT en `workout_logs`) | `profiles.coach_id = auth.uid()` | Solo ve logs de sus alumnos |
| `coach_select_own_students` (SELECT en `profiles`) | `profiles.coach_id = auth.uid()` | Solo ve sus alumnos |

**Consecuencia operativa:** Anto creó planes y los asignó a `student1@gmail.com`. La policy laxa de `plan_assignments` (basta con ser creador del plan) lo permitió. Pero la policy estricta de `workout_logs` y `profiles` (exige `coach_id = auth.uid()`) **le impide ver al alumno y sus 114 logs**. El alumno carga logs vía su policy `student_manage_own_logs` y queda en un limbo: registrado, asignado, entrenando, pero invisible.

A nivel global la distribución de `plan_assignments` es:

| Estado | Cantidad |
|---|---:|
| `student.coach_id = plan.created_by` ✅ consistente | 13 |
| `student.coach_id IS NULL` y plan creado por coach 🚨 | 5 |
| mismatch coach-distinto | 0 |

El "mismatch coach-distinto" hoy es 0, pero el modelo lo permite (si hubiera más coaches, uno podría asignar planes a alumnos de otro). Es una bomba de tiempo de seguridad/visibilidad.

**Fix:**

```sql
-- 1) Cerrar el agujero en plan_assignments: exigir doble condición
drop policy if exists coach_manage_own_assignments on plan_assignments;
create policy coach_manage_own_assignments on plan_assignments for all
  using (
    is_coach()
    and exists (select 1 from plans p where p.id = plan_assignments.plan_id and p.created_by = auth.uid())
    and exists (select 1 from profiles s where s.id = plan_assignments.student_id and s.coach_id = auth.uid())
  );

-- 2) Aplicar el mismo patrón a las policies análogas (plans, plan_exercises, evaluation_*, etc.)

-- 3) Backfill: setear coach_id en alumnos sin coach cuyos planes son todos del mismo coach
update profiles s
set coach_id = sub.creator_id, updated_at = now()
from (
  select pa.student_id, max(p.created_by) as creator_id
  from plan_assignments pa join plans p on p.id = pa.plan_id
  where exists (select 1 from profiles s2 where s2.id = pa.student_id and s2.coach_id is null and s2.role='student')
  group by pa.student_id
  having count(distinct p.created_by) = 1
) sub
where s.id = sub.student_id and s.coach_id is null and s.role='student';

-- 4) Cuentas test sin actividad: marcar inactivas
update profiles set active = false
where id in (
  select s.id from profiles s
  where s.role='student' and s.coach_id is null
    and not exists (select 1 from plan_assignments where student_id = s.id)
    and not exists (select 1 from workout_logs where student_id = s.id)
);

-- 5) Constraint para nuevas altas (después de los 3 anteriores)
alter table profiles
  add constraint students_must_have_coach
  check (role <> 'student' or coach_id is not null or not active) not valid;
-- después: alter table profiles validate constraint students_must_have_coach;
```

### 2.2. **Templates asignados directamente como `plan_assignments`**

**9 de 18 `plan_assignments` (50%)** tienen `plan_id` apuntando a un plan con `is_template = true`. Afecta a 5 alumnos. `francellone@gmail.com` tiene la "EVALUACION INICIAL" template asignada directamente.

**Impacto:**
- Editar el template para usarlo con un alumno nuevo cambia el plan a todos los previos.
- Los `workout_logs/sessions` referencian al template — un eventual ABM del catálogo de plantillas rompe historiales.
- Rompe la separación template ↔ instance.

**Fix:**

```sql
-- 1) Clonar cada template asignado a una instancia y reapuntar
--    (script más largo: por cada plan_assignment con template, clonar plans + plan_blocks + plan_exercises
--    y actualizar plan_assignments.plan_id + workout_logs.plan_id + workout_sessions.plan_id)

-- 2) Trigger gatekeeper (activar SÓLO después del backfill)
create or replace function public.plan_assignments_forbid_template()
returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.plans where id = NEW.plan_id and is_template = true) then
    raise exception 'plan_assignments.plan_id apunta a un template (plan_id=%). Cloná el template a una instancia primero.', NEW.plan_id;
  end if;
  return NEW;
end$$;
create trigger trg_pa_forbid_template
  before insert or update on public.plan_assignments
  for each row execute function public.plan_assignments_forbid_template();
```

### 2.3. **Sessions pre-creadas vacías + logs huérfanos** *(consolidado)*

Dos síntomas del mismo flow roto:
- **Sessions fantasma:** Franco tiene 13 sessions abiertas, 11 con `started_at = NULL` y `finished_at = NULL`. 5 de ellas no tienen ni un log asociado.
- **Logs sin session:** a nivel global 113 de 410 (28%) workout_logs no tienen `workout_session` correspondiente.
- **Sessions sin cerrar:** 19 de 39 (49%) con `finished_at IS NULL`.

**Fix:**

```sql
-- A) Borrar sessions fantasma
delete from workout_sessions ws
where started_at is null and finished_at is null
  and not exists (select 1 from workout_logs wl
                  where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id and wl.logged_date=ws.logged_date);

-- B) Backfill de sessions para logs huérfanos
insert into workout_sessions (student_id, plan_id, logged_date, started_at, finished_at, created_at)
select distinct wl.student_id, wl.plan_id, wl.logged_date,
       min(wl.created_at), max(wl.updated_at), min(wl.created_at)
from workout_logs wl
where not exists (select 1 from workout_sessions ws
                  where ws.student_id=wl.student_id and ws.plan_id=wl.plan_id and ws.logged_date=wl.logged_date)
group by wl.student_id, wl.plan_id, wl.logged_date
on conflict (student_id, plan_id, logged_date) do nothing;

-- C) Cerrar sessions abiertas viejas (>24h)
update workout_sessions ws
set finished_at = coalesce(
  (select max(wl.updated_at) from workout_logs wl
   where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id and wl.logged_date=ws.logged_date),
  coalesce(ws.started_at, ws.created_at) + interval '90 minutes')
where finished_at is null and coalesce(started_at, created_at) < now() - interval '24 hours';

-- D) Constraint
alter table workout_sessions
  add constraint sessions_started_before_finished
  check (finished_at is null or started_at is not null) not valid;
```

### 2.4. **Las evaluaciones nunca se cierran**

Sobre los 18 `plan_assignments`, 8 son `plan_type='evaluation' AND status='active'`. Franco tiene 3 de ellas — dos ya tienen `evaluation_results` cargados hace 2-3 semanas pero siguen `active`.

**Fix:**

```sql
update plan_assignments pa
set status='completed', status_changed_at=now(),
    status_reason='auto-cierre por evaluation_results existentes (backfill 2026-05-17)'
where status='active' and plan_type='evaluation'
  and exists(select 1 from evaluation_results er
             where er.student_id=pa.student_id and er.plan_id=pa.plan_id);

create or replace function fn_close_eval_on_result()
returns trigger language plpgsql security definer as $$
begin
  update plan_assignments
    set status='completed', status_changed_at=now()
    where student_id=NEW.student_id and plan_id=NEW.plan_id
      and plan_type='evaluation' and status='active';
  return NEW;
end$$;
create trigger trg_close_eval_on_result
  after insert on evaluation_results
  for each row execute function fn_close_eval_on_result();
```

### 2.5. **`workout_logs`: tipos incorrectos + columna duplicada**

`actual_reps` y `actual_weights` son `text` que almacenan JSON-arrays, con datos sucios reales:
```
["10","12","12"]
["12 ","12","12"]       ← espacio
["12cl","12","12"]      ← sufijo libre
["3 (1 cada 15seg)"]    ← descripción dentro del valor
["","","",""]           ← strings vacíos en vez de NULL
```

Distribución global: 149 logs con `actual_weight` numeric (vieja) · 268 con `actual_weights` text · **121 con AMBAS** · 114 con ninguna.

**Fix (sin downtime):** agregar columnas `*_jsonb`, parser de backfill, normalizar (trim, sufijos `cl` → columna `unilateral boolean`, descripciones → `notes`), migrar front, drop columnas viejas en 1-2 sprints.

### 2.6. **Doble fuente de verdad del alumno con valores divergentes**

`student_profiles` está marcada como deprecada pero tiene 4 filas, y para esos alumnos los datos **difieren** de los de `profiles`:

| Campo | `profiles` (canónico) | `student_profiles` (legacy) |
|---|---|---|
| nivel | `intermediate` (cumple CHECK) | `Intermedio (1-3 años)` (texto del form) |
| frecuencia | `weekly_frequency = 3` (integer) | `frecuencia_semanal = "3 veces"` (text) |
| nombre/apellido | `name = "Franco Cellone"` | `nombre/apellido = NULL` |
| updated_at | actualizado | no se actualiza |

5 de 11 students viven solo en `profiles`, 4 en ambas con divergencia, 0 solo en legacy. Migración a fuente única quedó a mitad.

**Fix:** confirmar que el front no lee de `student_profiles`, migrar campos únicos a `profiles`, mover a schema `archive` (el snapshot histórico ya existe en `intake_form_submissions.profile_snapshot`).

### 2.7. **Contradicción semántica: `tiene_lesiones=true` + `patologias=['Ninguna']`**

Franco tiene `profiles.tiene_lesiones = true` y `profiles.patologias = ["Ninguna"]`. El campo `tiene_lesiones` parece cubrir más que lesiones; o renombrarlo (`tiene_observaciones_clinicas`) o agregar CHECK `NOT (tiene_lesiones AND patologias <@ ARRAY['Ninguna'])`.

### 2.8. **Tabla de backup en producción**

`plan_assignments_backup_20260508` (12 filas) vive en `public` sin PK ni FKs ni policies. Moverla:

```sql
create schema if not exists archive;
alter table public.plan_assignments_backup_20260508 set schema archive;
```

---

## 3. Hallazgos altos 🟠

### 3.1. 11 FKs sin índice

`evaluation_tests.exercise_id`, `exercises.created_by`, `intake_form_assignments.{template_id, plan_assignment_id}`, `plan_assignments.replaced_by_assignment_id`, `plan_exercises.exercise_id`, `student_edit_history.changed_by`, `student_profiles.submission_id`, **`workout_block_logs.plan_id`, `workout_logs.plan_id`, `workout_sessions.plan_id`** (los 3 últimos urgentes).

### 3.2. Índices duplicados

`workout_logs`: `idx_workout_logs_student` ≡ `idx_workout_logs_student_id`.
`workout_sessions`: `idx_workout_sessions_student` ≡ `idx_workout_sessions_student_id`.
`evaluation_results`: `idx_evaluation_results_student (student_id, eval_date DESC)` cubre a `idx_evaluation_results_student_id`.

### 3.3. `pg_cron` no instalado

Existen `fn_notify_expiring_plans`, `fn_notify_stagnation`, `fn_notify_weekly_summary`, `release_due_forms` pero **nadie las llama**. Las 22 notificaciones del sistema vienen sólo de triggers de tabla. **20 de 22 sin leer (91%)**. Schedulear con `cron.schedule(...)`.

### 3.4. Inconsistencia de `ON DELETE` hacia `plans`

`workout_logs.plan_id`, `workout_sessions.plan_id`, `workout_logs.plan_exercise_id` están en **NO ACTION** mientras todos los hermanos cascadean. Borrar un plan falla por FK violation. Uniformar a SET NULL para preservar historial.

### 3.5. `student_edit_history` sin trigger

La tabla existe completa, tiene 1 sola fila. Confirma que la auditoría depende del frontend (no confiable). Trigger `AFTER UPDATE ON profiles` que escriba diffs.

### 3.6. `borg_scale` de session: 0% de uso

Franco tiene 0/25 sessions con `borg_scale` registrado. Verificar a nivel global; si nadie lo usa, deprecar o exigir en flow de cierre.

---

## 4. Hallazgos medios 🟡

1. **Nullable en FKs core**: `plan_exercises.{plan_id, exercise_id, block_id}` y `workout_logs/sessions.{student_id, plan_id}` permitidos NULL. Marcar `NOT NULL` post backfill.
2. **3 `plan_exercises` con `block_id NULL`**: migración a bloques incompleta.
3. **`notifications` sin policy DELETE + 91% sin leer**: revisar UX y agregar policy si corresponde.
4. **`profiles` sin policy DELETE**: defendible, pero documentar.
5. **`CHECK profiles.level` en inglés** vs el resto del schema en español.
6. **`intake_form_templates.updated_at` sin trigger** `BEFORE UPDATE`.
7. **Convención de logs pre-`start_date`**: Franco tiene 70 logs con `logged_date < plan_assignments.start_date`. Documentar o validar.
8. **`intake_form_submissions.profile_snapshot` NULL** en la submission de Franco: el flow de cierre del intake no captura snapshot del perfil.

---

## 5. Hallazgos bajos 🟢

1. `exercises.created_by` con `ON DELETE NO ACTION` → SET NULL.
2. Sin enums reales (funciona con TEXT+CHECK).
3. 167 ejercicios sin uso (61% del catálogo): agregar `is_active`.
4. `v_workout_session_intensity` sin `COMMENT ON VIEW`.
5. `push_subscriptions` vacía.

---

## 6. Comparación contra el modelo objetivo

| Pieza del modelo objetivo | Estado |
|---|---|
| Users (coach/student) | ✅ `profiles` con `role` + `coach_id` |
| Plans con frecuencia/duración/descripción | ✅ `plans` con campos extendidos |
| Exercises (catálogo) | ✅ `exercises` (167 sin usar) |
| PlanExercises con day/order/activation | ✅ `plan_exercises` |
| WorkoutLogs | ✅ `workout_logs` + `workout_block_logs` + `workout_sessions` |
| Sistema de plantillas | ✅ Existe — ⚠️ pero el flow no lo respeta (sec. 2.2) |
| Bloques por día | ✅ `plan_blocks` con `section`, `block_type`, `order_index` |
| RPE | ✅ `perceived_difficulty (1-10)` en logs · ⚠️ `borg_scale` de session sin uso |
| Multi-plan activo | ✅ Unique parcial `one_active_training_per_student` |
| "Admin único" | ⚠️ 3 coaches activos · agujero en RLS multi-coach (sec. 2.1) |
| Notas privadas del coach | ✅ `profiles.coach_notes` + `evaluation_test_responses.coach_comment_private` |
| Wellbeing | ✅ `wellbeing_logs` (6 dimensiones) |
| Foto de perfil | ✅ `profiles.avatar_url` |
| Intake form | ✅ Familia `intake_form_*` |
| Evaluaciones | ✅ Familia `evaluation_*` · ⚠️ sin flujo de cierre |
| Notificaciones | ✅ `notifications` + `push_subscriptions` · ⚠️ scheduler ausente |

---

## 7. Plan de mejora priorizado

### Sprint 1 — Bugs sistémicos de flow y permisos

1. **Cerrar agujero RLS** (2.1): reescribir policy `coach_manage_own_assignments` + análogas; backfill de `coach_id` en alumnos con actividad; marcar test sin actividad; agregar CHECK.
2. **Limpiar `plan_assignments` que apuntan a templates** (2.2): clonar templates → instancias, reapuntar assignments + logs/sessions, activar trigger gatekeeper.
3. **Cerrar evaluaciones con results** (2.4) + activar trigger.
4. **Borrar workout_sessions fantasma + backfill huérfanos + constraint** (2.3).
5. **Cerrar sessions abiertas viejas** con job único.
6. **Auditar contradicción `tiene_lesiones`** (2.7).

### Sprint 2 — Tipos correctos y fuente única

7. **Decidir tipo para `actual_reps/weights`** (2.5): columnas `jsonb`, backfill, normalización.
8. **Consolidar `student_profiles`** (2.6).
9. **Mover `plan_assignments_backup_*` a archive** (2.8).
10. **Convención logs pre-`start_date`** (4.7).

### Sprint 3 — Performance, auditoría, scheduler

11. **Crear 11 índices faltantes** (3.1).
12. **Borrar 3 índices duplicados** (3.2).
13. **`pg_cron`** + cron jobs (3.3).
14. **Trigger de auditoría en `profiles`** → `student_edit_history` (3.5).
15. **Uniformar ON DELETE** hacia `plans` (3.4).
16. **Decidir destino de `borg_scale`** (3.6).

### Sprint 4 — Hardening

17. **`NOT NULL` en FKs core**.
18. **Backfill `plan_exercises.block_id`** (3 filas).
19. **Policy DELETE en `notifications`** + verificar marca `read=true` en UI.
20. **`CHECK profiles.level` en español**.
21. **Trigger `updated_at` en `intake_form_templates`**.

### Sprint 5 — Cosmético

22. `exercises.created_by` → SET NULL.
23. Migrar TEXT+CHECK a `CREATE TYPE … AS ENUM`.
24. Idioma único.
25. `is_active` en `exercises`.
26. `COMMENT ON VIEW v_workout_session_intensity`.

---

## 8. Script de "quick wins"

```sql
-- 0) Backup obligatorio (pg_dump desde tu máquina)

-- ========================================
-- BLOQUE A — Limpieza de datos (Sprint 1)
-- ========================================

-- A.1) Backfill coach_id en alumnos sin coach con planes de un único coach
update profiles s
set coach_id = sub.creator_id, updated_at = now()
from (
  select pa.student_id, max(p.created_by) as creator_id
  from plan_assignments pa join plans p on p.id = pa.plan_id
  where exists (select 1 from profiles s2 where s2.id = pa.student_id and s2.coach_id is null and s2.role='student')
  group by pa.student_id having count(distinct p.created_by) = 1
) sub
where s.id = sub.student_id and s.coach_id is null and s.role='student';

-- A.2) Marcar inactivas las cuentas test sin actividad
update profiles set active = false, updated_at = now()
where role='student' and coach_id is null
  and id not in (select student_id from plan_assignments)
  and id not in (select student_id from workout_logs);

-- A.3) Cerrar evaluaciones con results
update plan_assignments
set status='completed', status_changed_at=now(),
    status_reason='auto-cierre por evaluation_results existentes (backfill 2026-05-17)'
where status='active' and plan_type='evaluation'
  and exists(select 1 from evaluation_results er
             where er.student_id=plan_assignments.student_id and er.plan_id=plan_assignments.plan_id);

-- A.4) Borrar workout_sessions fantasma
delete from workout_sessions ws
where started_at is null and finished_at is null
  and not exists (select 1 from workout_logs wl
                  where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id and wl.logged_date=ws.logged_date);

-- A.5) Backfill sessions faltantes
insert into workout_sessions (student_id, plan_id, logged_date, started_at, finished_at, created_at)
select distinct wl.student_id, wl.plan_id, wl.logged_date,
       min(wl.created_at), max(wl.updated_at), min(wl.created_at)
from workout_logs wl
where not exists (select 1 from workout_sessions ws
                  where ws.student_id=wl.student_id and ws.plan_id=wl.plan_id and ws.logged_date=wl.logged_date)
group by wl.student_id, wl.plan_id, wl.logged_date
on conflict (student_id, plan_id, logged_date) do nothing;

-- A.6) Cerrar sessions abiertas viejas (>24h)
update workout_sessions ws
set finished_at = coalesce(
  (select max(wl.updated_at) from workout_logs wl
   where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id and wl.logged_date=ws.logged_date),
  coalesce(ws.started_at, ws.created_at) + interval '90 minutes')
where finished_at is null and coalesce(started_at, created_at) < now() - interval '24 hours';

-- A.7) Mover backup a archive
create schema if not exists archive;
alter table public.plan_assignments_backup_20260508 set schema archive;

-- ========================================
-- BLOQUE B — Policies y triggers (Sprint 1)
-- ========================================

-- B.1) Reescribir policy coach_manage_own_assignments para exigir doble condición
drop policy if exists coach_manage_own_assignments on plan_assignments;
create policy coach_manage_own_assignments on plan_assignments for all
  using (
    is_coach()
    and exists (select 1 from plans p where p.id = plan_assignments.plan_id and p.created_by = auth.uid())
    and exists (select 1 from profiles s where s.id = plan_assignments.student_id and s.coach_id = auth.uid())
  );
-- ⚠️ Hacer lo mismo con coach_manage_own_plan_exercises, coach_manage_own_evaluation_*, etc.

-- B.2) CHECK: students activos deben tener coach
alter table profiles
  add constraint students_must_have_coach
  check (role <> 'student' or coach_id is not null or not active) not valid;
-- después: alter table profiles validate constraint students_must_have_coach;

-- B.3) Constraint: session no puede terminar sin haber empezado
alter table workout_sessions
  add constraint sessions_started_before_finished
  check (finished_at is null or started_at is not null) not valid;
-- después: validate constraint

-- B.4) Trigger: cerrar evaluación al cargar resultado
create or replace function fn_close_eval_on_result()
returns trigger language plpgsql security definer as $$
begin
  update plan_assignments
    set status='completed', status_changed_at=now()
    where student_id=NEW.student_id and plan_id=NEW.plan_id
      and plan_type='evaluation' and status='active';
  return NEW;
end$$;
create trigger trg_close_eval_on_result
  after insert on evaluation_results
  for each row execute function fn_close_eval_on_result();

-- B.5) Trigger: prohibir asignar templates (ACTIVAR DESPUÉS de migrar los 9 existentes)
create or replace function plan_assignments_forbid_template()
returns trigger language plpgsql as $$
begin
  if exists(select 1 from plans where id = NEW.plan_id and is_template = true) then
    raise exception 'plan_assignments.plan_id apunta a un template (plan_id=%). Cloná el template a una instancia primero.', NEW.plan_id;
  end if;
  return NEW;
end$$;
-- create trigger trg_pa_forbid_template
--   before insert or update on plan_assignments
--   for each row execute function plan_assignments_forbid_template();

-- ========================================
-- BLOQUE C — Performance (Sprint 3)
-- ========================================

create index concurrently if not exists idx_workout_logs_plan_id     on workout_logs (plan_id);
create index concurrently if not exists idx_workout_sessions_plan_id on workout_sessions (plan_id);
create index concurrently if not exists idx_workout_block_logs_plan  on workout_block_logs (plan_id);
create index concurrently if not exists idx_plan_exercises_exercise  on plan_exercises (exercise_id);
create index concurrently if not exists idx_evaluation_tests_exer    on evaluation_tests (exercise_id);
create index concurrently if not exists idx_exercises_created_by     on exercises (created_by);
create index concurrently if not exists idx_ifa_template_id          on intake_form_assignments (template_id);
create index concurrently if not exists idx_ifa_plan_assignment_id   on intake_form_assignments (plan_assignment_id);
create index concurrently if not exists idx_pa_replaced_by           on plan_assignments (replaced_by_assignment_id);
create index concurrently if not exists idx_seh_changed_by           on student_edit_history (changed_by);
create index concurrently if not exists idx_sp_submission_id         on student_profiles (submission_id);

drop index if exists idx_workout_logs_student;
drop index if exists idx_workout_sessions_student;
drop index if exists idx_evaluation_results_student_id;

alter table workout_logs drop constraint workout_logs_plan_id_fkey,
  add constraint workout_logs_plan_id_fkey foreign key (plan_id) references plans(id) on delete set null;
alter table workout_logs drop constraint workout_logs_plan_exercise_id_fkey,
  add constraint workout_logs_plan_exercise_id_fkey foreign key (plan_exercise_id) references plan_exercises(id) on delete set null;
alter table workout_sessions drop constraint workout_sessions_plan_id_fkey,
  add constraint workout_sessions_plan_id_fkey foreign key (plan_id) references plans(id) on delete set null;
```

---

## 9. Health checks (post-fix, semanales)

```sql
-- a) plan_assignments apuntando a templates (debe ser 0)
select count(*) from plan_assignments pa join plans p on p.id=pa.plan_id where p.is_template;

-- b) Alumnos activos sin coach (debe ser 0)
select count(*) from profiles where role='student' and active and coach_id is null;

-- c) plan_assignments donde coach del alumno ≠ creador del plan (debe ser 0)
select count(*) from plan_assignments pa
join profiles s on s.id=pa.student_id
join plans p on p.id=pa.plan_id
where s.coach_id is distinct from p.created_by;

-- d) Evaluaciones activas con resultados (debe ser 0)
select count(*) from plan_assignments pa
where status='active' and plan_type='evaluation'
  and exists(select 1 from evaluation_results er where er.student_id=pa.student_id and er.plan_id=pa.plan_id);

-- e) workout_logs sin session (debe tender a 0)
select count(*) from workout_logs wl
where not exists(select 1 from workout_sessions ws
                 where ws.student_id=wl.student_id and ws.plan_id=wl.plan_id and ws.logged_date=wl.logged_date);

-- f) Sessions fantasma
select count(*) from workout_sessions ws
where started_at is null and finished_at is null
  and not exists(select 1 from workout_logs wl
                 where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id and wl.logged_date=ws.logged_date);

-- g) Sessions abiertas viejas (>24h)
select count(*) from workout_sessions
where finished_at is null and coalesce(started_at, created_at) < now() - interval '24 hours';

-- h) % notificaciones leídas últimos 7d
select round(100.0 * count(*) filter (where read) / nullif(count(*),0), 1)
from notifications where created_at > now() - interval '7 days';
```

---

## 10. Apéndice: drill-down `francellone@gmail.com`

Profile usado: `d7a1ceb5-80fa-4cb9-8477-126bb71f8081`, Franco Cellone, coach Anto Almanza. Generó 269 de 410 `workout_logs` del sistema (65%) — muestra representativa.

**Lo bueno:** 2 `evaluation_results` con datos · 0 logs huérfanos de session para él · 7 wellbeing_logs en 44 días · cadena de reemplazo de planes funciona · 264/269 logs con `actual_reps` (98%).

**Lo malo (escaló a sección 2):**

| Hallazgo | Sección | Generalizable | Impacto |
|---|---|---|---|
| 1 assignment activo a un template | 2.2 | Sí (9/18) | Edición contamina historiales |
| 11 sessions fantasma + 2 abiertas + 5 sin logs | 2.3 | Sí | Métricas rotas |
| 2 evaluations completed pero `status='active'` | 2.4 | Sí (8 globales) | Reportes fantasma |
| `actual_reps` con `["12cl","12 ","3 (1 cada 15seg)"]` | 2.5 | Sí | Métricas frágiles |
| `nivel=intermediate` vs `Intermedio (1-3 años)` | 2.6 | Sí (4 alumnos) | Lecturas inconsistentes |
| `tiene_lesiones=true + patologias=["Ninguna"]` | 2.7 | Posible | Contradicción semántica |

**Otros detalles menores:** 0/25 sessions con `borg_scale` · 70/269 logs pre-`start_date` · `intake_form_submissions.profile_snapshot = NULL` · `profile.height_cm = NULL` mientras `weight_kg = 74`.
