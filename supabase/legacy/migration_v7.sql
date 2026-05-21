-- ============================================================
-- GYM APP v7 - Peso sugerido por serie en plan
-- Ejecutar DESPUÉS de migration_v6.sql
-- Agrega soporte para que el coach prescriba un peso distinto
-- por cada serie al definir un ejercicio dentro de un plan.
-- ============================================================

-- Columna suggested_weights: almacena los pesos sugeridos por serie como JSON array
-- Mismo formato que suggested_reps y actual_weights
-- Ej: "[20,22.5,25]" o "20" si todas las series tienen el mismo peso
alter table public.plan_exercises
  add column if not exists suggested_weights text;

comment on column public.plan_exercises.suggested_weights is
  'Pesos sugeridos por serie en formato JSON array o valor único. Ej: "[20,22.5,25]" o "20". Reemplaza suggested_weight para planes nuevos; suggested_weight se mantiene por retrocompatibilidad.';
