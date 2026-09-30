-- v70b — Rendimiento de RLS en planes y notas (continuación de v70)
-- plan_exercises / plan_blocks evaluaban EXISTS sobre plans fila por fila
-- (una persona tardaba ~34 ms en leer sus 20 ejercicios porque se revisaban
-- las 2060 filas). Las policies coach_manage_own_* quedaron redundantes desde
-- v64 (owner_manage_own_* cubre lo mismo sin exigir rol) y se borran.

CREATE OR REPLACE FUNCTION public.my_own_plan_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id FROM public.plans p WHERE p.created_by = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_own_plan_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_own_plan_ids() TO authenticated;

DROP POLICY IF EXISTS coach_manage_own_plans ON public.plans;
DROP POLICY IF EXISTS coach_manage_own_plan_exercises ON public.plan_exercises;
DROP POLICY IF EXISTS coach_manage_own_plan_blocks ON public.plan_blocks;

DROP POLICY IF EXISTS owner_manage_own_plan_exercises ON public.plan_exercises;
CREATE POLICY owner_manage_own_plan_exercises ON public.plan_exercises FOR ALL TO authenticated
  USING (plan_id IN (SELECT public.my_own_plan_ids()))
  WITH CHECK (plan_id IN (SELECT public.my_own_plan_ids()));
DROP POLICY IF EXISTS owner_manage_own_plan_blocks ON public.plan_blocks;
CREATE POLICY owner_manage_own_plan_blocks ON public.plan_blocks FOR ALL TO authenticated
  USING (plan_id IN (SELECT public.my_own_plan_ids()))
  WITH CHECK (plan_id IN (SELECT public.my_own_plan_ids()));

-- Notas: hilos donde soy la coach (y la persona sigue siendo mía) / hilos propios
CREATE OR REPLACE FUNCTION public.my_coach_thread_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT nt.id FROM public.note_threads nt
   WHERE nt.coach_id = auth.uid()
     AND nt.student_id IN (SELECT public.my_student_ids());
$$;
REVOKE ALL ON FUNCTION public.my_coach_thread_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_coach_thread_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_own_thread_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT nt.id FROM public.note_threads nt WHERE nt.student_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_own_thread_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_own_thread_ids() TO authenticated;

DROP POLICY IF EXISTS coach_select_own_students_notes ON public.notes;
CREATE POLICY coach_select_own_students_notes ON public.notes FOR SELECT TO authenticated
  USING (thread_id IN (SELECT public.my_coach_thread_ids()));
DROP POLICY IF EXISTS coach_update_own_students_notes ON public.notes;
CREATE POLICY coach_update_own_students_notes ON public.notes FOR UPDATE TO authenticated
  USING (thread_id IN (SELECT public.my_coach_thread_ids()))
  WITH CHECK (thread_id IN (SELECT public.my_coach_thread_ids()));
DROP POLICY IF EXISTS coach_insert_own_students_notes ON public.notes;
CREATE POLICY coach_insert_own_students_notes ON public.notes FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND author_role = 'coach'
              AND thread_id IN (SELECT public.my_coach_thread_ids()));

DROP POLICY IF EXISTS "Student read shared notes of own thread" ON public.notes;
CREATE POLICY "Student read shared notes of own thread" ON public.notes FOR SELECT TO authenticated
  USING (visibility = 'shared' AND deleted_at IS NULL AND thread_id IN (SELECT public.my_own_thread_ids()));
DROP POLICY IF EXISTS "Student select own notes any state" ON public.notes;
CREATE POLICY "Student select own notes any state" ON public.notes FOR SELECT TO authenticated
  USING (author_id = (SELECT auth.uid()) AND author_role = 'student');
DROP POLICY IF EXISTS "Student update own notes" ON public.notes;
CREATE POLICY "Student update own notes" ON public.notes FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid()) AND author_role = 'student')
  WITH CHECK (author_id = (SELECT auth.uid()) AND author_role = 'student' AND visibility = 'shared');
DROP POLICY IF EXISTS "Student insert own notes" ON public.notes;
CREATE POLICY "Student insert own notes" ON public.notes FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND author_role = 'student' AND visibility = 'shared'
              AND thread_id IN (SELECT public.my_own_thread_ids()));
