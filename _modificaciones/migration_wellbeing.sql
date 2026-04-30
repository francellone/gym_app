-- =====================================================================
-- Migración: tabla wellbeing_logs
-- Ejecutar en Supabase → SQL Editor
-- =====================================================================
-- Registra el estado de bienestar del alumno al comienzo de cada
-- sesión de entrenamiento. Una entrada por alumno por día.
-- =====================================================================

CREATE TABLE IF NOT EXISTS wellbeing_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date              DATE        NOT NULL,

  -- Métricas (escala 1–10)
  sleep_quality     SMALLINT    CHECK (sleep_quality     BETWEEN 1 AND 10),
  nutrition_quality SMALLINT    CHECK (nutrition_quality BETWEEN 1 AND 10),
  hydration_quality SMALLINT    CHECK (hydration_quality BETWEEN 1 AND 10),
  energy_level      SMALLINT    CHECK (energy_level      BETWEEN 1 AND 10),
  stress_level      SMALLINT    CHECK (stress_level      BETWEEN 1 AND 10),
  muscle_fatigue    SMALLINT    CHECK (muscle_fatigue    BETWEEN 1 AND 10),

  -- Observaciones libres del alumno
  notes             TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  -- Un solo registro por alumno por día
  UNIQUE (user_id, date)
);

-- ── Índice para consultas por fecha ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wellbeing_logs_user_date
  ON wellbeing_logs (user_id, date DESC);

-- ── Row Level Security ───────────────────────────────────────────────
ALTER TABLE wellbeing_logs ENABLE ROW LEVEL SECURITY;

-- Alumno: puede ver y modificar solo sus propios registros
CREATE POLICY "Students manage own wellbeing logs"
  ON wellbeing_logs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Coach: puede ver todos los registros (lectura)
CREATE POLICY "Coach can read all wellbeing logs"
  ON wellbeing_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'coach'
    )
  );

-- ── Trigger: actualizar updated_at automáticamente ──────────────────
CREATE OR REPLACE FUNCTION update_wellbeing_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wellbeing_updated_at ON wellbeing_logs;
CREATE TRIGGER trg_wellbeing_updated_at
  BEFORE UPDATE ON wellbeing_logs
  FOR EACH ROW EXECUTE FUNCTION update_wellbeing_updated_at();

-- =====================================================================
-- Verificación: confirmar que la tabla existe
-- =====================================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'wellbeing_logs'
-- ORDER BY ordinal_position;
