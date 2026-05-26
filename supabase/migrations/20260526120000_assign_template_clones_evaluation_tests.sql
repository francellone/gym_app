-- 20260526120000_assign_template_clones_evaluation_tests.sql
-- ===========================================================
-- Fix Bug 3 del doc 32 (Franco 2026-05-26):
--   La RPC assign_template_to_student clonaba plans + plan_blocks +
--   plan_exercises + plan_assignments, pero NO clonaba evaluation_tests.
--   Eso dejaba VACÍAS las evaluaciones tipo `custom` (que viven en
--   evaluation_tests) cuando se asignaban a un alumno.
--
--   Esta migración recrea la función agregando el INSERT en
--   evaluation_tests. El contrato (signature + return shape) se
--   mantiene; no requiere cambios en el cliente.
--
-- Nota sobre C1 del doc 32 (parent_plan_id en el clon):
--   El primer intento de esta migración seteaba `parent_plan_id :=
--   p_template_id` para cerrar el linaje template→clon. El trigger
--   `plans_validate_parent` lo rechazó porque exige que parent_plan_id
--   apunte a un plan de training (no a una eval). La columna está
--   reservada para el linkeo eval-template → training-template. Para
--   reusarla en template→clon habría que primero relajar/dividir el
--   trigger en dos semánticas. C1 queda DIFERIDO como follow-up
--   (no urgente; la trazabilidad sigue disponible vía el sufijo
--   `[Clonado de "..." (template_id=...)]` en plans.description).
--
-- Backfill de datos rotos (clon vivo de Anto sin tests) va en una
-- migración aparte (data fix), no acá.
-- ===========================================================

CREATE OR REPLACE FUNCTION public.assign_template_to_student(
  p_template_id          uuid,
  p_student_id           uuid,
  p_start_date           date    DEFAULT CURRENT_DATE,
  p_end_date             date    DEFAULT NULL,
  p_schedule_mode        text    DEFAULT 'flexible',
  p_preferred_days       jsonb   DEFAULT NULL,
  p_linked_assignment_id uuid    DEFAULT NULL
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
  SELECT is_template INTO v_is_template
    FROM public.plans WHERE id = p_template_id;

  IF v_is_template IS NULL THEN
    RAISE EXCEPTION 'Plan % no existe', p_template_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_is_template = false THEN
    RAISE EXCEPTION 'Plan % no es una plantilla (is_template=false). Usá INSERT directo para asignar una instancia.', p_template_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(trim(name), ''), email)
    INTO v_student_name
    FROM public.profiles
   WHERE id = p_student_id AND role = 'student';

  IF v_student_name IS NULL THEN
    RAISE EXCEPTION 'Alumno % no existe o no tiene role=student', p_student_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_creator := COALESCE(auth.uid(), (SELECT created_by FROM public.plans WHERE id = p_template_id));

  -- ── 1. clon del plan ──────────────────────────────────────
  -- parent_plan_id queda NULL: el trigger plans_validate_parent
  -- exige que apunte a training; no se puede reusar para
  -- template→clon hasta resolverlo (ver C1 follow-up).
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
    v_creator,
    p.plan_type, p.eval_type, p.eval_method,
    p.has_activation, p.eval_tags
  FROM public.plans p
  WHERE p.id = p_template_id;

  -- ── 2. plan_blocks ────────────────────────────────────────
  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_block_map
    FROM public.plan_blocks WHERE plan_id = p_template_id;

  INSERT INTO public.plan_blocks (
    id, plan_id, section, block_type, order_index, title, notes,
    aerobic_format, aerobic_total_minutes, aerobic_intensity,
    aerobic_work_seconds, aerobic_rest_seconds, aerobic_rounds,
    aerobic_expected_sensation, circuit_type, circuit_work_seconds,
    circuit_rest_seconds, circuit_rounds, circuit_total_minutes,
    circuit_intensity, aerobic_zone
  )
  SELECT
    (v_block_map->>(pb.id::text))::uuid,
    v_new_plan_id,
    pb.section, pb.block_type, pb.order_index, pb.title, pb.notes,
    pb.aerobic_format, pb.aerobic_total_minutes, pb.aerobic_intensity,
    pb.aerobic_work_seconds, pb.aerobic_rest_seconds, pb.aerobic_rounds,
    pb.aerobic_expected_sensation, pb.circuit_type, pb.circuit_work_seconds,
    pb.circuit_rest_seconds, pb.circuit_rounds, pb.circuit_total_minutes,
    pb.circuit_intensity, pb.aerobic_zone
  FROM public.plan_blocks pb
  WHERE pb.plan_id = p_template_id;

  -- ── 3. plan_exercises ─────────────────────────────────────
  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_ex_map
    FROM public.plan_exercises WHERE plan_id = p_template_id;

  INSERT INTO public.plan_exercises (
    id, plan_id, exercise_id, section, block_label, order_index,
    suggested_sets, suggested_reps, suggested_weight, rest_time,
    suggested_pse, extra_notes, suggested_weights, block_id,
    exercise_mode, duration_seconds
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
    pe.exercise_mode, pe.duration_seconds
  FROM public.plan_exercises pe
  WHERE pe.plan_id = p_template_id;

  -- ── 4. evaluation_tests ───────────────────────────────────
  -- FIX Bug 3 del doc 32: las evals 'custom' viven en evaluation_tests
  -- (no en plan_exercises). Sin este INSERT, las evals 'custom' quedan
  -- vacías al asignarlas (caso reportado: clon "EVALUACION INICIAL —
  -- anto almanza" del 24/05 con 0 tests contra los 8 del padre).
  INSERT INTO public.evaluation_tests (
    plan_id, exercise_id, exercise_name, test_type, instructions,
    expected_value, expected_unit, mandatory, order_index
  )
  SELECT
    v_new_plan_id,
    et.exercise_id, et.exercise_name, et.test_type, et.instructions,
    et.expected_value, et.expected_unit, et.mandatory, et.order_index
  FROM public.evaluation_tests et
  WHERE et.plan_id = p_template_id;

  -- ── 5. plan_assignment ────────────────────────────────────
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
    'assignment_id', v_new_assignment_id,
    'plan_id',       v_new_plan_id,
    'template_id',   p_template_id,
    'student_id',    p_student_id
  );
END;
$function$;

-- Validación manual sugerida después de aplicar:
--
--   SELECT (pg_get_functiondef(oid) LIKE '%INSERT INTO public.evaluation_tests%')
--   FROM pg_proc WHERE proname='assign_template_to_student';
--   -- Debe ser true.
--
-- Smoke en prod: asignar EVALUACION INICIAL a un alumno de prueba,
-- verificar que evaluation_tests.* del clon tiene las 8 filas del template.
