-- ============================================================
-- Migration v25a: Notificación 'student_note' (Fase B)
-- ------------------------------------------------------------
-- Cierra la deuda D2 de la auditoría: el coach no recibía
-- notificación cuando el alumno escribía una nota. Solo le subía
-- el contador unread_for_coach del thread, lo cual implica que el
-- coach debe entrar al panel para enterarse.
--
-- Agregamos el tipo 'student_note' al CHECK enum de notifications
-- y un trigger AFTER INSERT en `notes` que inserta una notificación
-- para el coach principal cuando author_role = 'student' y la nota
-- no está soft-borrada.
--
-- Simétrico a 'coach_comment' (alumno recibe notif del coach) que
-- ya existía y fue cableado en v24.
-- ============================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'plan_assigned',
    'activity_update',
    'session_completed',
    'plan_expiring',
    'stagnation_alert',
    'coach_comment',
    'weekly_summary',
    'schema_health_alert',
    'student_note'
  ));

CREATE OR REPLACE FUNCTION public.fn_notify_student_note()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id     uuid;
  v_student_name text;
  v_excerpt      text;
BEGIN
  IF NEW.author_role <> 'student' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_coach_id := public.get_coach_id();
  IF v_coach_id IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_student_name
    FROM public.profiles WHERE id = NEW.author_id;

  v_excerpt := substring(NEW.body, 1, 140);

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_coach_id,
    'student_note',
    COALESCE(v_student_name, 'Un alumno') || ' te escribió una nota',
    v_excerpt,
    jsonb_build_object(
      'note_id',      NEW.id,
      'thread_id',    NEW.thread_id,
      'student_id',   NEW.author_id,
      'student_name', v_student_name,
      'context_type', NEW.context_type,
      'context_id',   NEW.context_id,
      'exercise_id',  NEW.exercise_id
    )
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_student_note() IS
  'Notifica al coach cuando el alumno escribe una nota compartida. v25a.';

DROP TRIGGER IF EXISTS trg_notify_student_note ON public.notes;
CREATE TRIGGER trg_notify_student_note
  AFTER INSERT ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_student_note();
