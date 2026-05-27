-- Drop columna `is_active` de exercises + su índice parcial.
--
-- Razón: la columna se introdujo en `fix_5_1_5_3_exercises_cosmetic` (2026-05-16)
-- como "foto" de 167 ejercicios sin uso al momento, con la intención de filtrar
-- pickers. El front nunca completó esa parte (solo notes/api.js la respetaba), no
-- la usa ninguna RLS/RPC/trigger, y la columna quedó desfasada (~8% del catálogo
-- ya no representa "tiene uso").
--
-- Decisión de producto (2026-05-27): el coach debe ver todos los ejercicios sin
-- distinción — un ejercicio sin uso hoy puede estar en un plan mañana. La
-- organización visual queda 100% a cargo del sistema de etiquetas (exercise_tags).
-- Si en algún futuro vuelve a tener sentido un soft-delete real, se diseñará con
-- `archived_at timestamp` (más expresivo) y UI explícita para reactivar.

DROP INDEX IF EXISTS public.idx_exercises_is_active_true;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS is_active;
