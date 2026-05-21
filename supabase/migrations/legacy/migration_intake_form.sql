-- ============================================================
-- MIGRACIÓN: SISTEMA DE FORMULARIO DE INGRESO
-- ============================================================
-- Este módulo agrega las tablas necesarias para el sistema
-- de formularios de ingreso de estudiantes.
--
-- Estrategia de datos:
--   - La configuración del formulario se guarda como JSONB
--     para máxima flexibilidad (el coach puede customizar).
--   - Las respuestas guardan un SNAPSHOT del formulario al
--     momento del envío + { question_id: value }.
--   - Los IDs de preguntas son inmutables → garantizan la
--     unión correcta con BBDD aunque el coach edite labels.
--   - Índices en question_id dentro de jsonb para análisis.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. PLANTILLAS DE FORMULARIO (por coach)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intake_form_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            text NOT NULL DEFAULT 'Formulario General',
  description     text,
  config          jsonb NOT NULL,     -- config completa: intro + módulos + consent
  is_default      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Solo un formulario puede ser "default" por coach
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_one_default_per_coach
  ON intake_form_templates (coach_id)
  WHERE is_default = true;

-- ─────────────────────────────────────────────────────────────
-- 2. ASIGNACIONES DE FORMULARIO (coach → estudiante)
-- ─────────────────────────────────────────────────────────────
-- Un coach puede mandar el formulario a un estudiante.
-- Al asignar se guarda un snapshot de la config activa.
CREATE TABLE IF NOT EXISTS intake_form_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         uuid REFERENCES intake_form_templates(id) ON DELETE SET NULL,
  coach_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  form_snapshot       jsonb NOT NULL,   -- copia del config al momento de asignar
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'completed')),
  sent_at             timestamptz DEFAULT now(),
  completed_at        timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- Un estudiante no debería tener dos asignaciones activas del mismo coach
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_one_active_per_student
  ON intake_form_assignments (coach_id, student_id)
  WHERE status != 'completed';

-- ─────────────────────────────────────────────────────────────
-- 3. RESPUESTAS (submissions)
-- ─────────────────────────────────────────────────────────────
-- Una por assignment. Guarda:
--   - snapshot: copia exacta del formulario que vio el estudiante
--   - responses: { question_id: value } — vinculación estable
--   - profile_snapshot: resumen procesado del perfil del alumno
CREATE TABLE IF NOT EXISTS intake_form_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id       uuid NOT NULL REFERENCES intake_form_assignments(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  form_snapshot       jsonb NOT NULL,   -- formulario tal como lo vio el alumno
  responses           jsonb NOT NULL DEFAULT '{}',  -- { question_id: value }
  profile_snapshot    jsonb,            -- perfil procesado para uso en analytics
  submitted_at        timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. PERFIL DEL ESTUDIANTE (generado post-submission)
-- ─────────────────────────────────────────────────────────────
-- Resumen estructurado extraído del formulario.
-- Usado para: sugerir rutinas, segmentar, analytics.
--
-- Nota: el formulario usa question_id 'nombre' y 'apellido'
-- (antes era 'nombre_completo'). Los perfiles nuevos ya usan
-- los campos separados; el campo nombre_completo es legacy.
CREATE TABLE IF NOT EXISTS student_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  submission_id       uuid REFERENCES intake_form_submissions(id) ON DELETE SET NULL,

  -- Datos clave extraídos (para queries eficientes)
  nombre              text,   -- antes: nombre_completo (campo separado)
  apellido            text,
  objetivo_principal  text,
  nivel_experiencia   text,
  frecuencia_semanal  text,
  lugar_entrenamiento text,
  tiene_lesiones      boolean,
  patologias          text[],

  -- JSONB para todo el resto (flexible)
  raw_data            jsonb,

  updated_at          timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. ÍNDICES PARA ANÁLISIS
-- ─────────────────────────────────────────────────────────────

-- Buscar respuestas por coach
CREATE INDEX IF NOT EXISTS idx_submissions_coach
  ON intake_form_submissions (coach_id);

-- Buscar respuestas por estudiante
CREATE INDEX IF NOT EXISTS idx_submissions_student
  ON intake_form_submissions (student_id);

-- Consultas sobre el perfil del estudiante
CREATE INDEX IF NOT EXISTS idx_student_profile_objetivo
  ON student_profiles (objetivo_principal);

CREATE INDEX IF NOT EXISTS idx_student_profile_nivel
  ON student_profiles (nivel_experiencia);

-- ─────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE intake_form_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_form_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_form_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles         ENABLE ROW LEVEL SECURITY;

-- Templates: el coach ve y edita los suyos; estudiantes ven lo que se les asigna
CREATE POLICY "coach_own_templates" ON intake_form_templates
  FOR ALL USING (auth.uid() = coach_id);

-- Assignments: coach gestiona las suyas; estudiante ve las que le corresponden
CREATE POLICY "coach_own_assignments" ON intake_form_assignments
  FOR ALL USING (auth.uid() = coach_id);

CREATE POLICY "student_own_assignment" ON intake_form_assignments
  FOR SELECT USING (auth.uid() = student_id);

-- Submissions: coach lee; estudiante escribe y lee la propia
CREATE POLICY "coach_read_submissions" ON intake_form_submissions
  FOR SELECT USING (auth.uid() = coach_id);

CREATE POLICY "student_own_submission" ON intake_form_submissions
  FOR ALL USING (auth.uid() = student_id);

-- Perfil: coach lee el de sus estudiantes
CREATE POLICY "student_own_profile" ON student_profiles
  FOR ALL USING (auth.uid() = student_id);

-- (Opcional: agregar policy para que el coach pueda leer perfiles de SUS alumnos)
-- CREATE POLICY "coach_read_student_profiles" ON student_profiles
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM intake_form_assignments a
--       WHERE a.student_id = student_profiles.student_id
--         AND a.coach_id = auth.uid()
--     )
--   );

-- ─────────────────────────────────────────────────────────────
-- 7. TRIGGER: updated_at automático
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON intake_form_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 8. FUNCIÓN: crear perfil del estudiante post-submission
-- ─────────────────────────────────────────────────────────────
-- Extrae campos clave de las respuestas y los guarda en student_profiles.
-- Llamar desde la app tras recibir el submission.
CREATE OR REPLACE FUNCTION process_intake_submission(submission_id uuid)
RETURNS void AS $$
DECLARE
  sub intake_form_submissions%ROWTYPE;
  resp jsonb;
BEGIN
  SELECT * INTO sub FROM intake_form_submissions WHERE id = submission_id;
  resp := sub.responses;

  INSERT INTO student_profiles (
    student_id,
    submission_id,
    nombre,
    apellido,
    objetivo_principal,
    nivel_experiencia,
    frecuencia_semanal,
    lugar_entrenamiento,
    tiene_lesiones,
    patologias,
    raw_data
  ) VALUES (
    sub.student_id,
    sub.id,
    resp->>'nombre',
    resp->>'apellido',
    resp->>'objetivo_principal',
    resp->>'experiencia_nivel',
    resp->>'frecuencia_semanal',
    resp->>'lugar_entrenamiento',
    (resp->>'tiene_lesiones')::boolean,
    ARRAY(SELECT jsonb_array_elements_text(resp->'patologias')),
    resp
  )
  ON CONFLICT (student_id) DO UPDATE SET
    submission_id       = EXCLUDED.submission_id,
    nombre              = EXCLUDED.nombre,
    apellido            = EXCLUDED.apellido,
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
