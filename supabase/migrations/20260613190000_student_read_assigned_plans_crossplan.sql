-- doc 51: el alumno puede leer la estructura (plans / plan_exercises / exercises)
-- de TODOS sus planes asignados (activos e inactivos), no solo el activo.
-- Esto destraba el historial cross-plan en Progreso y en "última vez" (doc 49/50).
-- NO se toca get_my_active_plan_ids(): la lógica de "plan activo" (entrenamiento
-- del día) sigue dependiendo de active=true.
--
-- Causa raíz: todo el modelo de lectura del alumno estaba scopeado al plan activo
-- vía get_my_active_plan_ids(); los workout_logs viejos eran visibles pero su join
-- a plan_exercises devolvía null para planes no-activos → el ejercicio se caía del
-- gráfico y del selector. Verificado en prod (Sentadilla mostraba 1 punto en vez
-- de 5). Seguridad chequeada: el alumno sigue sin poder leer planes de otro alumno.

-- 1) Nueva función: todos los plan_ids asignados al alumno (sin importar active).
CREATE OR REPLACE FUNCTION public.get_my_assigned_plan_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT plan_id
  FROM public.plan_assignments
  WHERE student_id = auth.uid();
$function$;

-- 2) plans: el alumno ve todos sus planes asignados (no solo el activo).
DROP POLICY IF EXISTS student_view_own_plans ON public.plans;
CREATE POLICY student_view_own_plans ON public.plans
  FOR SELECT
  USING (id IN (SELECT public.get_my_assigned_plan_ids()));

-- 3) plan_exercises: idem.
DROP POLICY IF EXISTS student_view_own_plan_exercises ON public.plan_exercises;
CREATE POLICY student_view_own_plan_exercises ON public.plan_exercises
  FOR SELECT
  USING (plan_id IN (SELECT public.get_my_assigned_plan_ids()));

-- 4) exercises: el helper pasa a derivar de TODOS los planes asignados.
CREATE OR REPLACE FUNCTION public.get_my_assigned_exercise_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT pe.exercise_id
  FROM public.plan_exercises pe
  WHERE pe.plan_id IN (SELECT public.get_my_assigned_plan_ids());
$function$;
