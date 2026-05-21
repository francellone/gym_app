-- ============================================================
-- Migration v25d: dual-write triggers (Fase C)
-- ------------------------------------------------------------
-- Espeja las escrituras de campos legacy hacia la tabla `notes`
-- sin tocar la UI existente (TodayWorkoutPage, EvalWorkoutPage,
-- StudentEvaluationsTab). Cuando el alumno o el coach guardan
-- una nota en los campos viejos, los triggers replican al panel.
--
-- Alcance:
--   1) workout_logs.notes               (alumno → coach)
--   2) evaluation_test_responses.student_comment       (alumno → coach)
--   3) evaluation_test_responses.coach_comment_public  (coach → alumno)
--   4) evaluation_test_responses.coach_comment_private (coach, privada)
--
-- Diseño:
--   - Trigger AFTER INSERT OR UPDATE OF <columna>.
--   - Si el contenido no cambió (`IS NOT DISTINCT FROM`), no-op.
--   - Si cambió: soft-delete cualquier nota mirror previa
--     (scope: thread + context + author_role + visibility) e insert
--     una nueva si el nuevo contenido no es vacío.
--   - Idempotencia: una sola nota viva por (thread, context, author).
--
-- También actualiza `notes_bump_thread` para que decremente el
-- contador de no-leídas cuando una nota previamente unread se
-- soft-deletea (de otra forma el counter quedaría inflado).
--
-- Fuera del alcance (deuda explícita):
--   - workout_block_logs.notes (sin UI hoy)
--   - workout_sessions.{day}_notes (decisión session_day pendiente)
--   - profiles.observations / coach_notes (Fase D, UI replacement)
-- ============================================================

CREATE OR REPLACE FUNCTION public.notes_bump_thread()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.note_threads
       SET last_message_at = NEW.created_at,
           updated_at      = now(),
           unread_for_student = unread_for_student
                              + CASE WHEN NEW.author_role='coach' AND NEW.visibility='shared'
                                          AND NEW.deleted_at IS NULL THEN 1 ELSE 0 END,
           unread_for_coach   = unread_for_coach
                              + CASE WHEN NEW.author_role='student' AND NEW.deleted_at IS NULL
                                          THEN 1 ELSE 0 END
     WHERE id = NEW.thread_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.read_at_coach IS NULL AND NEW.read_at_coach IS NOT NULL
       AND NEW.author_role='student' AND NEW.deleted_at IS NULL THEN
      UPDATE public.note_threads
         SET unread_for_coach = GREATEST(unread_for_coach - 1, 0), updated_at = now()
       WHERE id = NEW.thread_id;
    END IF;

    IF OLD.read_at_student IS NULL AND NEW.read_at_student IS NOT NULL
       AND NEW.author_role='coach' AND NEW.visibility='shared' AND NEW.deleted_at IS NULL THEN
      UPDATE public.note_threads
         SET unread_for_student = GREATEST(unread_for_student - 1, 0), updated_at = now()
       WHERE id = NEW.thread_id;
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      IF NEW.author_role = 'student' AND NEW.read_at_coach IS NULL THEN
        UPDATE public.note_threads
           SET unread_for_coach = GREATEST(unread_for_coach - 1, 0), updated_at = now()
         WHERE id = NEW.thread_id;
      ELSIF NEW.author_role = 'coach' AND NEW.visibility = 'shared'
            AND NEW.read_at_student IS NULL THEN
        UPDATE public.note_threads
           SET unread_for_student = GREATEST(unread_for_student - 1, 0), updated_at = now()
         WHERE id = NEW.thread_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notes_bump_thread_upd ON public.notes;
CREATE TRIGGER trg_notes_bump_thread_upd
  AFTER UPDATE OF read_at_coach, read_at_student, deleted_at ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_bump_thread();

-- workout_logs.notes → notes
CREATE OR REPLACE FUNCTION public.fn_sync_workout_log_to_notes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_id uuid;
  v_coach_id  uuid;
  v_old       text;
  v_new       text;
BEGIN
  v_new := NULLIF(trim(NEW.notes), '');
  v_old := CASE WHEN TG_OP = 'UPDATE' THEN NULLIF(trim(OLD.notes), '') ELSE NULL END;
  IF v_old IS NOT DISTINCT FROM v_new THEN RETURN NEW; END IF;

  v_coach_id := public.get_coach_id();
  IF v_coach_id IS NULL THEN RETURN NEW; END IF;
  v_thread_id := public.notes_get_or_create_thread(v_coach_id, NEW.student_id);
  IF v_thread_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.notes SET deleted_at = now()
   WHERE thread_id = v_thread_id
     AND context_type = 'workout_log' AND context_id = NEW.id
     AND author_role  = 'student'
     AND deleted_at IS NULL;

  IF v_new IS NOT NULL THEN
    INSERT INTO public.notes (
      thread_id, author_id, author_role, body, visibility,
      context_type, context_id
    )
    VALUES (
      v_thread_id, NEW.student_id, 'student', v_new, 'shared',
      'workout_log', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_workout_log_to_notes() IS
  'Espeja workout_logs.notes → notes. Una nota viva por workout_log. v25d.';

DROP TRIGGER IF EXISTS trg_sync_workout_log_to_notes ON public.workout_logs;
CREATE TRIGGER trg_sync_workout_log_to_notes
  AFTER INSERT OR UPDATE OF notes ON public.workout_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_workout_log_to_notes();

-- evaluation_test_responses.* → notes
CREATE OR REPLACE FUNCTION public.fn_sync_eval_response_to_notes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_id   uuid;
  v_coach_id    uuid;
  v_student_id  uuid;
  v_old_student text; v_new_student text;
  v_old_pub     text; v_new_pub     text;
  v_old_priv    text; v_new_priv    text;
BEGIN
  SELECT er.student_id INTO v_student_id
    FROM public.evaluation_results er
   WHERE er.id = NEW.evaluation_result_id;
  IF v_student_id IS NULL THEN RETURN NEW; END IF;

  v_coach_id := public.get_coach_id();
  IF v_coach_id IS NULL THEN RETURN NEW; END IF;
  v_thread_id := public.notes_get_or_create_thread(v_coach_id, v_student_id);

  v_new_student := NULLIF(trim(NEW.student_comment), '');
  v_new_pub     := NULLIF(trim(NEW.coach_comment_public), '');
  v_new_priv    := NULLIF(trim(NEW.coach_comment_private), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_student := NULLIF(trim(OLD.student_comment), '');
    v_old_pub     := NULLIF(trim(OLD.coach_comment_public), '');
    v_old_priv    := NULLIF(trim(OLD.coach_comment_private), '');
  END IF;

  IF v_old_student IS DISTINCT FROM v_new_student THEN
    UPDATE public.notes SET deleted_at = now()
     WHERE thread_id = v_thread_id
       AND context_type = 'evaluation_test' AND context_id = NEW.test_id
       AND author_role  = 'student' AND visibility = 'shared'
       AND deleted_at IS NULL;
    IF v_new_student IS NOT NULL THEN
      INSERT INTO public.notes (
        thread_id, author_id, author_role, body, visibility,
        context_type, context_id
      )
      VALUES (
        v_thread_id, v_student_id, 'student', v_new_student, 'shared',
        'evaluation_test', NEW.test_id
      );
    END IF;
  END IF;

  IF v_old_pub IS DISTINCT FROM v_new_pub THEN
    UPDATE public.notes SET deleted_at = now()
     WHERE thread_id = v_thread_id
       AND context_type = 'evaluation_test' AND context_id = NEW.test_id
       AND author_role  = 'coach' AND visibility = 'shared'
       AND deleted_at IS NULL;
    IF v_new_pub IS NOT NULL THEN
      INSERT INTO public.notes (
        thread_id, author_id, author_role, body, visibility,
        context_type, context_id
      )
      VALUES (
        v_thread_id, v_coach_id, 'coach', v_new_pub, 'shared',
        'evaluation_test', NEW.test_id
      );
    END IF;
  END IF;

  IF v_old_priv IS DISTINCT FROM v_new_priv THEN
    UPDATE public.notes SET deleted_at = now()
     WHERE thread_id = v_thread_id
       AND context_type = 'evaluation_test' AND context_id = NEW.test_id
       AND author_role  = 'coach' AND visibility = 'coach_private'
       AND deleted_at IS NULL;
    IF v_new_priv IS NOT NULL THEN
      INSERT INTO public.notes (
        thread_id, author_id, author_role, body, visibility,
        context_type, context_id
      )
      VALUES (
        v_thread_id, v_coach_id, 'coach', v_new_priv, 'coach_private',
        'evaluation_test', NEW.test_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_eval_response_to_notes() IS
  'Espeja evaluation_test_responses.{student_comment, coach_comment_*} → notes. v25d.';

DROP TRIGGER IF EXISTS trg_sync_eval_response_to_notes ON public.evaluation_test_responses;
CREATE TRIGGER trg_sync_eval_response_to_notes
  AFTER INSERT OR UPDATE OF student_comment, coach_comment_public, coach_comment_private
  ON public.evaluation_test_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_eval_response_to_notes();
