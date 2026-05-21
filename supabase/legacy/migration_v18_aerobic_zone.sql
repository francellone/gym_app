-- ============================================================
-- Migration v18: Zona aeróbica obligatoria (Z1-Z5)
-- ============================================================
-- Motivación:
--   Los bloques aeróbicos ahora tienen una zona objetivo (Z1-Z5)
--   asociada al RPE Cardio con talk test. Reemplaza al campo libre
--   `aerobic_intensity` (soft/moderate/intense) con algo más
--   específico, manteniendo `aerobic_expected_sensation` como
--   complemento opcional para casos especiales (lesiones, etc).
--
--   La zona se elige al armar el plan; el alumno la ve al registrar.
--
--   Bloques existentes: se inicializan con 'Z2' como default razonable
--   (intensidad leve-moderada, conversación fluida). El coach puede
--   editar después.
-- ============================================================

ALTER TABLE public.plan_blocks
  ADD COLUMN IF NOT EXISTS aerobic_zone text
    CHECK (aerobic_zone IN ('Z1', 'Z2', 'Z3', 'Z4', 'Z5'));

-- Backfill de bloques aeróbicos existentes
UPDATE public.plan_blocks
SET aerobic_zone = 'Z2'
WHERE block_type = 'aerobic'
  AND aerobic_zone IS NULL;
