-- ============================================================
-- Migration v26e: re-unread al editar el body
-- ------------------------------------------------------------
-- Bug observado en producción 2026-05-17: cuando el alumno edita
-- su nota (UPDATE OF body en `notes`), el receptor (coach) la ve
-- con el body actualizado pero NO marcada como "nueva" porque:
--   - read_at_coach quedó seteado de la lectura previa.
--   - notes_bump_thread no se disparaba en UPDATE OF body.
--
-- Fix:
--   1) Trigger BEFORE UPDATE OF body: si el body cambió, resetea
--      read_at del receptor (no del autor).
--   2) notes_bump_thread escucha UPDATE OF body y maneja el caso
--      de "re-unread" (read_at_X pasando de no-NULL a NULL)
--      incrementando el contador.
--   3) También actualiza last_message_at en edits.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notes_reset_read_on_body_edit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.body IS NOT DISTINCT FROM NEW.body THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.author_role = 'student' THEN
    NEW.read_at_coach := NULL;
  ELSIF NEW.author_role = 'coach' AND NEW.visibility = 'shared' THEN
    NEW.read_at_student := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notes_reset_read_on_body_edit() IS
  'Resetea read_at del receptor cuando se edita el body. v26e.';

DROP TRIGGER IF EXISTS trg_notes_reset_read_on_body_edit ON public.notes;
CREATE TRIGGER trg_notes_reset_read_on_body_edit
  BEFORE UPDATE OF body ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_reset_read_on_body_edit();

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

    IF OLD.read_at_coach IS NOT NULL AND NEW.read_at_coach IS NULL
       AND NEW.author_role='student' AND NEW.deleted_at IS NULL THEN
      UPDATE public.note_threads
         SET unread_for_coach = unread_for_coach + 1, updated_at = now()
       WHERE id = NEW.thread_id;
    END IF;

    IF OLD.read_at_student IS NULL AND NEW.read_at_student IS NOT NULL
       AND NEW.author_role='coach' AND NEW.visibility='shared' AND NEW.deleted_at IS NULL THEN
      UPDATE public.note_threads
         SET unread_for_student = GREATEST(unread_for_student - 1, 0), updated_at = now()
       WHERE id = NEW.thread_id;
    END IF;

    IF OLD.read_at_student IS NOT NULL AND NEW.read_at_student IS NULL
       AND NEW.author_role='coach' AND NEW.visibility='shared' AND NEW.deleted_at IS NULL THEN
      UPDATE public.note_threads
         SET unread_for_student = unread_for_student + 1, updated_at = now()
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

    IF OLD.body IS DISTINCT FROM NEW.body AND NEW.deleted_at IS NULL THEN
      UPDATE public.note_threads
         SET last_message_at = now(), updated_at = now()
       WHERE id = NEW.thread_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notes_bump_thread_upd ON public.notes;
CREATE TRIGGER trg_notes_bump_thread_upd
  AFTER UPDATE OF read_at_coach, read_at_student, deleted_at, body ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_bump_thread();
