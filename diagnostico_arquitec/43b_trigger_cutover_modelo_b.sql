-- 43b — Cutover Modelo B: cerrar la evaluación cuando TODOS los días tienen datos.
-- Aplicar JUNTO con el push del front nuevo (no antes): el front viejo guarda
-- one_rm/max_reps en results.exercises jsonb SIN responses, y este modelo cierra
-- por responses. Tras el cutover, el front nuevo guarda todo exercise-based por
-- responses (plan_exercise_id), así que el cierre por responses aplica bien.
--
-- Cambios:
--  1) El cierre+notificación en INSERT de evaluation_results queda SOLO para
--     protocolos enteros (power/cardio/body_comp/scored), que guardan jsonb sin
--     responses. Para exercise-based no cierra en el insert (espera los días).
--  2) Nuevo trigger en evaluation_test_responses (AFTER INSERT): cierra+notifica
--     cuando todas las secciones-día del plan tienen ≥1 response bajo el result.
--
-- Probar con rollback (DO + RAISE EXCEPTION) antes de aplicar en prod.

BEGIN;

-- 1) result-insert: cerrar solo protocolos enteros -----------------------------
CREATE OR REPLACE FUNCTION public.fn_close_eval_on_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_id     uuid;
  v_student_name text;
  v_clone_title  text;
  v_plan_title   text;
  v_already_sent boolean;
  v_eval_type    text;
BEGIN
  SELECT eval_type INTO v_eval_type FROM public.plans WHERE id = NEW.plan_id;

  -- Modelo B: las evals basadas en ejercicios cierran por responses (ver el
  -- trigger fn_close_eval_when_complete). Acá solo cerramos los protocolos
  -- enteros, que guardan jsonb en results sin responses por ejercicio.
  IF v_eval_type IN ('one_rm','max_reps','custom','mixed') THEN
    RETURN NEW;
  END IF;

  UPDATE public.plan_assignments
     SET status            = 'completed',
         status_changed_at = now(),
         status_reason     = COALESCE(status_reason, 'auto-cierre por carga de evaluation_results')
   WHERE student_id = NEW.student_id
     AND plan_id    = NEW.plan_id
     AND plan_type  = 'evaluation'
     AND status     = 'active';

  SELECT coach_id INTO v_coach_id FROM public.profiles WHERE id = NEW.student_id;
  IF v_coach_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.notifications
       WHERE user_id = v_coach_id AND type = 'evaluation_completed'
         AND (data->>'student_id')::uuid = NEW.student_id
         AND (data->>'plan_id')::uuid    = NEW.plan_id
         AND created_at::date = CURRENT_DATE
    ) INTO v_already_sent;
    IF NOT v_already_sent THEN
      SELECT name  INTO v_student_name FROM public.profiles WHERE id = NEW.student_id;
      SELECT title INTO v_clone_title  FROM public.plans    WHERE id = NEW.plan_id;
      SELECT COALESCE(
               (SELECT pt.title FROM public.plans pc
                  JOIN public.plans pt ON pt.id = pc.cloned_from_plan_id
                 WHERE pc.id = NEW.plan_id),
               v_clone_title) INTO v_plan_title;
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_coach_id, 'evaluation_completed',
        COALESCE(v_student_name, 'Un alumno') || ' completó una evaluación',
        'Completó "' || COALESCE(v_plan_title, 'evaluación') || '". Mirá los resultados.',
        jsonb_build_object('student_id', NEW.student_id, 'student_name', v_student_name,
                           'plan_id', NEW.plan_id, 'plan_title', v_plan_title));
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) responses-complete: cerrar exercise-based al cubrir todos los días --------
CREATE OR REPLACE FUNCTION public.fn_close_eval_when_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id   uuid;
  v_plan_id      uuid;
  v_total_days   int;
  v_covered_days int;
  v_rows         int;
  v_coach_id     uuid;
  v_student_name text;
  v_clone_title  text;
  v_plan_title   text;
BEGIN
  SELECT student_id, plan_id INTO v_student_id, v_plan_id
    FROM public.evaluation_results WHERE id = NEW.evaluation_result_id;
  IF v_student_id IS NULL THEN RETURN NEW; END IF;

  SELECT count(DISTINCT section) INTO v_total_days
    FROM public.plan_exercises WHERE plan_id = v_plan_id;

  -- Si el plan usa plan_exercises, exigir que todas las secciones-día estén
  -- cubiertas. Si no (legacy sin plan_exercises), cerrar en la primera response.
  IF v_total_days > 0 THEN
    SELECT count(DISTINCT pe.section) INTO v_covered_days
      FROM public.evaluation_test_responses etr
      JOIN public.plan_exercises pe ON pe.id = etr.plan_exercise_id
     WHERE etr.evaluation_result_id = NEW.evaluation_result_id;
    IF v_covered_days < v_total_days THEN
      RETURN NEW; -- faltan días
    END IF;
  END IF;

  UPDATE public.plan_assignments
     SET status            = 'completed',
         status_changed_at = now(),
         status_reason     = COALESCE(status_reason, 'auto-cierre por evaluación completa (todos los días)')
   WHERE student_id = v_student_id
     AND plan_id    = v_plan_id
     AND plan_type  = 'evaluation'
     AND status     = 'active';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Solo notificar en la transición real (dedup natural).
  IF v_rows > 0 THEN
    SELECT coach_id INTO v_coach_id FROM public.profiles WHERE id = v_student_id;
    IF v_coach_id IS NOT NULL THEN
      SELECT name  INTO v_student_name FROM public.profiles WHERE id = v_student_id;
      SELECT title INTO v_clone_title  FROM public.plans    WHERE id = v_plan_id;
      SELECT COALESCE(
               (SELECT pt.title FROM public.plans pc
                  JOIN public.plans pt ON pt.id = pc.cloned_from_plan_id
                 WHERE pc.id = v_plan_id),
               v_clone_title) INTO v_plan_title;
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_coach_id, 'evaluation_completed',
        COALESCE(v_student_name, 'Un alumno') || ' completó una evaluación',
        'Completó "' || COALESCE(v_plan_title, 'evaluación') || '". Mirá los resultados.',
        jsonb_build_object('student_id', v_student_id, 'student_name', v_student_name,
                           'plan_id', v_plan_id, 'plan_title', v_plan_title));
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_close_eval_when_complete ON public.evaluation_test_responses;
CREATE TRIGGER trg_close_eval_when_complete
  AFTER INSERT ON public.evaluation_test_responses
  FOR EACH ROW EXECUTE FUNCTION public.fn_close_eval_when_complete();

COMMIT;
