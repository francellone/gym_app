-- ============================================================
-- Migration v26d: drop final de columnas legacy de notas
-- ------------------------------------------------------------
-- Cierre del refactor. Todos los writers/readers del front ya
-- usan la tabla `notes` directamente. Esta migración:
--
--   1. Backup completo a schema `archive` (red de seguridad).
--   2. Modifica el RPC save_workout_log para no escribir más a
--      workout_logs.notes (parámetro p_notes queda por compat de
--      bundles viejos pero se ignora).
--   3. Drop de los triggers de sync v25d/e + v26a + v26c
--      (fn_sync_workout_log_to_notes, fn_sync_eval_response_to_notes,
--      fn_sync_profile_observations_to_notes).
--   4. DROP COLUMN de las 7 columnas legacy:
--        profiles.observations
--        profiles.coach_notes
--        workout_logs.notes
--        workout_block_logs.notes
--        evaluation_test_responses.student_comment
--        evaluation_test_responses.coach_comment_public
--        evaluation_test_responses.coach_comment_private
--
-- Toda la migración corre en una transacción. Si algo falla,
-- nada se aplica.
--
-- Para recuperar data en caso de necesidad:
--   SELECT * FROM archive.workout_logs_notes_20260517;
--   etc.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS archive;

DROP TABLE IF EXISTS archive.profiles_notes_20260517;
CREATE TABLE archive.profiles_notes_20260517 AS
  SELECT id, observations, coach_notes, now() AS archived_at
    FROM public.profiles
   WHERE observations IS NOT NULL OR coach_notes IS NOT NULL;

DROP TABLE IF EXISTS archive.workout_logs_notes_20260517;
CREATE TABLE archive.workout_logs_notes_20260517 AS
  SELECT id, student_id, plan_id, plan_exercise_id, logged_date,
         notes, now() AS archived_at
    FROM public.workout_logs
   WHERE NULLIF(trim(notes), '') IS NOT NULL;

DROP TABLE IF EXISTS archive.workout_block_logs_notes_20260517;
CREATE TABLE archive.workout_block_logs_notes_20260517 AS
  SELECT id, student_id, plan_id, plan_block_id, logged_date,
         notes, now() AS archived_at
    FROM public.workout_block_logs
   WHERE NULLIF(trim(notes), '') IS NOT NULL;

DROP TABLE IF EXISTS archive.eval_responses_comments_20260517;
CREATE TABLE archive.eval_responses_comments_20260517 AS
  SELECT id, evaluation_result_id, test_id,
         student_comment, coach_comment_public, coach_comment_private,
         now() AS archived_at
    FROM public.evaluation_test_responses
   WHERE student_comment IS NOT NULL
      OR coach_comment_public IS NOT NULL
      OR coach_comment_private IS NOT NULL;

DROP TRIGGER IF EXISTS trg_sync_workout_log_to_notes ON public.workout_logs;
DROP FUNCTION IF EXISTS public.fn_sync_workout_log_to_notes();

DROP TRIGGER IF EXISTS trg_sync_eval_response_to_notes ON public.evaluation_test_responses;
DROP FUNCTION IF EXISTS public.fn_sync_eval_response_to_notes();

DROP TRIGGER IF EXISTS trg_sync_profile_observations_to_notes ON public.profiles;
DROP FUNCTION IF EXISTS public.fn_sync_profile_observations_to_notes();

-- RPC save_workout_log: parámetro p_notes queda por compat pero se ignora.
-- Cuerpo idéntico al previo (de v25d) menos las referencias a `notes`.
CREATE OR REPLACE FUNCTION public.save_workout_log(
  p_student_id uuid,
  p_plan_id uuid,
  p_plan_exercise_id uuid,
  p_logged_date date,
  p_weight_mode text,
  p_reps jsonb,
  p_log_id uuid DEFAULT NULL,
  p_weights jsonb DEFAULT NULL,
  p_unilateral boolean DEFAULT false,
  p_reps_unit text DEFAULT NULL,
  p_actual_sets integer DEFAULT NULL,
  p_perceived_difficulty integer DEFAULT NULL,
  p_perceived_difficulty_label text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_completed boolean DEFAULT true,
  p_logged_late boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log_id      uuid;
  v_sets        int;
  v_reps_text   text;
  v_weights_text text;
  v_weight_num  numeric;
  v_first_w     numeric;
BEGIN
  IF p_student_id IS NULL OR p_plan_id IS NULL OR p_plan_exercise_id IS NULL OR p_logged_date IS NULL THEN
    RAISE EXCEPTION 'student_id, plan_id, plan_exercise_id y logged_date son obligatorios'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_weight_mode NOT IN ('with_weight', 'barbell_only', 'bodyweight') THEN
    RAISE EXCEPTION 'weight_mode inválido: %', p_weight_mode
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_reps_unit IS NOT NULL AND p_reps_unit NOT IN ('reps','pasos','respiraciones','segundos') THEN
    RAISE EXCEPTION 'reps_unit inválido: %', p_reps_unit
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_weight_mode = 'bodyweight' AND p_weights IS NOT NULL AND p_weights != '[]'::jsonb THEN
    RAISE EXCEPTION 'weight_mode=bodyweight no admite p_weights (debe ser NULL)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_reps IS NOT NULL AND p_weights IS NOT NULL
    AND jsonb_array_length(p_reps) != jsonb_array_length(p_weights) THEN
    RAISE EXCEPTION 'p_reps y p_weights deben tener la misma longitud'
      USING ERRCODE = 'check_violation';
  END IF;

  v_sets := COALESCE(p_actual_sets, jsonb_array_length(COALESCE(p_reps, '[]'::jsonb)));

  IF p_reps IS NOT NULL THEN v_reps_text := p_reps::text; ELSE v_reps_text := NULL; END IF;

  IF p_weights IS NOT NULL THEN
    v_weights_text := p_weights::text;
    SELECT (e.value)::numeric INTO v_first_w
      FROM jsonb_array_elements(p_weights) WITH ORDINALITY e(value, ord)
     WHERE jsonb_typeof(e.value) = 'number'
     ORDER BY ord LIMIT 1;
    v_weight_num := v_first_w;
  ELSE
    v_weights_text := NULL;
    v_weight_num := NULL;
  END IF;

  IF p_log_id IS NULL THEN
    INSERT INTO public.workout_logs (
      student_id, plan_id, plan_exercise_id, logged_date,
      actual_sets, actual_reps_jsonb, actual_weights_jsonb,
      weight_mode, unilateral, reps_unit,
      perceived_difficulty, perceived_difficulty_label,
      completed, logged_late,
      actual_reps, actual_weights, actual_weight
    ) VALUES (
      p_student_id, p_plan_id, p_plan_exercise_id, p_logged_date,
      v_sets, p_reps, p_weights,
      p_weight_mode, p_unilateral, p_reps_unit,
      p_perceived_difficulty, p_perceived_difficulty_label,
      p_completed, p_logged_late,
      v_reps_text, v_weights_text, v_weight_num
    )
    RETURNING id INTO v_log_id;
  ELSE
    UPDATE public.workout_logs SET
      student_id = p_student_id,
      plan_id = p_plan_id,
      plan_exercise_id = p_plan_exercise_id,
      logged_date = p_logged_date,
      actual_sets = v_sets,
      actual_reps_jsonb = p_reps,
      actual_weights_jsonb = p_weights,
      weight_mode = p_weight_mode,
      unilateral = p_unilateral,
      reps_unit = p_reps_unit,
      perceived_difficulty = p_perceived_difficulty,
      perceived_difficulty_label = p_perceived_difficulty_label,
      completed = p_completed,
      logged_late = p_logged_late,
      actual_reps = v_reps_text,
      actual_weights = v_weights_text,
      actual_weight = v_weight_num
    WHERE id = p_log_id
    RETURNING id INTO v_log_id;
    IF v_log_id IS NULL THEN
      RAISE EXCEPTION 'Log % no encontrado para UPDATE', p_log_id
        USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN v_log_id;
END;
$function$;

ALTER TABLE public.profiles                  DROP COLUMN IF EXISTS observations;
ALTER TABLE public.profiles                  DROP COLUMN IF EXISTS coach_notes;
ALTER TABLE public.workout_logs              DROP COLUMN IF EXISTS notes;
ALTER TABLE public.workout_block_logs        DROP COLUMN IF EXISTS notes;
ALTER TABLE public.evaluation_test_responses DROP COLUMN IF EXISTS coach_comment_public;
ALTER TABLE public.evaluation_test_responses DROP COLUMN IF EXISTS coach_comment_private;
ALTER TABLE public.evaluation_test_responses DROP COLUMN IF EXISTS student_comment;
