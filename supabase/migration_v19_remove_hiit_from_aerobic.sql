-- ============================================================
-- Migration v19: Sacar HIIT como formato de Aeróbico
-- ============================================================
-- Motivación:
--   La app tenía dos formas de armar un HIIT:
--     - Bloque AERÓBICO con aerobic_format='hiit'
--     - Bloque CIRCUITO con circuit_type='hiit'  (← canónico)
--   La coach SIEMPRE arma HIIT como circuito, así que sacamos la
--   opción duplicada del aeróbico para evitar confusión.
--
--   Bloques aeróbicos existentes con format='hiit' se migran a
--   'intervals' (es lo más cercano: trabajo/descanso/rondas).
--   Si querés revisar cuáles fueron, los listo después.
-- ============================================================

-- Para ver qué bloques se van a tocar (correrlo antes si querés
-- chequear, pero no es obligatorio):
-- SELECT id, plan_id, section, aerobic_format, aerobic_total_minutes,
--        aerobic_work_seconds, aerobic_rest_seconds, aerobic_rounds
-- FROM public.plan_blocks
-- WHERE block_type = 'aerobic' AND aerobic_format = 'hiit';

-- Migrar a 'intervals'
UPDATE public.plan_blocks
SET aerobic_format = 'intervals'
WHERE block_type = 'aerobic'
  AND aerobic_format = 'hiit';

-- Actualizar el CHECK constraint para que ya no acepte 'hiit'
-- (sólo afecta inserts/updates futuros)
ALTER TABLE public.plan_blocks
  DROP CONSTRAINT IF EXISTS plan_blocks_aerobic_format_check;

ALTER TABLE public.plan_blocks
  ADD CONSTRAINT plan_blocks_aerobic_format_check
  CHECK (aerobic_format IN ('continuous', 'intervals', 'progressive'));
