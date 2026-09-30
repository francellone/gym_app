-- v70 — Rendimiento de RLS en las tablas de hechos
-- Diagnóstico 2026-09-30 (Franco: "la app tarda al entrar"): contar workout_logs
-- como Anto tardaba ~150 ms. La mitad era la policy restrictiva history_cutoff
-- (v65) que llamaba a coach_history_visible() fila por fila: la función tiene
-- SET search_path y eso impide que Postgres la "inline". La otra mitad, las
-- policies de coach con is_coach() + EXISTS por fila (auth.uid() sin envolver).
--
-- Mismo significado, evaluado como conjunto (se calcula una vez por consulta):
--   my_student_ids()      personas cuya coach soy yo (y soy coach)
--   history_cutoff_ids()  personas con coach_visible_since (hoy: ninguna)
-- Lección v62b aplicada a todas las tablas de hechos.

CREATE OR REPLACE FUNCTION public.my_student_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id FROM public.profiles p
   WHERE p.coach_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'coach');
$$;
REVOKE ALL ON FUNCTION public.my_student_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_student_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.history_cutoff_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id FROM public.profiles p WHERE p.coach_visible_since IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.history_cutoff_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.history_cutoff_ids() TO authenticated;

-- ── history_cutoff: primero el atajo por conjunto, la función solo si hace falta
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('workout_logs', 'student_id', 'logged_date'),
      ('workout_sessions', 'student_id', 'logged_date'),
      ('workout_block_logs', 'student_id', 'logged_date'),
      ('wellbeing_logs', 'user_id', 'date'),
      ('activity_logs', 'student_id', 'date'),
      ('evaluation_results', 'student_id', 'eval_date'),
      ('student_milestones', 'student_id', '((created_at AT TIME ZONE ''America/Argentina/Cordoba''))::date')
    ) AS t(tbl, who, day)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS history_cutoff ON public.%I', r.tbl);
    EXECUTE format(
      'CREATE POLICY history_cutoff ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ('
      || '%I = (SELECT auth.uid()) OR %I NOT IN (SELECT public.history_cutoff_ids()) '
      || 'OR public.coach_history_visible(%I, %s))',
      r.tbl, r.who, r.who, r.who, r.day);
  END LOOP;
END $$;

-- ── Policies de coach como conjunto
-- workout_logs
DROP POLICY IF EXISTS coach_view_own_students_logs ON public.workout_logs;
CREATE POLICY coach_view_own_students_logs ON public.workout_logs FOR SELECT TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()));
DROP POLICY IF EXISTS coach_update_own_students_logs ON public.workout_logs;
CREATE POLICY coach_update_own_students_logs ON public.workout_logs FOR UPDATE TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()));
DROP POLICY IF EXISTS coach_delete_own_students_logs ON public.workout_logs;
CREATE POLICY coach_delete_own_students_logs ON public.workout_logs FOR DELETE TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()) AND source = 'coach');
DROP POLICY IF EXISTS student_manage_own_logs ON public.workout_logs;
CREATE POLICY student_manage_own_logs ON public.workout_logs FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- workout_sessions
DROP POLICY IF EXISTS coach_view_own_students_sessions ON public.workout_sessions;
CREATE POLICY coach_view_own_students_sessions ON public.workout_sessions FOR SELECT TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()));
DROP POLICY IF EXISTS coach_update_own_students_sessions ON public.workout_sessions;
CREATE POLICY coach_update_own_students_sessions ON public.workout_sessions FOR UPDATE TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()));
DROP POLICY IF EXISTS coach_insert_own_students_sessions ON public.workout_sessions;
CREATE POLICY coach_insert_own_students_sessions ON public.workout_sessions FOR INSERT TO authenticated
  WITH CHECK (student_id IN (SELECT public.my_student_ids()) AND source = 'coach'
              AND logged_by = (SELECT auth.uid()));
DROP POLICY IF EXISTS student_manage_own_sessions ON public.workout_sessions;
CREATE POLICY student_manage_own_sessions ON public.workout_sessions FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- workout_block_logs
DROP POLICY IF EXISTS coach_view_own_students_block_logs ON public.workout_block_logs;
CREATE POLICY coach_view_own_students_block_logs ON public.workout_block_logs FOR SELECT TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()));
DROP POLICY IF EXISTS coach_update_own_students_block_logs ON public.workout_block_logs;
CREATE POLICY coach_update_own_students_block_logs ON public.workout_block_logs FOR UPDATE TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()))
  WITH CHECK (student_id IN (SELECT public.my_student_ids()));
DROP POLICY IF EXISTS coach_delete_own_students_block_logs ON public.workout_block_logs;
CREATE POLICY coach_delete_own_students_block_logs ON public.workout_block_logs FOR DELETE TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()) AND source = 'coach');
DROP POLICY IF EXISTS coach_insert_own_students_block_logs ON public.workout_block_logs;
CREATE POLICY coach_insert_own_students_block_logs ON public.workout_block_logs FOR INSERT TO authenticated
  WITH CHECK (student_id IN (SELECT public.my_student_ids()) AND source = 'coach'
              AND logged_by = (SELECT auth.uid()));
DROP POLICY IF EXISTS student_manage_own_block_logs ON public.workout_block_logs;
CREATE POLICY student_manage_own_block_logs ON public.workout_block_logs FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- wellbeing_logs
DROP POLICY IF EXISTS coach_select_own_students_wellbeing ON public.wellbeing_logs;
CREATE POLICY coach_select_own_students_wellbeing ON public.wellbeing_logs FOR SELECT TO authenticated
  USING (user_id IN (SELECT public.my_student_ids()));
DROP POLICY IF EXISTS "Students manage own wellbeing logs" ON public.wellbeing_logs;
CREATE POLICY "Students manage own wellbeing logs" ON public.wellbeing_logs FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- activity_logs
DROP POLICY IF EXISTS activity_coach_own_students ON public.activity_logs;
CREATE POLICY activity_coach_own_students ON public.activity_logs FOR ALL TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()))
  WITH CHECK (student_id IN (SELECT public.my_student_ids()));
DROP POLICY IF EXISTS activity_student_select ON public.activity_logs;
CREATE POLICY activity_student_select ON public.activity_logs FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- evaluation_results
DROP POLICY IF EXISTS coach_manage_own_eval_results ON public.evaluation_results;
CREATE POLICY coach_manage_own_eval_results ON public.evaluation_results FOR ALL TO authenticated
  USING (student_id IN (SELECT public.my_student_ids()));
DROP POLICY IF EXISTS student_manage_own_eval_results ON public.evaluation_results;
CREATE POLICY student_manage_own_eval_results ON public.evaluation_results FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- student_milestones
DROP POLICY IF EXISTS student_milestones_select ON public.student_milestones;
CREATE POLICY student_milestones_select ON public.student_milestones FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR student_id IN (SELECT public.my_student_ids()));
