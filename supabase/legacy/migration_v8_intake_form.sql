-- ============================================================
-- MIGRACIÓN v8: SISTEMA DE FORMULARIO DE INGRESO
-- ============================================================
-- Ejecutar en Supabase SQL Editor si las tablas no existen.
-- Este archivo es un alias de intake-form/supabase/migration_intake_form.sql
-- ============================================================

-- Verificar si las tablas ya existen antes de correr
-- Si ya aplicaste intake-form/supabase/migration_intake_form.sql → NO corras esto.

-- 1. Plantillas de formulario (por coach)
CREATE TABLE IF NOT EXISTS intake_form_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            text NOT NULL DEFAULT 'Formulario General',
  description     text,
  config          jsonb NOT NULL,
  is_default      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_one_default_per_coach
  ON intake_form_templates (coach_id)
  WHERE is_default = true;

-- 2. Asignaciones coach → alumno
CREATE TABLE IF NOT EXISTS intake_form_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         uuid REFERENCES intake_form_templates(id) ON DELETE SET NULL,
  coach_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  form_snapshot       jsonb NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'completed')),
  sent_at             timestamptz DEFAULT now(),
  completed_at        timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- Solo un formulario activo (no completado) por alumno por coach
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_one_active_per_student
  ON intake_form_assignments (coach_id, student_id)
  WHERE status != 'completed';

-- 3. Respuestas (submissions)
CREATE TABLE IF NOT EXISTS intake_form_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id       uuid NOT NULL REFERENCES intake_form_assignments(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  form_snapshot       jsonb NOT NULL,
  responses           jsonb NOT NULL DEFAULT '{}',
  profile_snapshot    jsonb,
  submitted_at        timestamptz DEFAULT now()
);

-- 4. Perfil del estudiante generado post-submission
CREATE TABLE IF NOT EXISTS student_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  submission_id       uuid REFERENCES intake_form_submissions(id) ON DELETE SET NULL,
  objetivo_principal  text,
  nivel_experiencia   text,
  frecuencia_semanal  text,
  lugar_entrenamiento text,
  tiene_lesiones      boolean,
  patologias          text[],
  raw_data            jsonb,
  updated_at          timestamptz DEFAULT now()
);

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_submissions_coach   ON intake_form_submissions (coach_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON intake_form_submissions (student_id);

-- 6. RLS
ALTER TABLE intake_form_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_form_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_form_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles         ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "coach_own_templates" ON intake_form_templates
  FOR ALL USING (auth.uid() = coach_id);

CREATE POLICY "coach_own_assignments" ON intake_form_assignments
  FOR ALL USING (auth.uid() = coach_id);

CREATE POLICY "student_own_assignment" ON intake_form_assignments
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "coach_read_submissions" ON intake_form_submissions
  FOR SELECT USING (auth.uid() = coach_id);

CREATE POLICY "student_own_submission" ON intake_form_submissions
  FOR ALL USING (auth.uid() = student_id);

CREATE POLICY "student_own_profile" ON student_profiles
  FOR ALL USING (auth.uid() = student_id);

-- Policy adicional: el coach puede leer los perfiles de SUS alumnos
CREATE POLICY "coach_read_student_profiles" ON student_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM intake_form_assignments a
      WHERE a.student_id = student_profiles.student_id
        AND a.coach_id = auth.uid()
    )
  );

-- 7. Función process_intake_submission
CREATE OR REPLACE FUNCTION process_intake_submission(submission_id uuid)
RETURNS void AS $$
DECLARE
  sub intake_form_submissions%ROWTYPE;
  resp jsonb;
BEGIN
  SELECT * INTO sub FROM intake_form_submissions WHERE id = submission_id;
  resp := sub.responses;

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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
