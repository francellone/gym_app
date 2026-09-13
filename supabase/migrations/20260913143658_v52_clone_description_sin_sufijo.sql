-- ============================================================
-- v52 — La descripción del plan asignado es la que escribió la coach
-- ------------------------------------------------------------
-- PEDIDO (Anto, 2026-09-13): "cuando pongo la descripción me sigue
-- saliendo esto [el sufijo del clon]. ¿habrá forma de sacarlo? sino
-- parece que hago copy paste".
--
-- Al asignar una plantilla, assign_template_to_student le pegaba a
-- plans.description un sufijo técnico:
--   [Clonado de "<título>" (template_id=<uuid>) el <fecha>
--    — instancia personal del alumno]
-- Ese texto NO es interno: plans.description se muestra en la pantalla
-- Entrenar y en la card del dashboard DEL ALUMNO (ver memoria
-- plan-description-alumno), así que la alumna también lo lee.
--
-- POR QUÉ SE PUEDE BORRAR SIN PERDER NADA:
--   - el linaje plantilla→clon vive en plans.cloned_from_plan_id desde
--     20260526150100 (con índice y FK), y es lo que consultan
--     EvaluationsPage / EvaluationDetailPage / assignmentHelpers;
--   - la fecha del clon está en plans.created_at;
--   - ningún archivo de src/ parsea "template_id=" en el texto.
--   El sufijo quedó como resto del modelo viejo, cuando parsear la
--   descripción era la ÚNICA forma de reconstruir el linaje.
--
-- Esta migración:
--   1) guarda las descripciones actuales en un backup,
--   2) saca el sufijo de las 67 filas que lo tienen,
--   3) deja las dos RPC de clonado copiando la descripción tal cual.
--
-- (La v51 queda reservada para el borrado de end_date / payment_notes,
--  ver docs/decisiones-vencimiento-plan-vs-pago.md)
--
-- OJO (memoria revision-general-v50b + v46): plans tiene
-- trg_notify_plan_updated_on_plans; un UPDATE masivo sin el GUC
-- app.bulk_maintenance le manda "tu plan se actualizó" a las 67
-- alumnas y además les pisa updated_at. Por eso el paso 2 va adentro
-- de un DO con set_config local.
-- ============================================================

-- ── 1) Backup de las descripciones que se van a tocar ───────
CREATE TABLE IF NOT EXISTS public.backup_plan_descriptions_20260913 (
  plan_id     uuid PRIMARY KEY,
  description text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_plan_descriptions_20260913 ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: tabla de rescate, solo service_role.

COMMENT ON TABLE public.backup_plan_descriptions_20260913 IS
  'Backup temporal de plans.description antes de sacar el sufijo "[Clonado de ...]" (v52, 2026-09-13). BORRAR después de verificar en vivo con la coach.';

INSERT INTO public.backup_plan_descriptions_20260913 (plan_id, description)
SELECT id, description
  FROM public.plans
 WHERE description ~ '\[Clonado de .*instancia personal del alumno\]'
ON CONFLICT (plan_id) DO NOTHING;

-- ── 2) Sacar el sufijo de las filas existentes ──────────────
DO $$
DECLARE
  v_tocadas integer;
BEGIN
  PERFORM set_config('app.bulk_maintenance', 'on', true);

  UPDATE public.plans
     SET description = NULLIF(
           btrim(regexp_replace(
             description,
             '\s*\[Clonado de .*instancia personal del alumno\]\s*$',
             ''
           )),
           ''
         )
   WHERE description ~ '\[Clonado de .*instancia personal del alumno\]\s*$';

  GET DIAGNOSTICS v_tocadas = ROW_COUNT;
  RAISE NOTICE 'v52: descripciones limpiadas = %', v_tocadas;

  IF EXISTS (SELECT 1 FROM public.plans WHERE description ~ '\[Clonado de ') THEN
    RAISE EXCEPTION 'v52: quedaron descripciones con el sufijo del clon';
  END IF;
END
$$;

-- ── 3) assign_template_to_student sin sufijo ────────────────
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
    -- v52: la descripción del clon es EXACTAMENTE la de la coach.
    -- El linaje va en cloned_from_plan_id, no en el texto.
    p.description,
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

-- ── 4) migrate_assignment_off_template: idem + linaje ───────
-- Además del sufijo, esta RPC nunca escribía cloned_from_plan_id
-- (por eso hay 3 clones viejos sin linaje). Queda a paridad.
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
    has_activation, eval_tags, cloned_from_plan_id
  )
  SELECT
    v_new_plan_id,
    trim(both ' ' from COALESCE(p.title, 'Sin nombre')) || ' — ' || v_student_name,
    p.description,
    p.goal, p.sessions_per_week, p.duration_weeks,
    false,
    p.created_by, p.plan_type, p.eval_type, p.eval_method,
    p.has_activation, p.eval_tags, v_old_plan_id
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

COMMENT ON FUNCTION public.assign_template_to_student(uuid, uuid, date, date, text, jsonb, uuid) IS
  'Clona una plantilla como plan personal del alumno. v52: la descripción se copia tal cual (sin sufijo técnico); el linaje queda en plans.cloned_from_plan_id.';
