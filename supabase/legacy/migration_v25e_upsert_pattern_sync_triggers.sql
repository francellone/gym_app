-- ============================================================
-- Migration v25e: triggers de dual-write con patrón UPSERT
-- ------------------------------------------------------------
-- Reemplaza el patrón "soft-delete + insert" de v25d por upsert
-- (UPDATE body si el mirror existe, INSERT si no). Beneficios:
--   - El id de la nota se preserva entre ediciones.
--   - updated_at se actualiza ⇒ NoteCard muestra "· editada".
--   - La burbuja no "se mueve" en el listado tras una edición
--     (mejor UX).
--
-- También habilita que el frontend permita editar/borrar notas
-- "viejas" (mirrors de workout_logs / eval test) routeando el
-- cambio a la fuente legacy: el trigger upsert preserva el id
-- del mirror, y el card en pantalla se actualiza in-place.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_sync_workout_log_to_notes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_id uuid;
  v_coach_id  uuid;
  v_mirror_id uuid;
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

  SELECT id INTO v_mirror_id
    FROM public.notes
   WHERE thread_id = v_thread_id
     AND context_type = 'workout_log' AND context_id = NEW.id
     AND author_role  = 'student'
     AND deleted_at IS NULL;

  IF v_new IS NULL THEN
    IF v_mirror_id IS NOT NULL THEN
      UPDATE public.notes SET deleted_at = now() WHERE id = v_mirror_id;
    END IF;
  ELSIF v_mirror_id IS NOT NULL THEN
    UPDATE public.notes SET body = v_new WHERE id = v_mirror_id;
  ELSE
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
  'Espeja workout_logs.notes → notes con patrón upsert (v25e).';

CREATE OR REPLACE FUNCTION public.fn_sync_eval_response_to_notes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_id   uuid;
  v_coach_id    uuid;
  v_student_id  uuid;
  v_mirror_id   uuid;
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
    SELECT id INTO v_mirror_id FROM public.notes
     WHERE thread_id = v_thread_id
       AND context_type = 'evaluation_test' AND context_id = NEW.test_id
       AND author_role  = 'student' AND visibility = 'shared'
       AND deleted_at IS NULL;
    IF v_new_student IS NULL THEN
      IF v_mirror_id IS NOT NULL THEN
        UPDATE public.notes SET deleted_at = now() WHERE id = v_mirror_id;
      END IF;
    ELSIF v_mirror_id IS NOT NULL THEN
      UPDATE public.notes SET body = v_new_student WHERE id = v_mirror_id;
    ELSE
      INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id)
      VALUES (v_thread_id, v_student_id, 'student', v_new_student, 'shared', 'evaluation_test', NEW.test_id);
    END IF;
  END IF;

  IF v_old_pub IS DISTINCT FROM v_new_pub THEN
    SELECT id INTO v_mirror_id FROM public.notes
     WHERE thread_id = v_thread_id
       AND context_type = 'evaluation_test' AND context_id = NEW.test_id
       AND author_role  = 'coach' AND visibility = 'shared'
       AND deleted_at IS NULL;
    IF v_new_pub IS NULL THEN
      IF v_mirror_id IS NOT NULL THEN
        UPDATE public.notes SET deleted_at = now() WHERE id = v_mirror_id;
      END IF;
    ELSIF v_mirror_id IS NOT NULL THEN
      UPDATE public.notes SET body = v_new_pub WHERE id = v_mirror_id;
    ELSE
      INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id)
      VALUES (v_thread_id, v_coach_id, 'coach', v_new_pub, 'shared', 'evaluation_test', NEW.test_id);
    END IF;
  END IF;

  IF v_old_priv IS DISTINCT FROM v_new_priv THEN
    SELECT id INTO v_mirror_id FROM public.notes
     WHERE thread_id = v_thread_id
       AND context_type = 'evaluation_test' AND context_id = NEW.test_id
       AND author_role  = 'coach' AND visibility = 'coach_private'
       AND deleted_at IS NULL;
    IF v_new_priv IS NULL THEN
      IF v_mirror_id IS NOT NULL THEN
        UPDATE public.notes SET deleted_at = now() WHERE id = v_mirror_id;
      END IF;
    ELSIF v_mirror_id IS NOT NULL THEN
      UPDATE public.notes SET body = v_new_priv WHERE id = v_mirror_id;
    ELSE
      INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id)
      VALUES (v_thread_id, v_coach_id, 'coach', v_new_priv, 'coach_private', 'evaluation_test', NEW.test_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_eval_response_to_notes() IS
  'Espeja evaluation_test_responses.{student_comment, coach_comment_*} → notes con patrón upsert (v25e).';
