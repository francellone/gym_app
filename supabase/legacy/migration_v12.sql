-- ============================================================
-- GYM APP v12 - DEPRECAR student_profiles COMO FUENTE DE VERDAD
-- Ejecutar DESPUÉS de migration_v11.sql
-- ============================================================
-- Contexto:
--   Diagnóstico v12: student_profiles nunca fue leída por el
--   frontend. La UI usa exclusivamente profiles para datos
--   editables y intake_form_submissions.responses para los
--   datos crudos del formulario.
--
--   student_profiles duplicaba 3 campos que no existen en
--   profiles (tiene_lesiones, patologias, lugar_entrenamiento).
--   El resto (objetivo_principal, nivel_experiencia,
--   frecuencia_semanal) ya se sincronizaba en v9.
--
-- Cambios:
--   1. Agregar campos faltantes a profiles
--   2. Migrar datos existentes de student_profiles → profiles
--   3. Reemplazar process_intake_submission: escribe directo
--      en profiles. Mantiene escritura legacy en student_profiles
--      (puede eliminarse en v13 si no genera regresiones).
--   4. Marcar student_profiles como deprecated (no se dropea
--      para preservar datos históricos).
-- ============================================================


-- ============================================================
-- 1. AGREGAR CAMPOS FALTANTES A profiles
--    Estos 3 campos solo existían en student_profiles.
--    Al moverlos a profiles quedan bajo la misma fuente
--    de verdad que el resto del perfil del alumno.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tiene_lesiones      boolean,
  ADD COLUMN IF NOT EXISTS patologias          text[],
  ADD COLUMN IF NOT EXISTS lugar_entrenamiento text;

COMMENT ON COLUMN public.profiles.tiene_lesiones IS
  'Indica si el alumno reportó lesiones en el formulario de ingreso.';
COMMENT ON COLUMN public.profiles.patologias IS
  'Lista de patologías o condiciones reportadas en el formulario de ingreso.';
COMMENT ON COLUMN public.profiles.lugar_entrenamiento IS
  'Dónde entrena el alumno (ej: "gimnasio", "casa", "al aire libre").';


-- ============================================================
-- 2. MIGRAR DATOS EXISTENTES student_profiles → profiles
--    One-shot: llena los nuevos campos en profiles para todos
--    los alumnos que ya tienen un student_profile registrado.
--    Solo sobrescribe si el campo en profiles aún está vacío.
-- ============================================================
UPDATE public.profiles p
SET
  tiene_lesiones      = COALESCE(p.tiene_lesiones,      sp.tiene_lesiones),
  patologias          = COALESCE(p.patologias,          sp.patologias),
  lugar_entrenamiento = COALESCE(p.lugar_entrenamiento, sp.lugar_entrenamiento)
FROM public.student_profiles sp
WHERE sp.student_id = p.id
  AND (
    sp.tiene_lesiones      IS NOT NULL
    OR sp.patologias       IS NOT NULL
    OR sp.lugar_entrenamiento IS NOT NULL
  );


-- ============================================================
-- 3. DEPRECAR LA TABLA student_profiles
--    Se mantiene como archivo histórico. No se dropea.
-- ============================================================
COMMENT ON TABLE public.student_profiles IS
  'DEPRECATED desde v12 — ya no es la fuente de verdad.
   Los datos del alumno viven en public.profiles.
   Esta tabla se mantiene como archivo histórico de submissions.
   No leer desde el frontend. No agregar nuevas consultas aquí.
   Candidata a eliminarse en una migración futura.';

COMMENT ON COLUMN public.student_profiles.objetivo_principal IS
  'DEPRECATED. Ver profiles.goal.';
COMMENT ON COLUMN public.student_profiles.nivel_experiencia IS
  'DEPRECATED. Ver profiles.level.';
COMMENT ON COLUMN public.student_profiles.frecuencia_semanal IS
  'DEPRECATED. Ver profiles.weekly_frequency.';
COMMENT ON COLUMN public.student_profiles.tiene_lesiones IS
  'DEPRECATED. Ver profiles.tiene_lesiones.';
COMMENT ON COLUMN public.student_profiles.patologias IS
  'DEPRECATED. Ver profiles.patologias.';
COMMENT ON COLUMN public.student_profiles.lugar_entrenamiento IS
  'DEPRECATED. Ver profiles.lugar_entrenamiento.';
COMMENT ON COLUMN public.student_profiles.nombre IS
  'DEPRECATED. Ver profiles.name.';
COMMENT ON COLUMN public.student_profiles.apellido IS
  'DEPRECATED. Sin equivalente directo en profiles (profiles.name contiene nombre completo).';


-- ============================================================
-- 4. REEMPLAZAR process_intake_submission
--    Ahora escribe todos los campos directamente en profiles.
--    También mantiene la escritura legacy en student_profiles
--    por precaución (puede removerse en v13).
-- ============================================================
CREATE OR REPLACE FUNCTION process_intake_submission(submission_id uuid)
RETURNS void AS $$
DECLARE
  sub intake_form_submissions%ROWTYPE;
  resp jsonb;
BEGIN
  SELECT * INTO sub FROM intake_form_submissions WHERE id = submission_id;
  IF NOT FOUND THEN RETURN; END IF;
  resp := sub.responses;

  -- ── FUENTE DE VERDAD: escribir en profiles ───────────────
  UPDATE public.profiles
  SET
    -- campos existentes en v9
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

    -- nuevos campos migrados desde student_profiles (v12)
    tiene_lesiones      = CASE
                            WHEN resp->>'tiene_lesiones' IS NOT NULL
                            THEN (resp->>'tiene_lesiones')::boolean
                            ELSE tiene_lesiones
                          END,
    patologias          = CASE
                            WHEN jsonb_typeof(resp->'patologias') = 'array'
                            THEN ARRAY(SELECT jsonb_array_elements_text(resp->'patologias'))
                            ELSE patologias
                          END,
    lugar_entrenamiento = COALESCE(
                            NULLIF(resp->>'lugar_entrenamiento', ''),
                            lugar_entrenamiento
                          ),

    updated_at = now()
  WHERE id = sub.student_id;

  -- ── LEGACY: mantener escritura en student_profiles ───────
  -- Preserva compatibilidad con datos históricos existentes.
  -- Puede eliminarse en v13 una vez confirmado que nada la lee.
  INSERT INTO public.student_profiles (
    student_id, submission_id,
    objetivo_principal, nivel_experiencia, frecuencia_semanal,
    lugar_entrenamiento, tiene_lesiones, patologias, raw_data
  ) VALUES (
    sub.student_id, sub.id,
    resp->>'objetivo_principal',
    resp->>'experiencia_nivel',
    resp->>'frecuencia_semanal',
    resp->>'lugar_entrenamiento',
    CASE WHEN resp->>'tiene_lesiones' IS NOT NULL
         THEN (resp->>'tiene_lesiones')::boolean END,
    CASE WHEN jsonb_typeof(resp->'patologias') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(resp->'patologias')) END,
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

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
