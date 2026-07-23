-- ============================================================
-- Wellbeing: carga por coach + auditoría (espejo de save_workout_log v33)
-- ============================================================
-- Pedido de Anto: el coach (modalidades híbrida/solo-coach) debe poder
-- cargar el wellbeing del alumno, no solo el entrenamiento.
-- Requisito de Franco: auditoría no falsificable de quién cargó el dato.
-- Regla de negocio: el coach NO pisa el wellbeing subjetivo del alumno
-- (source='student'); solo carga si no existe, o corrige su propia carga.
--
-- Aplicada a prod el 2026-07-23 vía Supabase MCP.

-- 1) Columnas de auditoría (mismo patrón que workout_logs).
ALTER TABLE public.wellbeing_logs
  ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'student'
    CHECK (source IN ('student', 'coach'));

-- 2) Backfill: todo lo histórico lo cargó el propio alumno.
--    source ya quedó en 'student' por el default; logged_by hay que setearlo.
UPDATE public.wellbeing_logs
   SET logged_by = user_id
 WHERE logged_by IS NULL;

-- 3) RPC de guardado con autorización y autoría derivada de auth.uid().
CREATE OR REPLACE FUNCTION public.save_wellbeing_log(
  p_user_id            uuid,
  p_date               date,
  p_sleep_quality      smallint DEFAULT NULL,
  p_nutrition_quality  smallint DEFAULT NULL,
  p_hydration_quality  smallint DEFAULT NULL,
  p_energy_level       smallint DEFAULT NULL,
  p_stress_level       smallint DEFAULT NULL,
  p_muscle_fatigue     smallint DEFAULT NULL,
  p_notes              text     DEFAULT NULL
)
RETURNS public.wellbeing_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller   uuid;
  v_source   text;
  v_existing public.wellbeing_logs;
  v_result   public.wellbeing_logs;
BEGIN
  -- Autorización (espejo save_workout_log): caller = alumno o su coach asignado.
  -- `source`/`logged_by` se derivan del rol; NUNCA son parámetro (no spoofeable).
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'No autenticado'
      USING ERRCODE = 'insufficient_privilege';
  ELSIF v_caller = p_user_id THEN
    v_source := 'student';
  ELSIF public.is_coach() AND EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_user_id AND coach_id = v_caller
  ) THEN
    v_source := 'coach';
  ELSE
    RAISE EXCEPTION 'No autorizado para registrar el wellbeing de este alumno'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_user_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'user_id y date son obligatorios'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_existing
    FROM public.wellbeing_logs
   WHERE user_id = p_user_id AND date = p_date;

  -- El wellbeing es dato subjetivo del alumno: el coach solo carga si no
  -- existe registro, o si el existente es de origen coach (corrige su carga).
  IF v_source = 'coach'
     AND v_existing.id IS NOT NULL
     AND v_existing.source = 'student' THEN
    RAISE EXCEPTION 'El alumno ya cargó su wellbeing de este día'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.wellbeing_logs (
    user_id, date,
    sleep_quality, nutrition_quality, hydration_quality,
    energy_level, stress_level, muscle_fatigue,
    notes, logged_by, source, updated_at
  ) VALUES (
    p_user_id, p_date,
    p_sleep_quality, p_nutrition_quality, p_hydration_quality,
    p_energy_level, p_stress_level, p_muscle_fatigue,
    p_notes, v_caller, v_source, now()
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    sleep_quality     = EXCLUDED.sleep_quality,
    nutrition_quality = EXCLUDED.nutrition_quality,
    hydration_quality = EXCLUDED.hydration_quality,
    energy_level      = EXCLUDED.energy_level,
    stress_level      = EXCLUDED.stress_level,
    muscle_fatigue    = EXCLUDED.muscle_fatigue,
    notes             = EXCLUDED.notes,
    logged_by         = EXCLUDED.logged_by,
    source            = EXCLUDED.source,
    updated_at        = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

-- 4) Permisos: solo usuarios autenticados; nunca anon/public.
REVOKE ALL ON FUNCTION public.save_wellbeing_log(
  uuid, date, smallint, smallint, smallint, smallint, smallint, smallint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_wellbeing_log(
  uuid, date, smallint, smallint, smallint, smallint, smallint, smallint, text
) TO authenticated;
