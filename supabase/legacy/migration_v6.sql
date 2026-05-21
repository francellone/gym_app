-- ============================================================
-- GYM APP v6 - Peso por serie
-- Ejecutar DESPUÉS de migration_v5.sql
-- Agrega soporte para registrar un peso distinto por cada serie
-- ============================================================

-- Columna actual_weights: almacena los pesos por serie como JSON array
-- Mismo formato que actual_reps: ej. "[20,20,22.5]" o "20" si todos iguales
alter table public.workout_logs
  add column if not exists actual_weights text;

-- Comentario descriptivo
comment on column public.workout_logs.actual_weights is
  'Pesos por serie en formato JSON array o valor único. Ej: "[20,20,22.5]" o "20". Reemplaza actual_weight para registros nuevos; actual_weight se mantiene por retrocompatibilidad.';
