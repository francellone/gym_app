-- ============================================================
-- GYM APP v9 - CORRECCIONES DE COHERENCIA DEL SCHEMA
-- Ejecutar DESPUÉS de migration_v8_intake_form.sql
-- ============================================================
-- Verificado contra la base real en Supabase el 2026-04-09.
--
-- Fixes incluidos:
--   1. Trigger updated_at faltante en evaluation_results
--   2. Trigger updated_at faltante en student_profiles
--   3. Vista unificada v_workout_session_intensity
--      (resuelve desconexión borg_scale vs borg_per_day)
--   4. process_intake_submission actualiza también profiles
--      (evita divergencia student_profiles vs profiles)
--   5. Documentación de columnas nombre/apellido en student_profiles
--   6. Índices de performance para consultas de progreso
-- ============================================================
-- NOTA: Las columnas legacy (day_label, activation, order) en
-- plan_exercises NO existen en producción — no se necesita limpiarlas.
-- ============================================================


-- ============================================================
-- 1. TRIGGER updated_at FALTANTE EN evaluation_results
--    Definido en v3 pero ausente en la base real.
-- ============================================================
DROP TRIGGER IF EXISTS evaluation_results_updated_at ON public.evaluation_results;
CREATE TRIGGER evaluation_results_updated_at
  BEFORE UPDATE ON public.evaluation_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 2. TRIGGER updated_at FALTANTE EN student_profiles
--    La tabla tiene la columna updated_at pero sin trigger.
-- ============================================================
DROP TRIGGER IF EXISTS student_profiles_updated_at ON public.student_profiles;
CREATE TRIGGER student_profiles_updated_at
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 3. COLUMNAS nombre/apellido EN student_profiles
--    Existen en producción pero no en ninguna migración.
--    Las documentamos formalmente.
-- ============================================================
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS apellido text;

COMMENT ON COLUMN public.student_profiles.nombre IS
  'Nombre del alumno extraído del formulario de ingreso (puede diferir de profiles.name).';
COMMENT ON COLUMN public.student_profiles.apellido IS
  'Apellido del alumno extraído del formulario de ingreso.';


-- ============================================================
-- 4. VISTA UNIFICADA DE INTENSIDAD
--    ProgressPage usaba borg_scale (campo legacy), pero
--    TodayWorkoutPage escribe en borg_per_day (jsonb).
--    Esta vista expone borg_value que unifica ambos campos,
--    priorizando borg_per_day y cayendo en borg_scale como fallback.
-- ============================================================
DROP VIEW IF EXISTS public.v_workout_session_intensity;
CREATE VIEW public.v_workout_session_intensity AS
SELECT
  id,
  student_id,
  plan_id,
  logged_date,
  started_at,
  finished_at,
  CASE
    WHEN borg_per_day IS NOT NULL AND borg_per_day != '{}'::jsonb THEN
      ROUND(
        (
          COALESCE((borg_per_day->>'day_a')::numeric, 0) +
          COALESCE((borg_per_day->>'day_b')::numeric, 0)
        ) /
        NULLIF(
          (CASE WHEN borg_per_day ? 'day_a' THEN 1 ELSE 0 END) +
          (CASE WHEN borg_per_day ? 'day_b' THEN 1 ELSE 0 END),
          0
        )
      , 1)
    ELSE borg_scale::numeric
  END AS borg_value,
  borg_per_day,
  borg_scale,
  borg_notes,
  logged_late,
  created_at,
  updated_at
FROM public.workout_sessions;

GRANT SELECT ON public.v_workout_session_intensity TO authenticated;


-- ============================================================
-- 5. process_intake_submission ACTUALIZA TAMBIÉN profiles
--    Cuando un alumno completa el formulario, los datos se
--    guardan en student_profiles pero NO en profiles. Esto genera
--    dos fuentes de verdad que pueden divergir con el tiempo.
--    Este fix sincroniza los campos equivalentes en profiles.
-- ============================================================
CREATE OR REPLACE FUNCTION process_intake_submission(submission_id uuid)
RETURNS void AS $$
DECLARE
  sub intake_form_submissions%ROWTYPE;
  resp jsonb;
BEGIN
  SELECT * INTO sub FROM intake_form_submissions WHERE id = submission_id;
  resp := sub.responses;

  -- Actualizar student_profiles (comportamiento previo, mantenido)
  INSERT INTO student_profiles (
    student_id, submission_id,
    objetivo_principal, nivel_experiencia, frecuencia_semanal,
    lugar_entrenamiento, tiene_lesiones, patologias, raw_data
  ) VALUES (
    sub.student_id, sub.id,
    resp->>'objetivo_principal', resp->>'experiencia_nivel', resp->>'frecuencia_semanal',
    resp->>'lugar_entrenamiento', (resp->>'tiene_lesiones')::boolean,
    ARRAY(SELECT jsonb_array_elements_text(resp->'patologias')),
    resp
  )
  ON CONFLICT (student_id) DO UPDATE SET
    submission_id       = EXCLUDED.submission_id,
    objetivo_principal  = EXCLUDED.objetivo_principal,
    nivel_experiencia   = EXCLUDED.nivel_experiencia,
    frecuencia_semanal  = EXCLUDED.frecuencia_semanal,
    lugar_entrenamiento = EXCLUDED.lugar_entrenamiento,
    tiene_lesiones      = EXCLUDED.tiene_lesiones,
    patologias          = EXCLUDED.patologias,
    raw_data            = EXCLUDED.raw_data,
    updated_at          = now();

  -- NUEVO: sincronizar en profiles para evitar divergencia
  UPDATE public.profiles
  SET
    goal             = COALESCE(resp->>'objetivo_principal', goal),
    level            = CASE
                         WHEN resp->>'experiencia_nivel' = 'principiante' THEN 'beginner'
                         WHEN resp->>'experiencia_nivel' = 'intermedio'   THEN 'intermediate'
                         WHEN resp->>'experiencia_nivel' = 'avanzado'     THEN 'advanced'
                         ELSE level
                       END,
    weekly_frequency = CASE
                         WHEN (resp->>'frecuencia_semanal') ~ '^\d+$'
                         THEN (resp->>'frecuencia_semanal')::int
                         ELSE weekly_frequency
                       END,
    observations     = COALESCE(NULLIF(resp->>'observaciones', ''), observations),
    updated_at       = now()
  WHERE id = sub.student_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 6. ÍNDICES DE PERFORMANCE
--    Para queries de progreso que filtran por peso real.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_workout_logs_student_date_weight
  ON public.workout_logs(student_id, logged_date DESC)
  WHERE actual_weight IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workout_logs_student_date_weights
  ON public.workout_logs(student_id, logged_date DESC)
  WHERE actual_weights IS NOT NULL;


-- ============================================================
-- 7. COMENTARIOS — campos de doble escritura (retrocompat)
-- ============================================================
COMMENT ON COLUMN public.workout_logs.actual_weight IS
  'LEGACY: primer peso de la sesión. Para registros nuevos usar actual_weights (JSON array por serie).';
COMMENT ON COLUMN public.workout_logs.actual_weights IS
  'Pesos por serie en JSON array. Ej: "[20,20,22.5]". Campo preferido. Retrocompat: actual_weight = primer valor.';
COMMENT ON COLUMN public.plan_exercises.suggested_weight IS
  'LEGACY: peso sugerido único. Para planes nuevos usar suggested_weights (JSON array por serie).';
COMMENT ON COLUMN public.plan_exercises.suggested_weights IS
  'Pesos sugeridos por serie en JSON array. Ej: "[20,22.5,25]". Campo preferido.';
COMMENT ON COLUMN public.workout_sessions.borg_scale IS
  'LEGACY: intensidad global de sesión. Para registros nuevos usar borg_per_day (JSONB por día).';
COMMENT ON COLUMN public.workout_sessions.borg_per_day IS
  'PSE por día del plan. Ej: {"day_a": 7, "day_b": 5}. Campo preferido sobre borg_scale.';
