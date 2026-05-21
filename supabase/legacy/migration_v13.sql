-- ============================================================
-- GYM APP v13 - FIX: Recursión infinita en políticas RLS
-- ============================================================
-- Problema detectado:
--   La política "student_view_assigned_exercises" en exercises
--   accede a plan_assignments → cuya política accede a plans →
--   cuya política "student_view_own_plans" vuelve a acceder a
--   plan_assignments → recursión infinita (error 42P17).
--
-- Solución:
--   Crear funciones SECURITY DEFINER que bypasean RLS al leer
--   plan_assignments y plan_exercises. Al ser SECURITY DEFINER,
--   se ejecutan como el owner (postgres) y no activan las
--   políticas RLS de las tablas que consultan internamente.
-- ============================================================


-- ============================================================
-- 1. FUNCIONES HELPER (SECURITY DEFINER = sin RLS interno)
-- ============================================================

-- Devuelve los plan_ids activos del usuario actual (sin triggerear RLS en plan_assignments)
CREATE OR REPLACE FUNCTION public.get_my_active_plan_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT plan_id
  FROM public.plan_assignments
  WHERE student_id = auth.uid()
    AND active = true;
$$;

-- Devuelve los exercise_ids en los planes activos del usuario (sin RLS)
CREATE OR REPLACE FUNCTION public.get_my_assigned_exercise_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT pe.exercise_id
  FROM public.plan_exercises pe
  WHERE pe.plan_id IN (SELECT public.get_my_active_plan_ids());
$$;


-- ============================================================
-- 2. EXERCISES — reemplazar política recursiva
-- ============================================================
DROP POLICY IF EXISTS "student_view_assigned_exercises" ON public.exercises;

CREATE POLICY "student_view_assigned_exercises"
  ON public.exercises FOR SELECT
  USING (
    id IN (SELECT public.get_my_assigned_exercise_ids())
  );


-- ============================================================
-- 3. PLANS — reemplazar política recursiva
-- ============================================================
DROP POLICY IF EXISTS "student_view_own_plans" ON public.plans;

CREATE POLICY "student_view_own_plans"
  ON public.plans FOR SELECT
  USING (
    id IN (SELECT public.get_my_active_plan_ids())
  );


-- ============================================================
-- 4. PLAN_EXERCISES — reemplazar política recursiva
-- ============================================================
DROP POLICY IF EXISTS "student_view_own_plan_exercises" ON public.plan_exercises;

CREATE POLICY "student_view_own_plan_exercises"
  ON public.plan_exercises FOR SELECT
  USING (
    plan_id IN (SELECT public.get_my_active_plan_ids())
  );


-- ============================================================
-- 5. VERIFICACIÓN
-- ============================================================
-- Correr esto después de aplicar la migración para confirmar:
--
-- BEGIN;
--   SET LOCAL role = authenticated;
--   SET LOCAL "request.jwt.claims" = '{"sub":"4d7b89ef-28af-4407-9d91-b5616e806ce3","role":"authenticated"}';
--   SELECT COUNT(*) as ejercicios_visibles FROM public.exercises;
-- ROLLBACK;
--
-- Debería devolver 142.
