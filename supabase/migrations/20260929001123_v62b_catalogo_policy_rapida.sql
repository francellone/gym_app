-- v62b — Misma regla de visibilidad del catálogo que v62, evaluada rápido
--
-- v62 llamaba can_see_exercise() por fila: 176 ms para una persona y 383 ms
-- para un coach sin acceso al contar el catálogo entero. Ahora:
--   * auth.uid() y catalog_reader() van como subconsulta escalar (se calculan
--     una vez por consulta, no por fila);
--   * los ejercicios de "mis planes" salen de un conjunto calculado una vez
--     (my_plan_exercise_ids), mismo patrón que get_my_assigned_exercise_ids.
-- Medido con rollback: 18-35 ms en los cuatro perfiles y conteos idénticos.

CREATE OR REPLACE FUNCTION public.my_plan_exercise_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT x FROM (
    -- planes asignados a mí
    SELECT pe.exercise_id AS a, pe.rm_reference_exercise_id AS b
      FROM public.plan_exercises pe
      JOIN public.plan_assignments pa ON pa.plan_id = pe.plan_id
     WHERE pa.student_id = auth.uid()
    UNION ALL
    -- coach: planes míos o de mis personas
    SELECT pe.exercise_id, pe.rm_reference_exercise_id
      FROM public.plan_exercises pe
      JOIN public.plans p ON p.id = pe.plan_id
     WHERE public.is_coach()
       AND (p.created_by = auth.uid()
            OR EXISTS (SELECT 1 FROM public.plan_assignments pa
                        WHERE pa.plan_id = p.id AND public.is_coach_of(pa.student_id)))
  ) s, LATERAL (VALUES (s.a), (s.b)) v(x)
  WHERE x IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.my_plan_exercise_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_plan_exercise_ids() TO authenticated;

DROP POLICY IF EXISTS select_visible_exercises ON public.exercises;
CREATE POLICY select_visible_exercises ON public.exercises
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR ((SELECT public.catalog_reader(auth.uid())) AND public.catalog_contributes(created_by))
    OR id IN (SELECT public.my_plan_exercise_ids())
  );

DROP FUNCTION IF EXISTS public.can_see_exercise(uuid, uuid);
