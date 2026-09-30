-- v68 — Registro libre ("hoy hice esto") y lectura de planes propios de la persona por su coach
--
-- El registro libre vive en un plan implícito por persona (plans.plan_type = 'free').
-- NO se asigna (no hay plan_assignments), así que ninguna vista basada en el plan
-- activo (Hoy, tildes, cumplimiento, vencimiento, informe) lo ve. Historial y
-- Progreso, que leen workout_logs, sí lo ven. Cada ejercicio usado entra una sola
-- vez al plan, así el autocompletado con "lo de la última vez" funciona igual.

-- 1. Tipo de plan 'free' + uno solo por persona
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_plan_type_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_plan_type_check
  CHECK (plan_type = ANY (ARRAY['training'::text, 'evaluation'::text, 'free'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS plans_one_free_per_owner
  ON public.plans (created_by) WHERE plan_type = 'free';

-- 2. RPC: asegura plan libre + plan_exercise para un ejercicio visible
CREATE OR REPLACE FUNCTION public.free_plan_exercise(p_exercise_id uuid)
RETURNS TABLE (plan_id uuid, plan_exercise_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE v_me uuid := auth.uid(); v_plan uuid; v_pe uuid; v_ex public.exercises;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Requiere sesión' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_ex FROM public.exercises e WHERE e.id = p_exercise_id;
  IF v_ex.id IS NULL OR NOT (
       v_ex.created_by = v_me
    OR (public.catalog_reader(v_me) AND public.catalog_contributes(v_ex.created_by))
    OR v_ex.id IN (SELECT public.my_plan_exercise_ids())
  ) THEN
    RAISE EXCEPTION 'Ejercicio no disponible' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.id INTO v_plan FROM public.plans p WHERE p.created_by = v_me AND p.plan_type = 'free';
  IF v_plan IS NULL THEN
    INSERT INTO public.plans (title, plan_type, is_template, created_by)
    VALUES ('Registro libre', 'free', false, v_me)
    ON CONFLICT (created_by) WHERE plan_type = 'free' DO UPDATE SET updated_at = now()
    RETURNING id INTO v_plan;
  END IF;

  SELECT pe.id INTO v_pe FROM public.plan_exercises pe
   WHERE pe.plan_id = v_plan AND pe.exercise_id = p_exercise_id
   ORDER BY pe.created_at LIMIT 1;
  IF v_pe IS NULL THEN
    INSERT INTO public.plan_exercises (plan_id, exercise_id, section, order_index, exercise_mode)
    VALUES (v_plan, p_exercise_id, 'free',
            (SELECT coalesce(max(x.order_index), 0) + 1 FROM public.plan_exercises x WHERE x.plan_id = v_plan),
            'reps')
    RETURNING id INTO v_pe;
  END IF;

  plan_id := v_plan; plan_exercise_id := v_pe;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.free_plan_exercise(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.free_plan_exercise(uuid) TO authenticated;

-- 3. save_workout_log: el ejercicio tiene que ser del plan indicado, y el plan
--    asignado a la persona o armado por ella (hoy no se validaba).
DO $$
DECLARE v_def text; v_old text := $o$  IF p_weight_mode NOT IN ('with_weight', 'barbell_only', 'bodyweight') THEN$o$;
BEGIN
  v_def := pg_get_functiondef('public.save_workout_log'::regproc);
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'v68: texto no encontrado en save_workout_log'; END IF;
  v_def := replace(v_def, v_old, $n$  IF NOT EXISTS (
    SELECT 1 FROM public.plan_exercises pe
      JOIN public.plans p ON p.id = pe.plan_id
     WHERE pe.id = p_plan_exercise_id AND pe.plan_id = p_plan_id
       AND (p.created_by = p_student_id
            OR EXISTS (SELECT 1 FROM public.plan_assignments pa
                        WHERE pa.plan_id = p.id AND pa.student_id = p_student_id))
  ) THEN
    RAISE EXCEPTION 'El ejercicio no pertenece a un plan de esta persona'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
$n$ || v_old);
  EXECUTE v_def;
END $$;

-- 4. La coach lee (no edita) los planes que arma su persona y su registro libre.
--    Conjunto calculado una vez (SETOF), no función por fila (lección v62b).
CREATE OR REPLACE FUNCTION public.my_students_own_plan_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id FROM public.plans p
    JOIN public.profiles s ON s.id = p.created_by
   WHERE s.coach_id = auth.uid() AND public.is_coach();
$$;
REVOKE ALL ON FUNCTION public.my_students_own_plan_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_students_own_plan_ids() TO authenticated;

CREATE POLICY coach_view_students_own_plans ON public.plans FOR SELECT TO authenticated
  USING (id IN (SELECT public.my_students_own_plan_ids()));
CREATE POLICY coach_view_students_own_plan_exercises ON public.plan_exercises FOR SELECT TO authenticated
  USING (plan_id IN (SELECT public.my_students_own_plan_ids()));
CREATE POLICY coach_view_students_own_plan_blocks ON public.plan_blocks FOR SELECT TO authenticated
  USING (plan_id IN (SELECT public.my_students_own_plan_ids()));

DO $$
DECLARE v_def text; v_old text := $o$       AND (p.created_by = auth.uid()$o$;
BEGIN
  v_def := pg_get_functiondef('public.my_plan_exercise_ids'::regproc);
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'v68: texto no encontrado en my_plan_exercise_ids'; END IF;
  v_def := replace(v_def, v_old, v_old || $n$ OR public.is_coach_of(p.created_by)$n$);
  EXECUTE v_def;
END $$;
