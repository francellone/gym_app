-- ============================================================
-- GYM APP v5 - MIGRATION
-- Secciones dinámicas por días y activación configurable
-- Ejecutar DESPUÉS de migration_v4.sql y migration_v4b.sql
-- ============================================================

-- ============================================================
-- 1. COLUMNA has_activation EN plans
--    Controla si el plan incluye bloque de Activación.
--    Por defecto false (retrocompatibilidad).
-- ============================================================
alter table public.plans
  add column if not exists has_activation boolean default false;

-- ============================================================
-- NOTA: No es necesario migrar plan_exercises.section
-- El campo ya es text sin constraint CHECK, por lo tanto
-- admite los nuevos valores: 'day_c', 'day_d', 'day_e',
-- 'day_f', 'day_g' sin cambios en la DB.
-- ============================================================
