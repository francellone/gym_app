# Diagnóstico de consistencia — Supabase

**Proyecto:** `bvexjanqmfypmtgoapbt` (gymorg, plan Free, sa-east-1, NANO)
**Fecha del análisis:** 2026-05-14
**Alcance:** Completo — esquema, tipos, FKs, índices, RLS, triggers/funciones, integridad de datos, comparación con el modelo objetivo, drill-down sobre un alumno real (`francellone@gmail.com`).

---

## TL;DR

La base está **bien estructurada en lo conceptual** (modelo coach/alumno, planes con bloques, plantillas, evaluaciones, intake forms, RLS habilitado en todas las tablas con policies SECURITY DEFINER + STABLE bien escritas). Sin embargo, el drill-down sobre datos reales reveló **bugs sistémicos del flujo de la app que la BD no impide** — más importantes que la deuda de schema. Reordené las prioridades para reflejarlo.

**Top 4 hallazgos críticos (afectan integridad relacional y métricas):**

1. **9 de 16 `plan_assignments` (56%) apuntan a un plan-PLANTILLA** en vez de a una instancia. Editar un template afecta a 5 alumnos en silencio.
2. **`workout_sessions` pre-creadas vacías como calendario** — 11 de 25 sesiones de un solo alumno nunca arrancaron, y existen 113 `workout_logs` sin sesión padre en el sistema. Dos bugs simétricos del mismo flow.
3. **Evaluaciones nunca se cierran** — 8 `plan_assignments` de tipo evaluation siguen `status='active'` aunque sus `evaluation_results` ya fueron cargados.
4. **`workout_logs.actual_reps` / `actual_weights` son `text` pero almacenan JSON-arrays sucios** (`["12 ","12cl","3 (1 cada 15seg)"]`), además de coexistir con una columna numeric vieja `actual_weight` redundante.

| # | Severidad | Cantidad |
|---|---|---:|
| 🔴 Críticos (datos, semántica de modelo, métricas) | | 7 |
| 🟠 Altos (performance, auditoría, scheduler) | | 7 |
| 🟡 Medios (deuda técnica) | | 8 |
| 🟢 Bajos (cosmético / nice-to-have) | | 5 |

---

## 1. Inventario general

- **23 tablas** + **1 vista** (`v_workout_session_intensity`) en schema `public`.
- **81 índices** totales · **26 funciones plpgsql** · **21 triggers** · **50 RLS policies**.
- **0 enums reales** (los enums están implementados como `TEXT` con CHECK).
- **Extensiones activas:** `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`. **NO** está `pg_cron` ni `pg_net` (aunque los event triggers están listos para cuando se activen).
- **Event trigger `ensure_rls`** activo → fuerza RLS automáticamente en tablas nuevas. ✅ Excelente práctica.
- **3 coaches, 9 students.** 4 students sin `coach_id` (probables cuentas de prueba).

### Tablas y conteos (al 2026-05-14)

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
| plan_assignments | 16 | 112 kB | **9 apuntan a templates** |
| plan_assignments_backup_20260508 | 12 | 16 kB | Backup en prod |
| plan_blocks | 25 | 64 kB | |
| plan_exercises | 127 | 120 kB | 3 con `block_id NULL` |
| plans | 17 | 56 kB | 11 templates + 6 instancias |
| profiles | 12 | 64 kB | 3 coaches + 9 students |
| push_subscriptions | 0 | 32 kB | Feature dormida |
| student_edit_history | 1 | 64 kB | Sin trigger que lo alimente |
| student_profiles | 4 | 48 kB | Deprecada pero con datos divergentes |
| wellbeing_logs | 14 | 64 kB | |
| workout_block_logs | 8 | 96 kB | |
| workout_logs | 410 | 248 kB | **113 sin session, formatos sucios** |
| workout_sessions | 39 | 144 kB | **19 sin finalizar, muchas fantasmas** |

---

## 2. Hallazgos críticos 🔴 (ordenados por impacto)

### 2.1. **Templates asignados directamente como `plan_assignments`** *(nuevo, top-1)*

**9 de 16 `plan_assignments` (56%)** tienen `plan_id` apuntando a un plan con `is_template = true`. Afecta a **5 de 9 alumnos** (incluido `francellone@gmail.com` con la "EVALUACION INICIAL" template asignada).

**Impacto:**
- Si el coach edita un template para usarlo con un alumno nuevo, los 5 alumnos previos ven su plan cambiar en silencio.
- Los `workout_logs` y `workout_sessions` quedan referenciando al template — un eventual ABM de plantillas rompe historiales.
- Rompe la separación conceptual template ↔ instance del modelo.

**Probable causa:** el flujo de UI "asignar plan" pasa el `plan_id` del template directamente en vez de clonarlo a una instancia (`is_template=false, parent_plan_id=<template_id>`) y asignar la instancia.

**Fix:**
1. **Datos existentes**: por cada `plan_assignment` cuyo plan sea template, clonar el plan (con sus `plan_blocks` y `plan_exercises`) a una nueva instancia y reapuntar el assignment + los logs/sessions del alumno.
2. **Prevenir nuevos**: trigger gatekeeper.

```sql
create or replace function public.plan_assignments_forbid_template()
returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.plans where id = NEW.plan_id and is_template = true) then
    raise exception 'plan_assignments.plan_id apunta a un template (plan_id=%). Cloná el template a una instancia primero.', NEW.plan_id;
  end if;
  return NEW;
end$$;

-- ⚠️ Activarlo SÓLO después de limpiar los 9 existentes:
create trigger trg_pa_forbid_template
  before insert or update on public.plan_assignments
  for each row execute function public.plan_assignments_forbid_template();
```

### 2.2. **`workout_sessions` pre-creadas como calendario + `workout_logs` sin sesión** *(consolidado)*

Dos síntomas del **mismo flow roto**:

- **Sessions fantasma (pre-creadas):** `francellone@gmail.com` tiene 13 sessions abiertas, 11 con `started_at = NULL` y `finished_at = NULL`. Son fechas pre-cargadas (calendario futuro) que nunca se usaron. 5 de ellas no tienen ni un solo log asociado.
- **Logs sin session:** a nivel global, **113 de 410 `workout_logs` (28%)** no tienen su `workout_session` correspondiente (matching por `student_id + plan_id + logged_date`). Son logs viejos previos a la introducción de `workout_sessions` que nunca fueron migrados.
- **Sessions sin cerrar:** **19 de 39 sessions (49%)** quedan con `finished_at IS NULL`.

**Patrón:** la app pre-crea sessions a futuro al asignar un plan, y no tiene un flujo de "iniciar / finalizar" sesión bien definido.

**Fix:**
1. **Borrar sessions fantasma** (sin started_at, sin finished_at y sin logs).
2. **Backfill** de sessions faltantes para los 113 logs huérfanos (1 por combinación distinta de student/plan/date).
3. **No pre-crear**: cambiar el flow para crear la session al primer `workout_log` con `ON CONFLICT (student_id, plan_id, logged_date) DO NOTHING`.
4. **Constraint**: `CHECK (finished_at IS NULL OR started_at IS NOT NULL)` para evitar el caso lógicamente imposible.
5. **Cron**: cerrar sessions abiertas con `started_at < now() - 24h` (`finished_at = greatest(updated_at de logs)`).

```sql
delete from public.workout_sessions ws
where started_at is null and finished_at is null
  and not exists (select 1 from public.workout_logs wl
                  where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id and wl.logged_date=ws.logged_date);

insert into public.workout_sessions (student_id, plan_id, logged_date, started_at, finished_at, created_at)
select distinct wl.student_id, wl.plan_id, wl.logged_date,
       min(wl.created_at), max(wl.updated_at), min(wl.created_at)
from public.workout_logs wl
where not exists (select 1 from public.workout_sessions ws
                  where ws.student_id=wl.student_id and ws.plan_id=wl.plan_id and ws.logged_date=wl.logged_date)
group by wl.student_id, wl.plan_id, wl.logged_date
on conflict (student_id, plan_id, logged_date) do nothing;

alter table public.workout_sessions
  add constraint sessions_started_before_finished
  check (finished_at is null or started_at is not null) not valid;
-- después de revisar: alter table ... validate constraint sessions_started_before_finished;
```

### 2.3. **Las evaluaciones nunca se cierran** *(nuevo)*

Sobre 16 `plan_assignments`, **8 son `plan_type='evaluation' AND status='active'`**. Franco tiene 3 de ellas: dos ya tienen `evaluation_results` cargados (del 27/04 y 29/04) pero siguen activas dos semanas después; la tercera apunta a un template (bug 2.1).

No hay flujo (ni manual ni automático) que marque una evaluación como `completed` al cargar resultados. La tabla se va a llenar de evals "activas-pero-hechas".

**Fix:**

```sql
-- Backfill: cerrar evals con results
update public.plan_assignments pa
set status='completed',
    status_changed_at=now(),
    status_reason='auto-cierre por evaluation_results existentes (backfill 2026-05-14)'
where status='active' and plan_type='evaluation'
  and exists(select 1 from public.evaluation_results er
             where er.student_id=pa.student_id and er.plan_id=pa.plan_id);

-- Prevención: trigger
create or replace function public.fn_close_eval_on_result()
returns trigger language plpgsql security definer as $$
begin
  update public.plan_assignments
    set status='completed', status_changed_at=now()
    where student_id=NEW.student_id and plan_id=NEW.plan_id
      and plan_type='evaluation' and status='active';
  return NEW;
end$$;
create trigger trg_close_eval_on_result
  after insert on public.evaluation_results
  for each row execute function public.fn_close_eval_on_result();
```

### 2.4. **`workout_logs`: 3 columnas para el mismo dato + tipo `text` con JSON sucio** *(consolidado)*

La tabla guarda series/reps/pesos en columnas de tipo `text` que **en realidad almacenan JSON-arrays**, y además mantiene una columna numeric vieja paralela. Ejemplos reales de `francellone@gmail.com`:

```
actual_reps    : ["10","12","12"]
actual_reps    : ["12 ","12","12"]       ← trailing space
actual_reps    : ["12cl","12","12"]      ← sufijo libre "cl"
actual_reps    : ["3 (1 cada 15seg)"]    ← descripción dentro del valor
actual_weights : ["","","",""]           ← strings vacíos en vez de NULL
actual_weight  (numeric, columna vieja) : 80.0
```

A nivel global, los 410 logs se distribuyen así:
- 149 con `actual_weight` (numeric) seteado
- 268 con `actual_weights` (text/JSON) seteado
- **121 con ambas seteadas** (los mismos datos en dos lugares)
- 114 con ninguna (probablemente ejercicios time-based)

**Problemas:**
1. **Tipo equivocado** en `actual_reps` y `actual_weights` (deberían ser `jsonb` o `text[]/numeric[]`).
2. **Datos sucios**: espacios, sufijos `cl` (¿cada lado?), descripciones libres, vacíos.
3. **`actual_weight` numeric es legacy** pero todavía tiene escrituras nuevas (121 logs con ambas) → la app no decide cuál usar.
4. Imposible calcular volumen total con confianza.

**Fix (sin downtime):**
1. Crear `actual_reps_jsonb jsonb`, `actual_weights_jsonb jsonb`.
2. Backfill con parser defensivo (registrar las filas que fallan).
3. Normalizar: trim de espacios, mover sufijos `cl` a una columna nueva `unilateral boolean`, mover descripciones libres a `notes`.
4. Migrar el front a leer/escribir las columnas nuevas.
5. Después de 1-2 sprints estables: `DROP COLUMN actual_weight, actual_reps, actual_weights;`.
6. Borrar el índice parcial duplicado obsoleto (`idx_workout_logs_student_date_weight`).

### 2.5. **Doble fuente de verdad del alumno con valores divergentes** *(consolidado)*

`student_profiles` está marcada en su `COMMENT` como deprecada ("no leer desde el frontend"), pero tiene **4 filas activas** y para esos 4 alumnos los datos **difieren** de los de `profiles`:

| Campo | `profiles` (canónico) | `student_profiles` (legacy) |
|---|---|---|
| nivel | `intermediate` (inglés, cumple CHECK) | `Intermedio (1-3 años)` (texto del form) |
| frecuencia | `weekly_frequency = 3` (integer) | `frecuencia_semanal = "3 veces"` (text) |
| nombre/apellido | `name = "Franco Cellone"` | `nombre/apellido = NULL` (nunca se completaron) |
| updated_at | actualizado | no actualizado tras 2026-04-13 |

Más: 5 de 9 alumnos viven sólo en `profiles`, 4 en ambas (con divergencia), 0 sólo en `student_profiles`. La migración a fuente única quedó a mitad de camino.

**Fix:**
1. Confirmar que **ningún path del front** lee de `student_profiles`.
2. Si hay campos únicos que aún no están en `profiles`, copiarlos.
3. Renombrar a `intake_form_legacy_snapshots` y mover al schema `archive` (el snapshot histórico ya está en `intake_form_submissions.profile_snapshot` como jsonb).

### 2.6. **Contradicción semántica: `tiene_lesiones=true` + `patologias=['Ninguna']`** *(nuevo)*

Franco tiene `profiles.tiene_lesiones = true` y a la vez `profiles.patologias = ["Ninguna"]`. Eso es contradictorio: el flag dice "sí tengo algo" y la lista dice "nada".

Probable causa: el nombre del campo es engañoso (cubre más que lesiones, p. ej. "tiene algo relevante a reportar") y `patologias` no enumera todo lo que `tiene_lesiones` cubre.

**Fix:**
- Renombrar a algo más amplio (`tiene_observaciones_clinicas`) **o**
- Agregar CHECK: `NOT (tiene_lesiones = true AND patologias <@ ARRAY['Ninguna'])`.
- Auditar cuántos alumnos tienen esta contradicción (a nivel global solo 3 alumnos tienen estos campos seteados — probablemente todos).

### 2.7. **Tabla de backup en producción** *(originalmente top-1, ahora menor relativamente)*

`plan_assignments_backup_20260508` (12 filas, 16 kB) vive en `public`, **sin PK ni FKs ni policies** (tiene RLS pero ninguna policy → cliente autenticado ve 0 filas, OK, pero la tabla expone su existencia via GraphQL/PostgREST autocomplete).

**Fix:**
```sql
create schema if not exists archive;
alter table public.plan_assignments_backup_20260508 set schema archive;
```

---

## 3. Hallazgos altos 🟠

### 3.1. 11 FKs sin índice (seq scan en deletes y joins)

| Tabla | Columna |
|---|---|
| evaluation_tests | exercise_id |
| exercises | created_by |
| intake_form_assignments | plan_assignment_id |
| intake_form_assignments | template_id |
| plan_assignments | replaced_by_assignment_id |
| plan_exercises | exercise_id |
| student_edit_history | changed_by |
| student_profiles | submission_id |
| workout_block_logs | plan_id |
| workout_logs | plan_id |
| workout_sessions | plan_id |

Los tres últimos son los más urgentes (más volumen, más queries).

### 3.2. Índices duplicados

| Tabla | Duplicados | Acción |
|---|---|---|
| workout_logs | `idx_workout_logs_student` ≡ `idx_workout_logs_student_id` (ambos sobre `student_id`) | Borrar el más viejo |
| workout_sessions | `idx_workout_sessions_student` ≡ `idx_workout_sessions_student_id` | Borrar uno |
| evaluation_results | `idx_evaluation_results_student (student_id, eval_date DESC)` cubre a `idx_evaluation_results_student_id` | Borrar `_student_id` |

### 3.3. `pg_cron` no instalado → notificaciones / follow-ups muertos

Existen las funciones `fn_notify_expiring_plans()`, `fn_notify_stagnation()`, `fn_notify_weekly_summary()`, `release_due_forms()` pero **nadie las llama** (no hay `pg_cron`, no hay Edge Function scheduler conocida).

Consecuencia visible: solo se generan las 22 notificaciones que vienen de los triggers `INSERT/UPDATE` en `plan_assignments` y `workout_logs`. **20 de 22 sin leer (91%).**

```sql
-- Habilitar pg_cron desde el dashboard de Supabase, luego:
select cron.schedule('release_due_forms_daily',     '0 6 * * *', $$select release_due_forms()$$);
select cron.schedule('notify_expiring_plans_daily', '0 7 * * *', $$select fn_notify_expiring_plans()$$);
select cron.schedule('notify_stagnation_weekly',    '0 8 * * 1', $$select fn_notify_stagnation()$$);
select cron.schedule('notify_weekly_summary',       '0 9 * * 1', $$select fn_notify_weekly_summary()$$);
```

### 3.4. Inconsistencia de `ON DELETE` hacia `plans`

| Tabla | ON DELETE | Esperado |
|---|---|---|
| evaluation_results | SET NULL | OK |
| evaluation_tests | CASCADE | OK |
| plan_assignments | CASCADE | OK |
| plan_blocks | CASCADE | OK |
| plan_exercises | CASCADE | OK |
| workout_block_logs | CASCADE | OK |
| **workout_logs** | **NO ACTION** | SET NULL |
| **workout_sessions** | **NO ACTION** | SET NULL |
| **workout_logs.plan_exercise_id** | **NO ACTION** | SET NULL |

Borrar un plan falla por FK violation en `workout_logs/sessions` aunque los hijos directos cascadean. Uniformar a SET NULL preserva el historial del alumno.

### 3.5. `student_edit_history` sin trigger

La tabla existe completa (`student_id`, `changed_by`, `field_name`, `old_value`, `new_value`, `changed_at`) con FKs y RLS, pero tiene **1 sola fila**. Confirma que la auditoría depende del frontend (no confiable).

**Fix:** trigger `AFTER UPDATE ON profiles` que escriba diffs por columna en `student_edit_history`.

### 3.6. 4 students sin `coach_id` *(re-contextualizado)*

Mirando los datos: dos de los "Franco" del sistema (`alumno_prueba@gmail.com` y `student1@gmail.com`) son cuentas de prueba sin coach. El verdadero `francellone@gmail.com` sí tiene coach. Probablemente las 4 cuentas sin coach son todas test.

**Fix:**
- Si son cuentas de prueba: marcarlas con `active=false` o moverlas a un schema `test_data`.
- Para futuros altas reales: CHECK `(role='coach' OR coach_id IS NOT NULL)` en alta de student.

### 3.7. `borg_scale` de session: 0% de uso *(nuevo)*

Franco tiene 25 workout_sessions y **0 con `borg_scale` registrado**. Si el comportamiento es similar para los otros alumnos, la feature de RPE de sesión completa está muerta. Decidir: deprecar la columna o exigirla en el flow de cierre de sesión.

---

## 4. Hallazgos medios 🟡

### 4.1. Nullable en FKs core

`plan_exercises.plan_id/exercise_id/block_id` y `workout_logs/sessions.student_id/plan_id` son NULLABLE aunque conceptualmente no deberían serlo. Hoy no hay nulls reales — marcar `NOT NULL` después de backfill.

### 4.2. 3 `plan_exercises` con `block_id = NULL`

Migración incompleta al modelo de bloques. Asignar a un bloque "Sin bloque (legacy)" o regenerar.

### 4.3. `notifications`: 91% sin leer + sin policy DELETE

No hay policy `DELETE` (el usuario no puede borrar sus notifs). Más grave: 20/22 sin leer sugiere que el front no marca `read=true` o nadie entra al panel.

### 4.4. `profiles` sin policy DELETE

Defendible (preserva integridad), pero conviene exponer un endpoint admin con `service_role`.

### 4.5. `CHECK profiles.level` en inglés vs el resto en español

`('beginner','intermediate','advanced')` mientras el resto del schema usa `objetivo_principal`, `nivel_experiencia`, `frecuencia_semanal`. Elegir un idioma único.

### 4.6. `intake_form_templates.updated_at` sin trigger

Columna existe, trigger `BEFORE UPDATE` no. Quedará desactualizada.

### 4.7. Convención de logs pre-`start_date` *(nuevo)*

Franco tiene 70 logs (26%) con `logged_date < plan_assignments.start_date`. Es válido vía `logged_late=true`, pero conviene documentar la convención: ¿el coach puede setear `start_date` retroactivo? ¿O se aceptan logs anteriores con la regla de oro "el plan ya estaba vigente"?

### 4.8. Falta `ON UPDATE` explícito en todas las FKs

Default es `NO ACTION` (igual al actual), pero es buena práctica declararlo. No urgente.

---

## 5. Hallazgos bajos 🟢

1. **`exercises.created_by` con `ON DELETE NO ACTION`** → si se borra un coach, falla. Cambiar a SET NULL.
2. **Sin enums reales** — funciona con TEXT+CHECK, podría migrarse a enums nativos.
3. **167 ejercicios sin uso** (61% del catálogo) — agregar `is_active boolean` y archivar.
4. **`v_workout_session_intensity` sin `COMMENT ON VIEW`** — documentar.
5. **`push_subscriptions` vacía** — feature aún no rolled out.

---

## 6. Comparación contra el modelo objetivo

| Pieza del modelo objetivo | Estado |
|---|---|
| Users (coach/student) | ✅ `profiles` con `role` + `coach_id` |
| Plans con frecuencia, duración, descripción | ✅ `plans` con campos extendidos (`plan_type`, `is_template`, `parent_plan_id`, `has_activation`, `eval_*`) |
| Exercises (catálogo) | ✅ `exercises` |
| PlanExercises con day/order/activation | ✅ `plan_exercises` (con `section`, `block_label`, `order_index`, `exercise_mode`) |
| WorkoutLogs | ✅ `workout_logs` + `workout_block_logs` + `workout_sessions` (más rico que el modelo) |
| Sistema de plantillas | ✅ Existe (`is_template`, `parent_plan_id`) — ⚠️ **pero el flow no lo respeta** (ver 2.1) |
| Bloques por día (Activación, A1, B1, Core) | ✅ `plan_blocks` con `section`, `block_type` (strength/aerobic/circuit), `order_index` |
| RPE | ✅ `perceived_difficulty (1-10) + label` en logs · ⚠️ `borg_scale` de session sin uso (3.7) |
| Multi-plan activo | ✅ Unique parcial `one_active_training_per_student` permite N evaluations + 1 training |
| "Admin único" | ⚠️ El modelo permite 3 coaches. Decidir si se acepta o se agrega un rol `admin` separado. |
| Notas privadas del coach | ✅ `profiles.coach_notes` + `evaluation_test_responses.coach_comment_private` |
| Wellbeing (peso, sueño) | ✅ `wellbeing_logs` (más rico: 6 dimensiones) |
| Foto de perfil | ✅ `profiles.avatar_url` |
| Intake form | ✅ Familia `intake_form_*` (valor agregado, no estaba en el modelo) |
| Evaluaciones | ✅ Familia `evaluation_*` (valor agregado) · ⚠️ sin flujo de cierre (2.3) |
| Notificaciones | ✅ `notifications` + `push_subscriptions` · ⚠️ scheduler ausente (3.3) |

**Conclusión:** el modelo real **excede** al modelo objetivo en funcionalidad. La fricción no está en falta de cobertura sino en deuda técnica + flows del frontend que no respetan el modelo de la BD.

---

## 7. Plan de mejora priorizado (reordenado)

### Sprint 1 — **Bugs sistémicos de flow** *(arreglar antes de seguir construyendo)*

1. **Limpiar `plan_assignments` que apuntan a templates** (2.1). Para cada uno: clonar el template a una instancia, mover `plan_assignments` + `workout_logs/sessions` del alumno al clon. Activar trigger gatekeeper.
2. **Cerrar evaluaciones con results existentes** (2.3) + activar trigger `fn_close_eval_on_result`.
3. **Borrar `workout_sessions` fantasma** + backfill de sessions faltantes para los 113 logs huérfanos (2.2). Activar constraint `started_at` antes de `finished_at`.
4. **Cerrar sessions abiertas viejas** (`started_at < now() - 24h`) con un job único.
5. **Auditar la contradicción `tiene_lesiones + patologias=['Ninguna']`** (2.6) y decidir rename del campo o CHECK.

### Sprint 2 — **Schema: tipos correctos y fuente única**

6. **Decidir tipo definitivo para `actual_reps/weights`** (2.4): agregar columnas `jsonb`, parser de backfill, registro de filas que fallan, normalización (trim, sufijos a columna nueva, descripciones a `notes`).
7. **Consolidar `student_profiles` ↔ `profiles`** (2.5): migrar lo único que quede y mover a schema `archive`.
8. **Mover `plan_assignments_backup_20260508` a schema `archive`** (2.7).
9. **Convención de logs pre-`start_date`** (4.7): documentar en README o agregar regla.

### Sprint 3 — **Performance, auditoría, scheduler**

10. **Crear los 11 índices faltantes** (3.1) con `CREATE INDEX CONCURRENTLY`.
11. **Borrar los 3 índices duplicados** (3.2).
12. **Habilitar `pg_cron`** (3.3) y registrar los 4 cron jobs.
13. **Trigger de auditoría en `profiles`** que alimente `student_edit_history` (3.5).
14. **Uniformar `ON DELETE`** hacia `plans` para `workout_*` (3.4).
15. **Marcar cuentas de prueba** (3.6): `active=false` o schema separado.
16. **Decidir destino de `borg_scale`** (3.7): deprecar o exigir en flow de cierre.

### Sprint 4 — **Hardening**

17. **`NOT NULL` en FKs core** (4.1) después de backfill verificado.
18. **Backfill `plan_exercises.block_id`** (4.2).
19. **`notifications`**: policy DELETE + verificar marca `read=true` en UI (4.3).
20. **CHECK `profiles.level`** en español (4.5).
21. **Trigger `updated_at` en `intake_form_templates`** (4.6).
22. **`ON UPDATE NO ACTION` explícito** en FKs (4.8).

### Sprint 5 — **Cosmético / nice-to-have**

23. **`exercises.created_by` → SET NULL** (5.1).
24. **Migrar TEXT+CHECK a `CREATE TYPE … AS ENUM`** donde el set sea estable (5.2).
25. **Idioma único** (5.x).
26. **`is_active` en `exercises`** y archivar los 167 sin uso (5.3).
27. **`COMMENT ON VIEW v_workout_session_intensity`** (5.4).

---

## 8. Script de "quick wins" (revisar antes de correr)

```sql
-- 0) Backup obligatorio antes de cualquier cosa (pg_dump desde tu máquina).

-- =============================================================
-- BLOQUE A: Limpieza de datos (Sprint 1)
-- =============================================================

-- A.1) Cerrar evaluaciones que ya tienen results
update public.plan_assignments pa
set status='completed',
    status_changed_at=now(),
    status_reason='auto-cierre por evaluation_results existentes (backfill 2026-05-14)'
where status='active' and plan_type='evaluation'
  and exists(select 1 from public.evaluation_results er
             where er.student_id=pa.student_id and er.plan_id=pa.plan_id);

-- A.2) Borrar workout_sessions fantasma (sin started_at/finished_at y sin logs)
delete from public.workout_sessions ws
where started_at is null and finished_at is null
  and not exists (select 1 from public.workout_logs wl
                  where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id and wl.logged_date=ws.logged_date);

-- A.3) Backfill de sessions para logs huérfanos
insert into public.workout_sessions (student_id, plan_id, logged_date, started_at, finished_at, created_at)
select distinct wl.student_id, wl.plan_id, wl.logged_date,
       min(wl.created_at), max(wl.updated_at), min(wl.created_at)
from public.workout_logs wl
where not exists (select 1 from public.workout_sessions ws
                  where ws.student_id=wl.student_id and ws.plan_id=wl.plan_id and ws.logged_date=wl.logged_date)
group by wl.student_id, wl.plan_id, wl.logged_date
on conflict (student_id, plan_id, logged_date) do nothing;

-- A.4) Cerrar sessions abiertas viejas (>24h sin finalizar)
update public.workout_sessions ws
set finished_at = coalesce((select max(wl.updated_at) from public.workout_logs wl
                            where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id and wl.logged_date=ws.logged_date),
                           coalesce(ws.started_at, ws.created_at) + interval '90 minutes')
where finished_at is null
  and coalesce(started_at, created_at) < now() - interval '24 hours';

-- A.5) Mover tabla backup a schema archive
create schema if not exists archive;
alter table public.plan_assignments_backup_20260508 set schema archive;

-- =============================================================
-- BLOQUE B: Triggers de prevención (Sprint 1, después de A)
-- =============================================================

-- B.1) Trigger: cerrar evaluación al cargar resultado
create or replace function public.fn_close_eval_on_result()
returns trigger language plpgsql security definer as $$
begin
  update public.plan_assignments
    set status='completed', status_changed_at=now()
    where student_id=NEW.student_id and plan_id=NEW.plan_id
      and plan_type='evaluation' and status='active';
  return NEW;
end$$;
create trigger trg_close_eval_on_result
  after insert on public.evaluation_results
  for each row execute function public.fn_close_eval_on_result();

-- B.2) Constraint: session no puede tener finished_at sin started_at
alter table public.workout_sessions
  add constraint sessions_started_before_finished
  check (finished_at is null or started_at is not null) not valid;
-- después de chequear que no haya violaciones:
-- alter table public.workout_sessions validate constraint sessions_started_before_finished;

-- B.3) Trigger: prohibir asignar templates como plan_assignments
--      ⚠️ Activar SÓLO después de haber clonado/migrado los 9 assignments existentes
create or replace function public.plan_assignments_forbid_template()
returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.plans where id = NEW.plan_id and is_template = true) then
    raise exception 'plan_assignments.plan_id apunta a un template (plan_id=%). Cloná el template a una instancia primero.', NEW.plan_id;
  end if;
  return NEW;
end$$;
-- create trigger trg_pa_forbid_template
--   before insert or update on public.plan_assignments
--   for each row execute function public.plan_assignments_forbid_template();

-- =============================================================
-- BLOQUE C: Performance (Sprint 3)
-- =============================================================

-- C.1) Índices faltantes (los 3 más urgentes primero)
create index concurrently if not exists idx_workout_logs_plan_id     on public.workout_logs (plan_id);
create index concurrently if not exists idx_workout_sessions_plan_id on public.workout_sessions (plan_id);
create index concurrently if not exists idx_workout_block_logs_plan  on public.workout_block_logs (plan_id);
create index concurrently if not exists idx_plan_exercises_exercise  on public.plan_exercises (exercise_id);
create index concurrently if not exists idx_evaluation_tests_exer    on public.evaluation_tests (exercise_id);
create index concurrently if not exists idx_exercises_created_by     on public.exercises (created_by);
create index concurrently if not exists idx_ifa_template_id          on public.intake_form_assignments (template_id);
create index concurrently if not exists idx_ifa_plan_assignment_id   on public.intake_form_assignments (plan_assignment_id);
create index concurrently if not exists idx_pa_replaced_by           on public.plan_assignments (replaced_by_assignment_id);
create index concurrently if not exists idx_seh_changed_by           on public.student_edit_history (changed_by);
create index concurrently if not exists idx_sp_submission_id         on public.student_profiles (submission_id);

-- C.2) Borrar índices duplicados (después de confirmar que no haya queries pinned)
drop index if exists public.idx_workout_logs_student;
drop index if exists public.idx_workout_sessions_student;
drop index if exists public.idx_evaluation_results_student_id;

-- C.3) Uniformar ON DELETE en workout_*
alter table public.workout_logs     drop constraint workout_logs_plan_id_fkey,
  add constraint workout_logs_plan_id_fkey foreign key (plan_id) references plans(id) on delete set null;
alter table public.workout_logs     drop constraint workout_logs_plan_exercise_id_fkey,
  add constraint workout_logs_plan_exercise_id_fkey foreign key (plan_exercise_id) references plan_exercises(id) on delete set null;
alter table public.workout_sessions drop constraint workout_sessions_plan_id_fkey,
  add constraint workout_sessions_plan_id_fkey foreign key (plan_id) references plans(id) on delete set null;
```

> ⚠️ NO incluye los cambios de `actual_reps/weights` ni la consolidación de `student_profiles` porque requieren decisiones de producto + coordinación con el front.

---

## 9. Health checks (queries para correr post-fix y semanalmente)

```sql
-- a) plan_assignments apuntando a templates (debe ser 0)
select count(*) from plan_assignments pa
join plans p on p.id=pa.plan_id where p.is_template=true;

-- b) Evaluaciones activas con resultados (debe ser 0 si el trigger funciona)
select count(*) from plan_assignments pa
where status='active' and plan_type='evaluation'
  and exists(select 1 from evaluation_results er
             where er.student_id=pa.student_id and er.plan_id=pa.plan_id);

-- c) workout_logs sin session (debe tender a 0)
select count(*) from workout_logs wl
where not exists(select 1 from workout_sessions ws
                 where ws.student_id=wl.student_id and ws.plan_id=wl.plan_id and ws.logged_date=wl.logged_date);

-- d) Sessions fantasma (debe ser 0 con el flow corregido)
select count(*) from workout_sessions ws
where started_at is null and finished_at is null
  and not exists(select 1 from workout_logs wl
                 where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id and wl.logged_date=ws.logged_date);

-- e) Sessions abiertas viejas (>24h)
select count(*) from workout_sessions
where finished_at is null and coalesce(started_at, created_at) < now() - interval '24 hours';

-- f) Alumnos sin coach
select count(*) from profiles where role='student' and coach_id is null and active;

-- g) % notificaciones leídas (últimos 7d)
select round(100.0 * count(*) filter (where read) / nullif(count(*),0), 1)
from notifications where created_at > now() - interval '7 days';

-- h) % de workout_logs con borg_scale en su session correspondiente
select round(100.0 * count(*) filter (where ws.borg_scale is not null) / nullif(count(*),0), 1)
from workout_logs wl
join workout_sessions ws on ws.student_id=wl.student_id and ws.plan_id=wl.plan_id and ws.logged_date=wl.logged_date;
```

---

## 10. Apéndice: drill-down completo sobre `francellone@gmail.com`

> Este apéndice se mantiene como evidencia de los hallazgos que escalaron a la sección 2. Sirve también como template para auditar a otros alumnos.

Profile usado: `d7a1ceb5-80fa-4cb9-8477-126bb71f8081`, Franco Cellone, asignado al coach Anto Almanza (`anto.au.almanza@gmail.com`).

**Volumen:** el alumno generó 269 de los 410 `workout_logs` del sistema (65%) — la muestra más representativa.

### 10.1. Lo bueno

- 2 `evaluation_results` registrados con resultados (chin ups/sentadilla 27/04, hip thrust 29/04).
- 0 logs marcados `completed=true` sin datos → la app no crea logs vacíos.
- 0 logs huérfanos de session para este alumno (el problema sistémico de 113 logs huérfanos viene de otros alumnos).
- 7 wellbeing_logs en 44 días — uso decente del registro de bienestar.
- La cadena de reemplazo de planes funciona: `PLAN 10 (replaced)` apunta correctamente a `PLAN 11 (active)` via `replaced_by_assignment_id`.
- 264/269 logs con `actual_reps` (98%) — el alumno completa los registros casi siempre.

### 10.2. Detalles que escalaron a sección 2

| Hallazgo | Sección | Generalizable | Impacto |
|---|---|---|---|
| 1 assignment activa de Franco apunta a un template "EVALUACION INICIAL" | **2.1** | Sí (9/16 en el sistema, 5 alumnos) | Edición de templates contamina historiales |
| 11 sessions fantasma + 2 abiertas, 5 sessions sin logs | **2.2** | Sí | Métricas de adherencia rotas |
| 2 evaluations completed pero `status='active'` | **2.3** | Sí (8 globales) | Reportes muestran evals fantasma |
| `actual_reps` con `["12cl","12 ","3 (1 cada 15seg)"]` y `actual_weights` con `["","","",""]` | **2.4** | Sí (todo el sistema) | Métricas frágiles |
| `nivel = intermediate` vs `nivel_experiencia = "Intermedio (1-3 años)"` (mismo alumno, dos tablas) | **2.5** | Sí (4 alumnos) | Lecturas inconsistentes |
| `tiene_lesiones = true` + `patologias = ["Ninguna"]` | **2.6** | Posiblemente sí (3 alumnos con campo seteado) | Contradicción semántica |

### 10.3. Detalles menores

- **0/25 sessions con `borg_scale`** → feature de RPE de sesión sin uso (escaló a 3.7).
- **70/269 logs con `logged_date < start_date`** → loguea hacia atrás vía `logged_late=true`, conviene documentar la convención (escaló a 4.7).
- **2 notificaciones, 100% sin leer** → coherente con el patrón global de 91% (sección 4.3).
- **0 `workout_block_logs`** → su plan probablemente es solo strength sin aeróbicos/circuitos (verificar generalización).
- `profile.height_cm = NULL` mientras `weight_kg = 74` → datos parciales en perfil.
- `intake_form_submissions.profile_snapshot = NULL` → al cerrar el intake no se guardó snapshot del perfil (verificar otros submissions del sistema).
