-- ============================================================
-- Migration v26c: D5 — context_id de eval pasa a response.id
-- ------------------------------------------------------------
-- Cierra deuda D5: el trigger v25e seteaba context_id = test_id, lo
-- cual era ambiguo cuando un alumno tenía varias evaluation_results
-- con el mismo test (las 3 notas — student_comment, coach_pub,
-- coach_priv — colapsaban al mismo context_id).
--
-- Fix: context_id pasa a ser evaluation_test_responses.id. Esto:
--   1) Da un mapping 1:1 nota ↔ respuesta.
--   2) Permite que el frontend edite/borre una nota eval desde el
--      panel: con response.id sabe a qué row updatear (y la columna
--      la elige según author_role + visibility de la nota).
--
-- No requiere backfill: hoy hay 0 notas con context_type='evaluation_test'.
-- ============================================================

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
       AND context_type = 'evaluation_test' AND context_id = NEW.id
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
      VALUES (v_thread_id, v_student_id, 'student', v_new_student, 'shared', 'evaluation_test', NEW.id);
    END IF;
  END IF;

  IF v_old_pub IS DISTINCT FROM v_new_pub THEN
    SELECT id INTO v_mirror_id FROM public.notes
     WHERE thread_id = v_thread_id
       AND context_type = 'evaluation_test' AND context_id = NEW.id
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
      VALUES (v_thread_id, v_coach_id, 'coach', v_new_pub, 'shared', 'evaluation_test', NEW.id);
    END IF;
  END IF;

  IF v_old_priv IS DISTINCT FROM v_new_priv THEN
    SELECT id INTO v_mirror_id FROM public.notes
     WHERE thread_id = v_thread_id
       AND context_type = 'evaluation_test' AND context_id = NEW.id
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
      VALUES (v_thread_id, v_coach_id, 'coach', v_new_priv, 'coach_private', 'evaluation_test', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_eval_response_to_notes() IS
  'Espeja evaluation_test_responses.* → notes con context_id = response.id (v26c, era test_id en v25e).';

CREATE OR REPLACE FUNCTION public.notes_resolve_context()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exercise_id   uuid;
  v_muscle_group  text;
  v_block_type    text;
  v_note_date     date;
BEGIN
  v_exercise_id := NULL; v_muscle_group := NULL; v_block_type := NULL; v_note_date := NULL;

  IF NEW.context_type = 'free' THEN
    NEW.exercise_id := NULL;
    NEW.block_type  := NULL;
    RETURN NEW;

  ELSIF NEW.context_type = 'workout_log' THEN
    SELECT pe.exercise_id, pb.block_type, wl.logged_date
      INTO v_exercise_id, v_block_type, v_note_date
      FROM public.workout_logs wl
      JOIN public.plan_exercises pe ON pe.id = wl.plan_exercise_id
      LEFT JOIN public.plan_blocks pb ON pb.id = pe.block_id
     WHERE wl.id = NEW.context_id;

  ELSIF NEW.context_type = 'workout_block_log' THEN
    SELECT pb.block_type, wbl.logged_date
      INTO v_block_type, v_note_date
      FROM public.workout_block_logs wbl
      JOIN public.plan_blocks pb ON pb.id = wbl.plan_block_id
     WHERE wbl.id = NEW.context_id;

  ELSIF NEW.context_type = 'plan_exercise' THEN
    SELECT pe.exercise_id, pb.block_type INTO v_exercise_id, v_block_type
      FROM public.plan_exercises pe
      LEFT JOIN public.plan_blocks pb ON pb.id = pe.block_id
     WHERE pe.id = NEW.context_id;

  ELSIF NEW.context_type = 'evaluation_test' THEN
    -- v26c: context_id ahora es response.id, no test_id.
    SELECT et.exercise_id INTO v_exercise_id
      FROM public.evaluation_test_responses etr
      JOIN public.evaluation_tests et ON et.id = etr.test_id
     WHERE etr.id = NEW.context_id;

  ELSIF NEW.context_type = 'exercise' THEN
    v_exercise_id := NEW.context_id;
  END IF;

  IF v_exercise_id IS NOT NULL THEN
    SELECT e.muscle_group INTO v_muscle_group
      FROM public.exercises e WHERE e.id = v_exercise_id;
  END IF;

  NEW.exercise_id  := v_exercise_id;
  NEW.muscle_group := v_muscle_group;
  NEW.block_type   := v_block_type;
  NEW.note_date    := v_note_date;
  RETURN NEW;
END;
$$;
