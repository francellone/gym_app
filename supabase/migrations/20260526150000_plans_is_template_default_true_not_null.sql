-- 20260526150000_plans_is_template_default_true_not_null.sql
-- ===========================================================
-- C2 del doc 34 (2026-05-26 PM):
--   Hoy la columna plans.is_template tiene column_default=false
--   y is_nullable=YES. Pero la convención B4+Q10 (24/05) dice que
--   "todo plan se crea como template" — CreatePlanPage:440 y
--   DuplicatePlanModal:38 (fix del 26/05) lo fuerzan a true en
--   sus INSERTs. Cualquier INSERT futuro que omita la columna
--   entra como instancia, lo cual ya pasó con las evals del 24/04.
--
--   Cambios:
--     - default true (consistente con la convención)
--     - NOT NULL (no hay filas con NULL al 26/05 — verificado)
--
--   Verificación previa:
--     SELECT COUNT(*) FROM plans WHERE is_template IS NULL;  -- = 0
--
--   La RPC assign_template_to_student inserta clones con
--   is_template=false explícito; sigue funcionando sin cambios.
-- ===========================================================

ALTER TABLE public.plans
  ALTER COLUMN is_template SET DEFAULT true;

ALTER TABLE public.plans
  ALTER COLUMN is_template SET NOT NULL;
