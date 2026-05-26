-- 20260526150100_plans_add_cloned_from_plan_id.sql
-- ===========================================================
-- C1 del doc 34 (2026-05-26 PM) — parte schema:
--   Hasta hoy, el linaje template → clon solo era reconstruible
--   parseando el sufijo "[Clonado de \"...\" (template_id=<uuid>) ...]"
--   del campo description del clon. Frágil (editable) e ineficiente
--   para queries de auditoría.
--
--   La columna parent_plan_id está reservada por el trigger
--   plans_validate_parent para linkeo eval-template → training-template
--   y no se puede reusar para template→clon. Agregamos columna nueva.
--
--   ON DELETE SET NULL para que si en el futuro se borra un template,
--   el clon sobreviva (la asignación al alumno + sus resultados son
--   datos del alumno).
--
-- Esta migración SOLO agrega columna + índice. La actualización de
-- la RPC y el backfill van en migraciones separadas (más fáciles de
-- revertir si algo sale mal).
-- ===========================================================

ALTER TABLE public.plans
  ADD COLUMN cloned_from_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS plans_cloned_from_plan_id_idx
  ON public.plans(cloned_from_plan_id);

COMMENT ON COLUMN public.plans.cloned_from_plan_id IS
  'Linaje template→clon (C1 doc 34, 2026-05-26). NULL para templates y para clones legacy anteriores a la migración. Separado de parent_plan_id, que está reservado para linkeo eval-template→training-template (ver trigger plans_validate_parent).';
