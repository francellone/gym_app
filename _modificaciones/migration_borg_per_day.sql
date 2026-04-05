-- =====================================================================
-- Migración: agregar borg_per_day a workout_sessions
-- Ejecutar en Supabase → SQL Editor
-- =====================================================================
-- Esta columna almacena el PSE (esfuerzo percibido) por cada día del plan.
-- Ejemplo de contenido:
--   { "day_a": 7, "day_a_notes": "Estuve muy bien", "day_b": 5 }
-- =====================================================================

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS borg_per_day JSONB DEFAULT '{}';

-- Índice GIN para consultas sobre el contenido del JSONB (opcional, mejora performance)
CREATE INDEX IF NOT EXISTS idx_workout_sessions_borg_per_day
  ON workout_sessions USING GIN (borg_per_day);

-- =====================================================================
-- Verificación: correr esto para confirmar que la columna existe
-- =====================================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'workout_sessions'
-- AND column_name = 'borg_per_day';
