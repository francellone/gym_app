-- ============================================================
-- v44 — La coach puede COMPLETAR una evaluación del alumno
-- ============================================================
-- Pedido de Anto (2026-09-09): "no puedo completar una evaluación desde
-- coach, no me sale la opción como sí la del entrenamiento".
--
-- La RLS ya se lo permitía (coach_manage_own_eval_results). Lo que faltaba
-- era la pantalla y, sobre todo, la AUDITORÍA: hasta hoy un resultado
-- cargado por la coach quedaba indistinguible de uno cargado por el alumno.
-- Mismo patrón que workout_logs (v33) y wellbeing_logs (v34).
--
-- Regla de Franco: la autoría no se recibe del cliente, se deriva de
-- auth.uid() en la base. Acá va por trigger (no por RPC) porque el front
-- escribe evaluation_results con tres formas distintas de upsert.
--
-- Aplicada a prod el 2026-09-09 vía Supabase MCP (backfill: 17/17 filas
-- históricas quedaron source='student', logged_by=student_id).
--
-- Semántica elegida: logged_by/source = QUIÉN ESCRIBIÓ LA FILA POR ÚLTIMA
-- VEZ, en par con updated_at. Un upsert que cae en DO UPDATE pasa por el
-- mismo trigger, así que insert y update quedan consistentes.

-- 1) Columnas de auditoría.
ALTER TABLE public.evaluation_results
  ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'student'
    CHECK (source IN ('student', 'coach'));

COMMENT ON COLUMN public.evaluation_results.logged_by IS
  'Quién escribió esta fila por última vez (auth.uid()). Lo setea el trigger trg_evaluation_results_author; no es parámetro del cliente.';
COMMENT ON COLUMN public.evaluation_results.source IS
  'student = lo cargó la persona evaluada; coach = lo cargó su coach en modo coach (v44). Derivado en la base, no falsificable.';

-- 2) Backfill: todo lo histórico lo cargó el propio alumno (antes de v44 no
--    había otra puerta). source ya quedó en 'student' por el default.
UPDATE public.evaluation_results
   SET logged_by = student_id
 WHERE logged_by IS NULL;

-- 3) Trigger de autoría derivada.
CREATE OR REPLACE FUNCTION public.fn_evaluation_results_set_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Sin auth (service_role, jobs, backfills): no inventamos autoría.
  -- Se preserva lo que ya había o se atribuye a la persona evaluada.
  IF v_caller IS NULL THEN
    NEW.logged_by := COALESCE(NEW.logged_by, NEW.student_id);
    IF TG_OP = 'UPDATE' THEN
      NEW.source := COALESCE(OLD.source, 'student');
    END IF;
    RETURN NEW;
  END IF;

  NEW.logged_by := v_caller;
  NEW.source := CASE WHEN v_caller = NEW.student_id THEN 'student' ELSE 'coach' END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_evaluation_results_author ON public.evaluation_results;
CREATE TRIGGER trg_evaluation_results_author
  BEFORE INSERT OR UPDATE ON public.evaluation_results
  FOR EACH ROW EXECUTE FUNCTION public.fn_evaluation_results_set_author();

-- 4) Notificación boomerang: si la carga la hizo la coach, no notificarle a
--    ella misma que "el alumno completó una evaluación". Mismo guard que
--    fn_notify_workout_activity desde v33.
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

  -- Modelo B: las evals basadas en ejercicios cierran por responses
  -- (fn_close_eval_when_complete). Acá solo cerramos protocolos enteros.
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

  -- v44: la eval se cierra igual, pero el aviso no se manda si lo cargó
  -- la propia coach (se auto-notificaría).
  IF NEW.source = 'coach' THEN
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION public.fn_close_eval_when_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id   uuid;
  v_plan_id      uuid;
  v_source       text;
  v_total_days   int;
  v_covered_days int;
  v_rows         int;
  v_coach_id     uuid;
  v_student_name text;
  v_clone_title  text;
  v_plan_title   text;
BEGIN
  -- v44: el source vive en el evaluation_result padre, no en la response.
  SELECT student_id, plan_id, source INTO v_student_id, v_plan_id, v_source
    FROM public.evaluation_results WHERE id = NEW.evaluation_result_id;
  IF v_student_id IS NULL THEN RETURN NEW; END IF;

  SELECT count(DISTINCT section) INTO v_total_days
    FROM public.plan_exercises WHERE plan_id = v_plan_id;

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

  -- v44: cerrada sí, notificada no, si la cargó la propia coach.
  IF v_rows > 0 AND COALESCE(v_source, 'student') <> 'coach' THEN
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
