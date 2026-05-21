-- ============================================================
-- Migration v24: Panel de Notas (hilo coach ↔ alumno)
-- ------------------------------------------------------------
-- Crea un canal único de comunicación entre el coach y cada
-- alumno, con historial, contexto (qué ejercicio / log / eval /
-- bloque / plan se está comentando), tags libres y replies.
--
-- Reemplaza progresivamente los 6 campos dispersos donde hoy
-- vive la comunicación:
--
--   profiles.observations              → notes (shared, free)
--   profiles.coach_notes               → notes (coach_private, free)
--   workout_logs.notes                 → notes (shared, workout_log)
--   workout_block_logs.notes           → notes (shared, workout_block_log)
--   evaluation_test_responses.coach_comment_public  → notes (shared, evaluation_test)
--   evaluation_test_responses.coach_comment_private → notes (coach_private, evaluation_test)
--   evaluation_test_responses.student_comment       → notes (shared, evaluation_test)
--
-- Convención: estas migraciones NO borran los campos viejos.
-- Conviven con el panel hasta que el front migre las lecturas
-- (deprecación en v25+).
--
-- Diseño:
--   - Toda la migración corre en una transacción.
--   - Tablas: note_threads + notes (single source of truth para
--     comunicación; el plan content -extra_notes, technique_notes,
--     plan_blocks.notes- NO se toca).
--   - Trigger BEFORE INSERT/UPDATE en notes denormaliza
--     exercise_id / muscle_group / block_type según el contexto,
--     para filtros rápidos sin joins.
--   - Trigger AFTER INSERT actualiza thread.last_message_at +
--     contadores de no-leídas, y dispara notificación 'coach_comment'
--     al alumno cuando el coach manda una nota compartida.
--   - Backfill best-effort: timestamps originales se preservan
--     cuando existen (workout_logs.updated_at, evaluation_*.updated_at).
--     Para profiles.observations / coach_notes se usa profile.updated_at
--     como aproximación (el modelo viejo no guarda historial).
--   - El alumno solo ve notas 'shared' de su propio thread; las
--     'coach_private' nunca salen por RLS al rol student.
--
-- TODO v25+:
--   - Reemplazar lecturas en front (StudentInfoTab, TodayWorkoutPage,
--     StudentEvaluationsTab, StudentLogsTab).
--   - Cablear escrituras nuevas a la tabla notes en vez de los
--     campos viejos.
--   - Cuando el front esté 100% migrado, borrar los campos
--     deprecados con migration_v26_drop_legacy_notes.sql.
--   - Backfill de workout_sessions.{day}_notes (estructura por día,
--     se difiere a v25 cuando el front consolide ese flujo).
--   - Agregar tipo de notificación 'student_note' al enum para
--     notificar al coach cuando el alumno escribe.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 0. Pre-flight: contar lo que vamos a migrar
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  c_obs       integer;
  c_priv      integer;
  c_wlog      integer;
  c_blog      integer;
  c_eval_pub  integer;
  c_eval_priv integer;
  c_eval_stu  integer;
  v_coach_id  uuid;
BEGIN
  SELECT public.get_coach_id() INTO v_coach_id;
  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Migration v24 abortada: no existe ningún profile con role=coach (get_coach_id() devolvió NULL).';
  END IF;

  SELECT count(*) INTO c_obs       FROM public.profiles WHERE NULLIF(trim(observations), '') IS NOT NULL;
  SELECT count(*) INTO c_priv      FROM public.profiles WHERE NULLIF(trim(coach_notes), '')  IS NOT NULL;
  SELECT count(*) INTO c_wlog      FROM public.workout_logs        WHERE NULLIF(trim(notes), '') IS NOT NULL;
  SELECT count(*) INTO c_blog      FROM public.workout_block_logs  WHERE NULLIF(trim(notes), '') IS NOT NULL;
  SELECT count(*) INTO c_eval_pub  FROM public.evaluation_test_responses WHERE NULLIF(trim(coach_comment_public),  '') IS NOT NULL;
  SELECT count(*) INTO c_eval_priv FROM public.evaluation_test_responses WHERE NULLIF(trim(coach_comment_private), '') IS NOT NULL;
  SELECT count(*) INTO c_eval_stu  FROM public.evaluation_test_responses WHERE NULLIF(trim(student_comment),       '') IS NOT NULL;

  RAISE NOTICE 'v24 pre-flight: coach_id=%, observations=%, coach_notes=%, workout_logs.notes=%, workout_block_logs.notes=%, eval coach_public=%, eval coach_private=%, eval student=%',
    v_coach_id, c_obs, c_priv, c_wlog, c_blog, c_eval_pub, c_eval_priv, c_eval_stu;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 1. TABLA note_threads
-- ─────────────────────────────────────────────────────────────
-- Un hilo por par (coach, student). Hoy el modelo asume un único
-- coach (get_coach_id()) pero dejamos la FK lista por si en el
-- futuro se admite multi-coach. UNIQUE garantiza idempotencia.
CREATE TABLE IF NOT EXISTS public.note_threads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pinned                boolean NOT NULL DEFAULT false,
  last_message_at       timestamptz,
  unread_for_coach      int NOT NULL DEFAULT 0,
  unread_for_student    int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, student_id),
  CHECK  (coach_id <> student_id)
);

CREATE INDEX IF NOT EXISTS idx_note_threads_student ON public.note_threads(student_id);
CREATE INDEX IF NOT EXISTS idx_note_threads_coach   ON public.note_threads(coach_id);
CREATE INDEX IF NOT EXISTS idx_note_threads_last_msg
  ON public.note_threads(last_message_at DESC NULLS LAST);

CREATE TRIGGER note_threads_updated_at
  BEFORE UPDATE ON public.note_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.note_threads IS
  'Hilo de comunicación entre coach y alumno. Uno por par. v24.';

-- ─────────────────────────────────────────────────────────────
-- 2. TABLA notes
-- ─────────────────────────────────────────────────────────────
-- Fuente única de comunicación. NO incluye contenido pedagógico
-- del plan (exercises.technique_notes, plan_exercises.extra_notes,
-- plan_blocks.notes); ese queda como propiedad del plan.
CREATE TABLE IF NOT EXISTS public.notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid NOT NULL REFERENCES public.note_threads(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES public.profiles(id)     ON DELETE SET NULL,
  author_role     text NOT NULL CHECK (author_role IN ('coach', 'student')),

  body            text NOT NULL CHECK (length(trim(body)) > 0),

  visibility      text NOT NULL DEFAULT 'shared'
                       CHECK (visibility IN ('shared', 'coach_private')),

  -- Contexto al que se cuelga la nota. 'free' = sin contexto (chat libre).
  context_type    text NOT NULL DEFAULT 'free'
                       CHECK (context_type IN (
                         'free',
                         'workout_log',
                         'workout_block_log',
                         'plan_exercise',
                         'evaluation_test',
                         'plan',
                         'session_day'
                       )),
  context_id      uuid,
  -- (free → context_id NULL) | (resto → context_id NOT NULL)
  CONSTRAINT notes_context_id_consistency CHECK (
    (context_type = 'free' AND context_id IS NULL) OR
    (context_type <> 'free' AND context_id IS NOT NULL)
  ),

  -- Denormalizado por trigger (BEFORE INSERT/UPDATE) para filtros.
  exercise_id     uuid REFERENCES public.exercises(id) ON DELETE SET NULL,
  muscle_group    text,
  block_type      text CHECK (block_type IS NULL OR block_type IN ('strength','aerobic','circuit')),

  parent_note_id  uuid REFERENCES public.notes(id) ON DELETE SET NULL,
  tags            text[] NOT NULL DEFAULT '{}',

  read_at_coach   timestamptz,
  read_at_student timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,

  -- Solo el coach puede dejar notas privadas
  CONSTRAINT notes_private_only_coach CHECK (
    visibility <> 'coach_private' OR author_role = 'coach'
  )
);

CREATE INDEX IF NOT EXISTS idx_notes_thread_created
  ON public.notes(thread_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_context
  ON public.notes(context_type, context_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_exercise
  ON public.notes(exercise_id) WHERE exercise_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_muscle_group
  ON public.notes(muscle_group) WHERE muscle_group IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_block_type
  ON public.notes(block_type) WHERE block_type IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_tags_gin
  ON public.notes USING GIN (tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_parent
  ON public.notes(parent_note_id) WHERE parent_note_id IS NOT NULL;
-- Para "unread" del lado coach / alumno
CREATE INDEX IF NOT EXISTS idx_notes_unread_coach
  ON public.notes(thread_id) WHERE read_at_coach IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_unread_student
  ON public.notes(thread_id) WHERE read_at_student IS NULL AND deleted_at IS NULL AND visibility = 'shared';

CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.notes IS
  'Mensajes del hilo coach↔alumno. Single source of truth de comunicación. v24.';
COMMENT ON COLUMN public.notes.context_type IS
  'Tipo de objeto al que se cuelga la nota. free=chat libre. workout_log=registro del alumno por ejercicio. workout_block_log=registro por bloque. plan_exercise=instrucción del plan (cuando el coach comenta SOBRE un ejercicio del plan). evaluation_test=respuesta de prueba. plan=plan completo. session_day=día de sesión.';
COMMENT ON COLUMN public.notes.exercise_id IS
  'Denormalizado por trigger from context. Permite filtrar todas las notas sobre un ejercicio sin joins en runtime.';

-- ─────────────────────────────────────────────────────────────
-- 3. TRIGGER de denormalización: resolver exercise_id / muscle_group / block_type
-- ─────────────────────────────────────────────────────────────
-- Se ejecuta BEFORE INSERT y BEFORE UPDATE OF context_type, context_id
-- para que filtros por ejercicio / grupo muscular / tipo de bloque
-- no requieran joins. Si el contexto cambia, los denormalizados
-- siempre reflejan el contexto vigente.
CREATE OR REPLACE FUNCTION public.notes_resolve_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exercise_id   uuid;
  v_muscle_group  text;
  v_block_type    text;
BEGIN
  -- Resetear: el caller no puede inventar valores; siempre los resolvemos.
  v_exercise_id  := NULL;
  v_muscle_group := NULL;
  v_block_type   := NULL;

  IF NEW.context_type = 'workout_log' THEN
    -- notes → workout_logs.plan_exercise_id → plan_exercises (exercise_id, block_id)
    SELECT pe.exercise_id, pb.block_type
      INTO v_exercise_id, v_block_type
      FROM public.workout_logs       wl
      JOIN public.plan_exercises     pe ON pe.id = wl.plan_exercise_id
      LEFT JOIN public.plan_blocks   pb ON pb.id = pe.block_id
     WHERE wl.id = NEW.context_id;

  ELSIF NEW.context_type = 'workout_block_log' THEN
    -- notes → workout_block_logs.plan_block_id → plan_blocks.block_type
    SELECT pb.block_type
      INTO v_block_type
      FROM public.workout_block_logs wbl
      JOIN public.plan_blocks        pb ON pb.id = wbl.plan_block_id
     WHERE wbl.id = NEW.context_id;
    -- exercise_id queda NULL: el bloque tiene varios ejercicios.

  ELSIF NEW.context_type = 'plan_exercise' THEN
    SELECT pe.exercise_id, pb.block_type
      INTO v_exercise_id, v_block_type
      FROM public.plan_exercises   pe
      LEFT JOIN public.plan_blocks pb ON pb.id = pe.block_id
     WHERE pe.id = NEW.context_id;

  ELSIF NEW.context_type = 'evaluation_test' THEN
    -- evaluation_tests.exercise_id puede ser NULL (prueba libre con exercise_name).
    SELECT et.exercise_id
      INTO v_exercise_id
      FROM public.evaluation_tests et
     WHERE et.id = NEW.context_id;

  END IF;

  IF v_exercise_id IS NOT NULL THEN
    SELECT e.muscle_group INTO v_muscle_group
      FROM public.exercises e WHERE e.id = v_exercise_id;
  END IF;

  NEW.exercise_id  := v_exercise_id;
  NEW.muscle_group := v_muscle_group;
  NEW.block_type   := v_block_type;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notes_resolve_context() IS
  'Denormaliza exercise_id, muscle_group y block_type desde el contexto. v24.';

DROP TRIGGER IF EXISTS trg_notes_resolve_context ON public.notes;
CREATE TRIGGER trg_notes_resolve_context
  BEFORE INSERT OR UPDATE OF context_type, context_id ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_resolve_context();

-- ─────────────────────────────────────────────────────────────
-- 4. TRIGGER: mantener thread (last_message_at, unread, updated_at)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notes_bump_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.note_threads
       SET last_message_at = NEW.created_at,
           updated_at      = now(),
           -- El receptor suma 1 a su contador de no-leídas.
           unread_for_student = unread_for_student
                                + CASE WHEN NEW.author_role = 'coach'
                                        AND NEW.visibility   = 'shared'
                                        AND NEW.deleted_at  IS NULL
                                       THEN 1 ELSE 0 END,
           unread_for_coach   = unread_for_coach
                                + CASE WHEN NEW.author_role = 'student'
                                        AND NEW.deleted_at  IS NULL
                                       THEN 1 ELSE 0 END
     WHERE id = NEW.thread_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Marcar como leído del lado coach
    IF OLD.read_at_coach IS NULL AND NEW.read_at_coach IS NOT NULL
       AND NEW.author_role = 'student' AND NEW.deleted_at IS NULL THEN
      UPDATE public.note_threads
         SET unread_for_coach = GREATEST(unread_for_coach - 1, 0),
             updated_at       = now()
       WHERE id = NEW.thread_id;
    END IF;

    -- Marcar como leído del lado alumno
    IF OLD.read_at_student IS NULL AND NEW.read_at_student IS NOT NULL
       AND NEW.author_role = 'coach' AND NEW.visibility = 'shared'
       AND NEW.deleted_at IS NULL THEN
      UPDATE public.note_threads
         SET unread_for_student = GREATEST(unread_for_student - 1, 0),
             updated_at         = now()
       WHERE id = NEW.thread_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notes_bump_thread_ins ON public.notes;
CREATE TRIGGER trg_notes_bump_thread_ins
  AFTER INSERT ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_bump_thread();

DROP TRIGGER IF EXISTS trg_notes_bump_thread_upd ON public.notes;
CREATE TRIGGER trg_notes_bump_thread_upd
  AFTER UPDATE OF read_at_coach, read_at_student ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_bump_thread();

-- ─────────────────────────────────────────────────────────────
-- 5. TRIGGER: notificación al alumno cuando el coach comenta
-- ─────────────────────────────────────────────────────────────
-- Cablea por fin el tipo 'coach_comment' del enum de notifications
-- (declarado en v16 pero nunca emitido). Solo dispara cuando la
-- nota es del coach y visibility='shared'.
CREATE OR REPLACE FUNCTION public.fn_notify_coach_note()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id  uuid;
  v_excerpt     text;
BEGIN
  IF NEW.author_role <> 'coach' OR NEW.visibility <> 'shared'
     OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT student_id INTO v_student_id
    FROM public.note_threads
   WHERE id = NEW.thread_id;
  IF v_student_id IS NULL THEN RETURN NEW; END IF;

  v_excerpt := substring(NEW.body, 1, 140);

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_student_id,
    'coach_comment',
    'Tu coach te dejó una nota',
    v_excerpt,
    jsonb_build_object(
      'note_id',      NEW.id,
      'thread_id',    NEW.thread_id,
      'context_type', NEW.context_type,
      'context_id',   NEW.context_id,
      'exercise_id',  NEW.exercise_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_coach_note ON public.notes;
CREATE TRIGGER trg_notify_coach_note
  AFTER INSERT ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_coach_note();

-- ─────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.note_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes        ENABLE ROW LEVEL SECURITY;

-- note_threads: coach full access
CREATE POLICY "Coach full access on note_threads"
  ON public.note_threads FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- note_threads: alumno solo ve su propio thread
CREATE POLICY "Student read own note_thread"
  ON public.note_threads FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- notes: coach full access
CREATE POLICY "Coach full access on notes"
  ON public.notes FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- notes: alumno SELECT — solo notas 'shared' de su thread (las
-- 'coach_private' NUNCA salen al alumno).
CREATE POLICY "Student read shared notes of own thread"
  ON public.notes FOR SELECT TO authenticated
  USING (
    visibility = 'shared'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.note_threads nt
       WHERE nt.id = notes.thread_id
         AND nt.student_id = auth.uid()
    )
  );

-- notes: alumno INSERT — solo en su thread, como autor, shared.
CREATE POLICY "Student insert own notes"
  ON public.notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id   = auth.uid()
    AND author_role = 'student'
    AND visibility  = 'shared'
    AND EXISTS (
      SELECT 1 FROM public.note_threads nt
       WHERE nt.id = notes.thread_id
         AND nt.student_id = auth.uid()
    )
  );

-- notes: alumno UPDATE — solo sus propias notas (marcar leído /
-- editar body / soft delete). No puede tocar visibility ni autor.
CREATE POLICY "Student update own notes"
  ON public.notes FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    AND author_role = 'student'
  )
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = 'student'
    AND visibility  = 'shared'
  );

-- notes: alumno DELETE — soft delete preferido; bloqueamos hard delete.
-- (Si en el futuro permitís hard delete, agregar policy específica.)

-- ─────────────────────────────────────────────────────────────
-- 7. Helper para upsert de thread (idempotente)
-- ─────────────────────────────────────────────────────────────
-- Usado por el backfill y por el front (cuando aún no existe
-- thread para un par coach-alumno).
CREATE OR REPLACE FUNCTION public.notes_get_or_create_thread(
  p_coach_id    uuid,
  p_student_id  uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_coach_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'notes_get_or_create_thread: coach_id y student_id son obligatorios';
  END IF;

  SELECT id INTO v_id
    FROM public.note_threads
   WHERE coach_id = p_coach_id AND student_id = p_student_id;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.note_threads (coach_id, student_id)
       VALUES (p_coach_id, p_student_id)
  ON CONFLICT (coach_id, student_id) DO UPDATE
     SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.notes_get_or_create_thread(uuid, uuid) IS
  'Devuelve el id del thread para (coach, student), creándolo si no existe. v24.';

-- ─────────────────────────────────────────────────────────────
-- 8. BACKFILL
-- ─────────────────────────────────────────────────────────────
-- Estrategia:
--   - 8.1 Crear un thread por cada (coach, student) donde el alumno
--          tiene rol student (active o no) — así el panel funciona
--          desde el primer login incluso si no hay historial.
--   - 8.2 Migrar profiles.observations (shared, free) y coach_notes
--          (coach_private, free). NO se borra el campo viejo.
--   - 8.3 Migrar workout_logs.notes (shared, workout_log).
--   - 8.4 Migrar workout_block_logs.notes (shared, workout_block_log).
--   - 8.5 Migrar evaluation_test_responses.*_comment_* (3 columnas).
--   - 8.6 Recalcular last_message_at + contadores en threads.
--
-- TODOS los inserts pasan por el trigger de denormalización, así
-- exercise_id / muscle_group / block_type quedan correctos.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_coach_id     uuid;
  c_threads      integer;
  c_notes_total  integer;
BEGIN
  SELECT public.get_coach_id() INTO v_coach_id;

  -- 8.1 Threads: uno por alumno (incluso sin historial).
  INSERT INTO public.note_threads (coach_id, student_id)
  SELECT v_coach_id, p.id
    FROM public.profiles p
   WHERE p.role = 'student'
  ON CONFLICT (coach_id, student_id) DO NOTHING;

  SELECT count(*) INTO c_threads FROM public.note_threads;
  RAISE NOTICE 'v24 8.1: note_threads creadas/asegurados = %', c_threads;

  -- 8.2 profiles.observations → shared / free (autor coach)
  INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, created_at, updated_at)
  SELECT nt.id, v_coach_id, 'coach', p.observations, 'shared', 'free',
         COALESCE(p.updated_at, p.created_at, now()),
         COALESCE(p.updated_at, p.created_at, now())
    FROM public.profiles p
    JOIN public.note_threads nt
      ON nt.coach_id = v_coach_id AND nt.student_id = p.id
   WHERE p.role = 'student'
     AND NULLIF(trim(p.observations), '') IS NOT NULL;

  -- 8.2b profiles.coach_notes → coach_private / free (autor coach)
  INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, created_at, updated_at)
  SELECT nt.id, v_coach_id, 'coach', p.coach_notes, 'coach_private', 'free',
         COALESCE(p.updated_at, p.created_at, now()),
         COALESCE(p.updated_at, p.created_at, now())
    FROM public.profiles p
    JOIN public.note_threads nt
      ON nt.coach_id = v_coach_id AND nt.student_id = p.id
   WHERE p.role = 'student'
     AND NULLIF(trim(p.coach_notes), '') IS NOT NULL;

  -- 8.3 workout_logs.notes → shared / workout_log (autor: alumno)
  INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id, created_at, updated_at)
  SELECT nt.id, wl.student_id, 'student', wl.notes, 'shared', 'workout_log', wl.id,
         COALESCE(wl.updated_at, wl.created_at, now()),
         COALESCE(wl.updated_at, wl.created_at, now())
    FROM public.workout_logs wl
    JOIN public.note_threads nt
      ON nt.coach_id = v_coach_id AND nt.student_id = wl.student_id
   WHERE NULLIF(trim(wl.notes), '') IS NOT NULL;

  -- 8.4 workout_block_logs.notes → shared / workout_block_log (autor: alumno)
  INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id, created_at, updated_at)
  SELECT nt.id, wbl.student_id, 'student', wbl.notes, 'shared', 'workout_block_log', wbl.id,
         COALESCE(wbl.updated_at, wbl.created_at, now()),
         COALESCE(wbl.updated_at, wbl.created_at, now())
    FROM public.workout_block_logs wbl
    JOIN public.note_threads nt
      ON nt.coach_id = v_coach_id AND nt.student_id = wbl.student_id
   WHERE NULLIF(trim(wbl.notes), '') IS NOT NULL;

  -- 8.5a eval coach_comment_public → shared / evaluation_test (autor: coach)
  INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id, created_at, updated_at)
  SELECT nt.id, v_coach_id, 'coach', etr.coach_comment_public, 'shared', 'evaluation_test', etr.test_id,
         COALESCE(etr.updated_at, etr.created_at, now()),
         COALESCE(etr.updated_at, etr.created_at, now())
    FROM public.evaluation_test_responses etr
    JOIN public.evaluation_results er ON er.id = etr.evaluation_result_id
    JOIN public.note_threads nt
      ON nt.coach_id = v_coach_id AND nt.student_id = er.student_id
   WHERE NULLIF(trim(etr.coach_comment_public), '') IS NOT NULL;

  -- 8.5b eval coach_comment_private → coach_private / evaluation_test (autor: coach)
  INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id, created_at, updated_at)
  SELECT nt.id, v_coach_id, 'coach', etr.coach_comment_private, 'coach_private', 'evaluation_test', etr.test_id,
         COALESCE(etr.updated_at, etr.created_at, now()),
         COALESCE(etr.updated_at, etr.created_at, now())
    FROM public.evaluation_test_responses etr
    JOIN public.evaluation_results er ON er.id = etr.evaluation_result_id
    JOIN public.note_threads nt
      ON nt.coach_id = v_coach_id AND nt.student_id = er.student_id
   WHERE NULLIF(trim(etr.coach_comment_private), '') IS NOT NULL;

  -- 8.5c eval student_comment → shared / evaluation_test (autor: alumno)
  INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id, created_at, updated_at)
  SELECT nt.id, er.student_id, 'student', etr.student_comment, 'shared', 'evaluation_test', etr.test_id,
         COALESCE(etr.updated_at, etr.created_at, now()),
         COALESCE(etr.updated_at, etr.created_at, now())
    FROM public.evaluation_test_responses etr
    JOIN public.evaluation_results er ON er.id = etr.evaluation_result_id
    JOIN public.note_threads nt
      ON nt.coach_id = v_coach_id AND nt.student_id = er.student_id
   WHERE NULLIF(trim(etr.student_comment), '') IS NOT NULL;

  -- 8.6 Recalcular last_message_at + contadores de no-leídas a partir
  -- de las notas backfilleadas. Las marcamos como YA LEÍDAS por el
  -- receptor (es histórico): no queremos inundar de "no leídas".
  UPDATE public.notes SET
    read_at_coach   = COALESCE(read_at_coach,   updated_at),
    read_at_student = CASE WHEN visibility = 'shared'
                           THEN COALESCE(read_at_student, updated_at)
                           ELSE read_at_student END;

  UPDATE public.note_threads nt
     SET last_message_at = sub.max_ts,
         unread_for_coach   = 0,
         unread_for_student = 0
    FROM (
      SELECT thread_id, MAX(created_at) AS max_ts
        FROM public.notes
       WHERE deleted_at IS NULL
       GROUP BY thread_id
    ) sub
   WHERE nt.id = sub.thread_id;

  SELECT count(*) INTO c_notes_total FROM public.notes;
  RAISE NOTICE 'v24 backfill total: notes insertadas = %', c_notes_total;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. Verificación final
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  threads_count      integer;
  notes_count        integer;
  notes_with_ex      integer;
  notes_private      integer;
  v_obs_remaining    integer;
  v_priv_remaining   integer;
BEGIN
  SELECT count(*) INTO threads_count FROM public.note_threads;
  SELECT count(*) INTO notes_count   FROM public.notes;
  SELECT count(*) INTO notes_with_ex FROM public.notes WHERE exercise_id IS NOT NULL;
  SELECT count(*) INTO notes_private FROM public.notes WHERE visibility = 'coach_private';

  -- Sanity: cantidad de obs/priv en profiles vs notes free
  SELECT count(*) INTO v_obs_remaining
    FROM public.profiles
   WHERE role = 'student' AND NULLIF(trim(observations), '') IS NOT NULL;
  SELECT count(*) INTO v_priv_remaining
    FROM public.profiles
   WHERE role = 'student' AND NULLIF(trim(coach_notes), '')  IS NOT NULL;

  RAISE NOTICE 'v24 verificación: threads=%, notes=% (con exercise_id=%, private=%), profiles.observations no vacíos=%, profiles.coach_notes no vacíos=%',
    threads_count, notes_count, notes_with_ex, notes_private, v_obs_remaining, v_priv_remaining;

  IF threads_count = 0 THEN
    RAISE EXCEPTION 'v24 abortada: no se creó ningún thread.';
  END IF;
END;
$$;

COMMIT;

-- ============================================================
-- POST: queries útiles
-- ============================================================
--
-- Todas las notas sobre un ejercicio específico, mezcladas coach+alumno,
-- por orden cronológico:
--
--   SELECT n.created_at, n.author_role, n.body, n.context_type, n.tags
--     FROM public.notes n
--    WHERE n.exercise_id = '<exercise_uuid>'
--      AND n.deleted_at IS NULL
--      AND n.visibility = 'shared'
--    ORDER BY n.created_at;
--
-- Notas con un tag, últimos 30 días:
--
--   SELECT * FROM public.notes
--    WHERE tags && ARRAY['lesión']
--      AND created_at >= now() - INTERVAL '30 days'
--      AND deleted_at IS NULL;
--
-- Bandeja del coach (threads con notas pendientes):
--
--   SELECT nt.*, p.name AS student_name
--     FROM public.note_threads nt
--     JOIN public.profiles p ON p.id = nt.student_id
--    WHERE nt.unread_for_coach > 0
--    ORDER BY nt.last_message_at DESC NULLS LAST;
--
-- Marcar todas las notas del thread como leídas por el coach:
--
--   UPDATE public.notes
--      SET read_at_coach = now()
--    WHERE thread_id = '<thread_uuid>'
--      AND author_role = 'student'
--      AND read_at_coach IS NULL
--      AND deleted_at IS NULL;
--
-- ============================================================
