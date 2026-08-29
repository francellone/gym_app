-- ============================================================
-- v39 — Fundamento %RM + fix de clonado (weight_mode/unilateral)
-- ------------------------------------------------------------
-- 1) Columnas nuevas (TODO ADITIVO, sin renames):
--    plan_exercises.pct_1rm                  % del 1RM prescripto (los KILOS nunca
--                                            se inscriben: se derivan 1RM × % al mostrar)
--    plan_exercises.rm_reference_exercise_id tomar el % del máximo de OTRO ejercicio
--                                            (ej: estocada al 50% del máx de sentadilla)
--    plan_blocks.default_pct_1rm             atajo "todo el circuito al X%" (hereda a
--                                            los ejercicios; pisable por ejercicio)
-- 2) weight_mode acepta el 4º modo 'pct_1rm' (plan_exercises y workout_logs).
--    exercises.default_weight_mode NO se toca: el %RM es prescripción por plan,
--    no default de catálogo.
-- 3) FIX BUG EXISTENTE: assign_template_to_student NO clonaba weight_mode ni
--    unilateral de plan_exercises → los overrides por ejercicio se perdían en
--    silencio al asignar. migrate_assignment_off_template además no clonaba
--    los campos eval_*. Ambas RPC quedan a paridad de columnas.
-- REGLA (memoria block-model-impact-analysis): toda columna nueva de
-- plan_blocks/plan_exercises DEBE sumarse a las listas explícitas de estas RPC.
-- ============================================================

-- ── 1) Columnas nuevas ──────────────────────────────────────
ALTER TABLE public.plan_exercises
  ADD COLUMN IF NOT EXISTS pct_1rm numeric,
  ADD COLUMN IF NOT EXISTS rm_reference_exercise_id uuid
    REFERENCES public.exercises(id) ON DELETE SET NULL;

ALTER TABLE public.plan_blocks
  ADD COLUMN IF NOT EXISTS default_pct_1rm numeric;

CREATE INDEX IF NOT EXISTS idx_plan_exercises_rm_reference
  ON public.plan_exercises(rm_reference_exercise_id)
  WHERE rm_reference_exercise_id IS NOT NULL;

ALTER TABLE public.plan_exercises
  DROP CONSTRAINT IF EXISTS plan_exercises_pct_1rm_range;
ALTER TABLE public.plan_exercises
  ADD CONSTRAINT plan_exercises_pct_1rm_range
  CHECK (pct_1rm IS NULL OR (pct_1rm > 0 AND pct_1rm <= 200));

ALTER TABLE public.plan_blocks
  DROP CONSTRAINT IF EXISTS plan_blocks_default_pct_1rm_range;
ALTER TABLE public.plan_blocks
  ADD CONSTRAINT plan_blocks_default_pct_1rm_range
  CHECK (default_pct_1rm IS NULL OR (default_pct_1rm > 0 AND default_pct_1rm <= 200));

COMMENT ON COLUMN public.plan_exercises.pct_1rm IS
  '% del 1RM prescripto (weight_mode=pct_1rm). Los kilos se derivan al mostrar: 1RM del alumno × %. Nunca inscribir kilos calculados (auto-progresión).';
COMMENT ON COLUMN public.plan_exercises.rm_reference_exercise_id IS
  'Opcional: resolver el % contra el 1RM de OTRO ejercicio (ej: estocada al % del máx de sentadilla). Cadena: eval propia → eval del ejercicio de referencia → mostrar % pelado.';
COMMENT ON COLUMN public.plan_blocks.default_pct_1rm IS
  'Atajo del coach a nivel bloque (circuito): "todo el circuito al X%". Hereda a los ejercicios del bloque; pisable por ejercicio con plan_exercises.pct_1rm.';

-- ── 2) weight_mode += pct_1rm ───────────────────────────────
ALTER TABLE public.plan_exercises
  DROP CONSTRAINT IF EXISTS plan_exercises_weight_mode_check;
ALTER TABLE public.plan_exercises
  ADD CONSTRAINT plan_exercises_weight_mode_check
  CHECK (weight_mode IS NULL OR weight_mode = ANY
    (ARRAY['with_weight'::text, 'barbell_only'::text, 'bodyweight'::text, 'pct_1rm'::text]));

ALTER TABLE public.workout_logs
  DROP CONSTRAINT IF EXISTS workout_logs_weight_mode_check;
ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_weight_mode_check
  CHECK (weight_mode = ANY
    (ARRAY['with_weight'::text, 'barbell_only'::text, 'bodyweight'::text, 'pct_1rm'::text]));

-- ── 3) RPC assign_template_to_student (clonado completo) ────
CREATE OR REPLACE FUNCTION public.assign_template_to_student(
  p_template_id uuid,
  p_student_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT NULL::date,
  p_schedule_mode text DEFAULT 'flexible'::text,
  p_preferred_days jsonb DEFAULT NULL::jsonb,
  p_linked_assignment_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_plan_id       uuid := gen_random_uuid();
  v_new_assignment_id uuid;
  v_student_name      text;
  v_is_template       boolean;
  v_block_map         jsonb;
  v_ex_map            jsonb;
  v_creator           uuid;
BEGIN
  SELECT is_template INTO v_is_template FROM public.plans WHERE id = p_template_id;
  IF v_is_template IS NULL THEN
    RAISE EXCEPTION 'Plan % no existe', p_template_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_is_template = false THEN
    RAISE EXCEPTION 'Plan % no es una plantilla (is_template=false). Usá INSERT directo para asignar una instancia.', p_template_id USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(trim(name), ''), email) INTO v_student_name
    FROM public.profiles WHERE id = p_student_id AND role = 'student';
  IF v_student_name IS NULL THEN
    RAISE EXCEPTION 'Alumno % no existe o no tiene role=student', p_student_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_creator := COALESCE(auth.uid(), (SELECT created_by FROM public.plans WHERE id = p_template_id));

  INSERT INTO public.plans (
    id, title, description, goal, sessions_per_week, duration_weeks,
    is_template, created_by, plan_type, eval_type, eval_method,
    has_activation, eval_tags, cloned_from_plan_id
  )
  SELECT
    v_new_plan_id,
    trim(both ' ' from COALESCE(p.title, 'Sin nombre')) || ' — ' || v_student_name,
    COALESCE(NULLIF(p.description, ''), '') ||
      CASE WHEN COALESCE(NULLIF(p.description, ''), '') = '' THEN '' ELSE E'\n\n' END ||
      '[Clonado de "' || trim(both ' ' from COALESCE(p.title, '')) ||
      '" (template_id=' || p.id::text || ') el ' || current_date::text ||
      ' — instancia personal del alumno]',
    p.goal, p.sessions_per_week, p.duration_weeks,
    false, v_creator,
    p.plan_type, p.eval_type, p.eval_method,
    p.has_activation, p.eval_tags, p_template_id
  FROM public.plans p WHERE p.id = p_template_id;

  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_block_map FROM public.plan_blocks WHERE plan_id = p_template_id;

  INSERT INTO public.plan_blocks (
    id, plan_id, section, block_type, order_index, title, notes,
    aerobic_format, aerobic_total_minutes, aerobic_intensity,
    aerobic_work_seconds, aerobic_rest_seconds, aerobic_rounds,
    aerobic_expected_sensation, circuit_type, circuit_work_seconds,
    circuit_rest_seconds, circuit_rounds, circuit_total_minutes,
    circuit_intensity, aerobic_zone, default_pct_1rm
  )
  SELECT
    (v_block_map->>(pb.id::text))::uuid, v_new_plan_id,
    pb.section, pb.block_type, pb.order_index, pb.title, pb.notes,
    pb.aerobic_format, pb.aerobic_total_minutes, pb.aerobic_intensity,
    pb.aerobic_work_seconds, pb.aerobic_rest_seconds, pb.aerobic_rounds,
    pb.aerobic_expected_sensation, pb.circuit_type, pb.circuit_work_seconds,
    pb.circuit_rest_seconds, pb.circuit_rounds, pb.circuit_total_minutes,
    pb.circuit_intensity, pb.aerobic_zone, pb.default_pct_1rm
  FROM public.plan_blocks pb WHERE pb.plan_id = p_template_id;

  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_ex_map FROM public.plan_exercises WHERE plan_id = p_template_id;

  INSERT INTO public.plan_exercises (
    id, plan_id, exercise_id, section, block_label, order_index,
    suggested_sets, suggested_reps, suggested_weight, rest_time,
    suggested_pse, extra_notes, suggested_weights, block_id,
    exercise_mode, duration_seconds,
    weight_mode, unilateral,
    pct_1rm, rm_reference_exercise_id,
    eval_type, eval_method, expected_value, expected_unit, mandatory, instructions
  )
  SELECT
    (v_ex_map->>(pe.id::text))::uuid, v_new_plan_id,
    pe.exercise_id, pe.section, pe.block_label, pe.order_index,
    pe.suggested_sets, pe.suggested_reps, pe.suggested_weight, pe.rest_time,
    pe.suggested_pse, pe.extra_notes, pe.suggested_weights,
    CASE WHEN pe.block_id IS NOT NULL AND v_block_map ? pe.block_id::text
         THEN (v_block_map->>(pe.block_id::text))::uuid ELSE NULL END,
    pe.exercise_mode, pe.duration_seconds,
    pe.weight_mode, pe.unilateral,
    pe.pct_1rm, pe.rm_reference_exercise_id,
    pe.eval_type, pe.eval_method, pe.expected_value, pe.expected_unit, pe.mandatory, pe.instructions
  FROM public.plan_exercises pe WHERE pe.plan_id = p_template_id;

  INSERT INTO public.evaluation_tests (
    plan_id, exercise_id, exercise_name, test_type, instructions,
    expected_value, expected_unit, mandatory, order_index
  )
  SELECT
    v_new_plan_id, et.exercise_id, et.exercise_name, et.test_type, et.instructions,
    et.expected_value, et.expected_unit, et.mandatory, et.order_index
  FROM public.evaluation_tests et WHERE et.plan_id = p_template_id;

  INSERT INTO public.plan_assignments (
    student_id, plan_id, start_date, end_date,
    schedule_mode, preferred_days, linked_assignment_id
  )
  VALUES (
    p_student_id, v_new_plan_id, p_start_date, p_end_date,
    p_schedule_mode, p_preferred_days, p_linked_assignment_id
  )
  RETURNING id INTO v_new_assignment_id;

  RETURN jsonb_build_object(
    'assignment_id', v_new_assignment_id, 'plan_id', v_new_plan_id,
    'template_id', p_template_id, 'student_id', p_student_id
  );
END;
$function$;

-- ── 4) RPC migrate_assignment_off_template (paridad total) ──
CREATE OR REPLACE FUNCTION public.migrate_assignment_off_template(p_assignment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_plan_id  uuid;
  v_new_plan_id  uuid := gen_random_uuid();
  v_student_id   uuid;
  v_student_name text;
  v_block_map    jsonb;
  v_ex_map       jsonb;
BEGIN
  SELECT pa.plan_id, pa.student_id
    INTO v_old_plan_id, v_student_id
    FROM public.plan_assignments pa
    JOIN public.plans p ON p.id = pa.plan_id
   WHERE pa.id = p_assignment_id
     AND p.is_template = true;

  IF v_old_plan_id IS NULL THEN
    RAISE EXCEPTION 'Assignment % no existe o no apunta a una plantilla', p_assignment_id;
  END IF;

  SELECT COALESCE(NULLIF(trim(name), ''), email)
    INTO v_student_name
    FROM public.profiles WHERE id = v_student_id;

  INSERT INTO public.plans (
    id, title, description, goal, sessions_per_week, duration_weeks,
    is_template, created_by, plan_type, eval_type, eval_method,
    has_activation, eval_tags
  )
  SELECT
    v_new_plan_id,
    trim(both ' ' from COALESCE(p.title, 'Sin nombre')) || ' — ' || v_student_name,
    COALESCE(NULLIF(p.description, ''), '') ||
      CASE WHEN COALESCE(NULLIF(p.description, ''), '') = '' THEN '' ELSE E'\n\n' END ||
      '[Clonado de "' || trim(both ' ' from COALESCE(p.title, '')) ||
      '" (template_id=' || p.id::text ||
      ') el ' || current_date::text ||
      ' — instancia personal del alumno]',
    p.goal, p.sessions_per_week, p.duration_weeks,
    false,
    p.created_by, p.plan_type, p.eval_type, p.eval_method,
    p.has_activation, p.eval_tags
  FROM public.plans p
  WHERE p.id = v_old_plan_id;

  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_block_map
    FROM public.plan_blocks
   WHERE plan_id = v_old_plan_id;

  INSERT INTO public.plan_blocks (
    id, plan_id, section, block_type, order_index, title, notes,
    aerobic_format, aerobic_total_minutes, aerobic_intensity,
    aerobic_work_seconds, aerobic_rest_seconds, aerobic_rounds,
    aerobic_expected_sensation, circuit_type, circuit_work_seconds,
    circuit_rest_seconds, circuit_rounds, circuit_total_minutes,
    circuit_intensity, aerobic_zone, default_pct_1rm
  )
  SELECT
    (v_block_map->>(pb.id::text))::uuid,
    v_new_plan_id,
    pb.section, pb.block_type, pb.order_index, pb.title, pb.notes,
    pb.aerobic_format, pb.aerobic_total_minutes, pb.aerobic_intensity,
    pb.aerobic_work_seconds, pb.aerobic_rest_seconds, pb.aerobic_rounds,
    pb.aerobic_expected_sensation, pb.circuit_type, pb.circuit_work_seconds,
    pb.circuit_rest_seconds, pb.circuit_rounds, pb.circuit_total_minutes,
    pb.circuit_intensity, pb.aerobic_zone, pb.default_pct_1rm
  FROM public.plan_blocks pb
  WHERE pb.plan_id = v_old_plan_id;

  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_ex_map
    FROM public.plan_exercises
   WHERE plan_id = v_old_plan_id;

  INSERT INTO public.plan_exercises (
    id, plan_id, exercise_id, section, block_label, order_index,
    suggested_sets, suggested_reps, suggested_weight, rest_time,
    suggested_pse, extra_notes, suggested_weights, block_id,
    exercise_mode, duration_seconds,
    weight_mode, unilateral,
    pct_1rm, rm_reference_exercise_id,
    eval_type, eval_method, expected_value, expected_unit, mandatory, instructions
  )
  SELECT
    (v_ex_map->>(pe.id::text))::uuid,
    v_new_plan_id,
    pe.exercise_id, pe.section, pe.block_label, pe.order_index,
    pe.suggested_sets, pe.suggested_reps, pe.suggested_weight, pe.rest_time,
    pe.suggested_pse, pe.extra_notes, pe.suggested_weights,
    CASE
      WHEN pe.block_id IS NOT NULL AND v_block_map ? pe.block_id::text
        THEN (v_block_map->>(pe.block_id::text))::uuid
      ELSE NULL
    END,
    pe.exercise_mode, pe.duration_seconds,
    pe.weight_mode, pe.unilateral,
    pe.pct_1rm, pe.rm_reference_exercise_id,
    pe.eval_type, pe.eval_method, pe.expected_value, pe.expected_unit, pe.mandatory, pe.instructions
  FROM public.plan_exercises pe
  WHERE pe.plan_id = v_old_plan_id;

  UPDATE public.workout_logs wl
     SET plan_id = v_new_plan_id,
         plan_exercise_id = CASE
           WHEN wl.plan_exercise_id IS NOT NULL AND v_ex_map ? wl.plan_exercise_id::text
             THEN (v_ex_map->>(wl.plan_exercise_id::text))::uuid
           ELSE wl.plan_exercise_id
         END
   WHERE wl.student_id = v_student_id
     AND wl.plan_id = v_old_plan_id;

  UPDATE public.workout_sessions
     SET plan_id = v_new_plan_id
   WHERE student_id = v_student_id
     AND plan_id = v_old_plan_id;

  UPDATE public.workout_block_logs wbl
     SET plan_id = v_new_plan_id,
         plan_block_id = CASE
           WHEN wbl.plan_block_id IS NOT NULL AND v_block_map ? wbl.plan_block_id::text
             THEN (v_block_map->>(wbl.plan_block_id::text))::uuid
           ELSE wbl.plan_block_id
         END
   WHERE wbl.student_id = v_student_id
     AND wbl.plan_id = v_old_plan_id;

  UPDATE public.evaluation_results
     SET plan_id = v_new_plan_id
   WHERE student_id = v_student_id
     AND plan_id = v_old_plan_id;

  UPDATE public.plan_assignments
     SET plan_id = v_new_plan_id
   WHERE id = p_assignment_id;

  RETURN v_new_plan_id;
END;
$function$;
