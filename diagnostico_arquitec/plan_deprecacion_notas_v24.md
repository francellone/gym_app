# Plan de deprecación — campos legacy de notas (post v24)

**Estado:** v24 aplicada en producción el 2026-05-16. Backfill OK (10 threads, 64 notas migradas). Smoke tests G.1–G.5 verdes.

**Resumen ejecutivo.** v24 creó la única fuente de verdad de comunicación coach↔alumno (`note_threads` + `notes`) y **dejó intactos** los 6 campos viejos donde la comunicación vivía dispersa. Mientras el front todavía los lee/escribe, los dos sistemas conviven. Cuando el front esté 100% migrado a `notes`, los campos viejos se borran con `migration_v26_drop_legacy_notes.sql`.

**Aclaración importante:** no se deprecan tablas completas, solo columnas dentro de tablas que siguen vivas. `profiles`, `workout_logs`, `workout_block_logs` y `evaluation_test_responses` quedan; solo se sueltan columnas específicas.

---

## 1. Qué se va a borrar (y de dónde)

| Tabla | Columna a borrar | Contenido que tenía | Reemplazo en `notes` |
|---|---|---|---|
| `profiles` | `observations` | Observación pública del coach al alumno (un único campo, se sobreescribe) | `notes` con `visibility='shared'`, `context_type='free'`, `author_role='coach'` |
| `profiles` | `coach_notes` | Notas privadas del coach (no visibles al alumno) | `notes` con `visibility='coach_private'`, `context_type='free'`, `author_role='coach'` |
| `workout_logs` | `notes` | Anotación del alumno sobre la ejecución de un ejercicio | `notes` con `context_type='workout_log'`, `context_id=workout_logs.id`, `author_role='student'` |
| `workout_block_logs` | `notes` | Anotación del alumno sobre el registro de un bloque (aeróbico/circuito) | `notes` con `context_type='workout_block_log'`, `context_id=workout_block_logs.id`, `author_role='student'` |
| `evaluation_test_responses` | `coach_comment_public` | Comentario del coach al test, visible al alumno | `notes` con `visibility='shared'`, `context_type='evaluation_test'`, `context_id=test_id`, `author_role='coach'` |
| `evaluation_test_responses` | `coach_comment_private` | Comentario privado del coach al test | `notes` con `visibility='coach_private'`, `context_type='evaluation_test'`, `context_id=test_id`, `author_role='coach'` |
| `evaluation_test_responses` | `student_comment` | Respuesta del alumno al comentario del coach en el test | `notes` con `visibility='shared'`, `context_type='evaluation_test'`, `context_id=test_id`, `author_role='student'` |

**Campos que NO se tocan** (no son comunicación, son contenido del plan):

- `exercises.technique_notes` — instrucciones técnicas del ejercicio en el catálogo.
- `plan_exercises.extra_notes` — instrucción del coach embebida en el plan.
- `plan_blocks.notes` — instrucción técnica del bloque.
- `workout_sessions.borg_notes` y los `{day}_notes` por día — pendiente de decisión arquitectónica aparte (ver §5).

---

## 2. Criterios de aceptación para deprecar

Antes de correr `migration_v26_drop_legacy_notes.sql`, los 4 puntos siguientes tienen que estar verdes:

1. **El front no escribe a ningún campo viejo.** Una búsqueda en `/src` por los nombres de campo no debe devolver `UPDATE`/`INSERT`/`upsert` apuntando a esas columnas. Patrones a grepear:
   ```
   .from('profiles').update(... observations ...
   .from('profiles').update(... coach_notes ...
   .from('workout_logs').upsert(... notes:
   .from('workout_block_logs').upsert(... notes:
   .from('evaluation_test_responses').upsert(... coach_comment_public
   .from('evaluation_test_responses').upsert(... coach_comment_private
   .from('evaluation_test_responses').upsert(... student_comment
   ```
2. **El front no lee de ningún campo viejo.** Mismas búsquedas pero apuntando a `.select(...)` que incluyan esas columnas, y en componentes (`StudentInfoTab`, `TodayWorkoutPage`, `StudentEvaluationsTab`, `EvalWorkoutPage`, `StudentLogsTab`).
3. **Reporte 0-drift por al menos 7 días.** Una query diaria (manual o cron) que compare el contenido de los campos viejos vs el último `note.body` del thread correspondiente. Si el delta es 0 durante una semana, asumimos que nadie está actualizando los viejos por backdoor (otros tools, scripts ad-hoc, etc.).
4. **Backup verificable.** Tomar un dump de las columnas a borrar antes del DROP, guardarlo fuera de la DB (S3, GitHub release, lo que sea). Ya está la convención `schema=archive` en el repo (ver `fix_2_7_archive_backup_and_2_2_sessions_consistency`); aplicar el mismo patrón.

---

## 3. Plan de release (orden + fases del front)

El roadmap del front (de la propuesta original):

- **Fase A — Fundación (read-only).** ✅ Hecha. Coach ve el panel con todo lo backfilleado. Cero cambios de escritura.
- **Fase B — Coach escribe + alumno lee.** Pendiente. Habilita el composer del coach; alumno tiene su tab "Notas". Las notificaciones `coach_comment` empiezan a viajar.
- **Fase C — Inserción inline (dual write).** Pendiente. Las textareas que el alumno usa hoy (TodayWorkoutPage / EvalWorkoutPage) y el coach (StudentEvaluationsTab) siguen funcionando pero ahora cada save hace **doble escritura**: al campo viejo *y* a `notes`. Esto es lo más sensible.
- **Fase D — Single source of truth.** Pendiente. Se invierte el dual-write: solo `notes` se escribe. Los campos viejos pasan a leerse de `notes` (vía vista o lectura directa) hasta el cleanup.
- **migration_v25_deprecate_legacy_notes.sql.** `COMMENT ON COLUMN` agregando `'DEPRECATED v25, leer de notes'` a cada columna del cuadro de §1. No borra nada, solo marca. Permite que un linter o code review atrape lecturas tardías.
- **migration_v26_drop_legacy_notes.sql.** `DROP COLUMN ... CASCADE` para los 7 campos. Se corre solo cuando los 4 criterios de §2 están verdes.

---

## 4. Esqueleto de `migration_v26_drop_legacy_notes.sql`

```sql
-- migration_v26_drop_legacy_notes.sql
-- Borra los campos legacy de notas reemplazados por la tabla `notes` (v24).
-- Pre-requisito: criterios §2 del plan_deprecacion_notas_v24.md verdes.
BEGIN;

-- 1. Backup a schema archive (idempotente)
CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.profiles_notes_20XX (
  id uuid PRIMARY KEY,
  observations text,
  coach_notes  text,
  archived_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive.profiles_notes_20XX (id, observations, coach_notes)
SELECT id, observations, coach_notes FROM public.profiles
 WHERE observations IS NOT NULL OR coach_notes IS NOT NULL
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS archive.workout_logs_notes_20XX (
  id uuid PRIMARY KEY,
  notes text,
  archived_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive.workout_logs_notes_20XX (id, notes)
SELECT id, notes FROM public.workout_logs WHERE notes IS NOT NULL
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS archive.workout_block_logs_notes_20XX (
  id uuid PRIMARY KEY,
  notes text,
  archived_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive.workout_block_logs_notes_20XX (id, notes)
SELECT id, notes FROM public.workout_block_logs WHERE notes IS NOT NULL
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS archive.eval_responses_comments_20XX (
  id uuid PRIMARY KEY,
  coach_comment_public  text,
  coach_comment_private text,
  student_comment       text,
  archived_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive.eval_responses_comments_20XX
SELECT id, coach_comment_public, coach_comment_private, student_comment, now()
  FROM public.evaluation_test_responses
 WHERE coach_comment_public IS NOT NULL
    OR coach_comment_private IS NOT NULL
    OR student_comment       IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 2. DROP COLUMN
ALTER TABLE public.profiles                  DROP COLUMN IF EXISTS observations;
ALTER TABLE public.profiles                  DROP COLUMN IF EXISTS coach_notes;
ALTER TABLE public.workout_logs              DROP COLUMN IF EXISTS notes;
ALTER TABLE public.workout_block_logs        DROP COLUMN IF EXISTS notes;
ALTER TABLE public.evaluation_test_responses DROP COLUMN IF EXISTS coach_comment_public;
ALTER TABLE public.evaluation_test_responses DROP COLUMN IF EXISTS coach_comment_private;
ALTER TABLE public.evaluation_test_responses DROP COLUMN IF EXISTS student_comment;

COMMIT;

-- POST: cómo restaurar uno (caso de emergencia)
--   ALTER TABLE public.profiles ADD COLUMN observations text;
--   UPDATE public.profiles p SET observations = a.observations
--     FROM archive.profiles_notes_20XX a WHERE a.id = p.id;
```

> Antes de correr v26: re-tomar el backup en ese momento (los nombres `20XX` ajustarlos a la fecha real). El backup que se hace dentro de la migración es la red de emergencia, pero es buen práctica también dumpear a almacenamiento externo.

---

## 5. Casos abiertos / no resueltos

1. **`workout_sessions.{day}_notes` (`monday_notes`, etc.) y `borg_notes`.** No están en el backfill de v24 porque (a) la estructura por día no está documentada limpiamente en `schema.sql`, (b) el flujo de PSE/Borg está mezclado con la sesión y conviene resolver eso en su propia migración. Posibles caminos:
   - Reescribir el flujo PSE para que el "comentario del día" sea una `note` con `context_type='session_day'` y `context_id=session.id`. Esto convierte 7 columnas en 1 tipo de contexto.
   - O dejarlos como están si el equipo decide que el PSE es métrica + observación de la sesión y no comunicación. En ese caso, sacarlos del scope de deprecación y mantenerlos como columnas dedicadas.
   Decidir antes de Fase C.

2. **`muscle_group` NULL en 25 de 60 notas backfilleadas (workout_log).** No es bug del trigger: 25 ejercicios del catálogo `exercises` tienen `muscle_group` vacío. El filtro "por grupo muscular" en el panel no los va a encontrar. Acción sugerida: hacer un cleanup del catálogo (asignar `muscle_group` a esos 25) antes de comunicar la feature a usuarios. Query para diagnóstico:
   ```sql
   SELECT e.id, e.name FROM public.exercises e
    WHERE e.muscle_group IS NULL OR trim(e.muscle_group) = ''
    ORDER BY e.name;
   ```

3. **Sin tipo `student_note` en `notifications.type`.** Hoy el coach NO recibe push cuando el alumno escribe (solo se incrementa `note_threads.unread_for_coach`). Se decidió diferir a v25. Cuando se haga, hay que recrear el CHECK del enum (no es `ENUM` real, es `CHECK IN`).

4. **`get_coach_id()` asume único coach.** Si en algún momento se agregan más coaches, el modelo de `note_threads` lo soporta (FK por `coach_id`), pero el backfill de v24 usó solo el primero. Documentar o crear migración futura para crear threads del segundo coach con cada alumno.

5. **`coach_private` y soft-delete del padre en replies.** Si una nota privada se borra (soft) y tiene replies, los replies quedan con `parent_note_id` apuntando a una nota oculta. El front (`NoteCard`) ya muestra "Mensaje eliminado" en ese caso. No hay migración pendiente.

---

## 6. Referencias

- `supabase/migration_v24_notes.sql` — la migración que creó `note_threads` + `notes` + backfill.
- `src/lib/notes.js` — data layer del front, fuente de verdad de queries contra v24.
- `diagnostico_arquitec/diagnostico-supabase.md` §6 (fila "Notas privadas del coach") — diagnóstico previo que ya identificaba la dispersión.
- Smoke tests G.1–G.5 — definidos en la spec del backend agent (round 1 de la implementación), ejecutados al aplicar v24.
