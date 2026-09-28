-- v61 — Cada coach ve solo a SUS personas (7 tablas que no estaban acotadas)
--
-- Auditoría 2026-08 (rls-alcance-multicoach): en estas tablas alcanzaba con
-- role='coach' para ver o editar datos de TODAS las personas. Con el ingreso
-- abierto (cualquiera puede hacerse perfil de coach) deja de ser teórico.
--
-- Criterio único, el de v33: la persona es "mía" si profiles.coach_id =
-- auth.uid(). Para planes: plans.created_by = auth.uid() (igual que
-- plans / plan_exercises). Se encapsula en is_coach_of() (SECURITY DEFINER,
-- evita recursión de RLS sobre profiles).
--
-- Efecto sobre datos reales: ninguno para Anto. Quedan fuera de su vista solo
-- los 4 perfiles de prueba sin coach (is_test) cuyos hilos apuntan a la
-- cuenta de prueba Carlos Sosa; ya eran invisibles en workout_logs.
--
-- Las escrituras que pasan por RPC SECURITY DEFINER (notas, wellbeing,
-- hilos) no dependen de estas policies.

CREATE OR REPLACE FUNCTION public.is_coach_of(p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_coach() AND EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_student AND coach_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_coach_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coach_of(uuid) TO authenticated;

-- wellbeing_logs ---------------------------------------------------------
DROP POLICY IF EXISTS "Coach can read all wellbeing logs" ON public.wellbeing_logs;
CREATE POLICY coach_select_own_students_wellbeing ON public.wellbeing_logs
  FOR SELECT TO authenticated
  USING (public.is_coach_of(user_id));

-- note_threads -----------------------------------------------------------
DROP POLICY IF EXISTS "Coach full access on note_threads" ON public.note_threads;
CREATE POLICY coach_manage_own_students_threads ON public.note_threads
  FOR ALL TO authenticated
  USING (public.is_coach_of(student_id))
  WITH CHECK (public.is_coach_of(student_id) AND coach_id = auth.uid());

-- notes ------------------------------------------------------------------
DROP POLICY IF EXISTS "Coach select all notes" ON public.notes;
DROP POLICY IF EXISTS "Coach update notes" ON public.notes;
DROP POLICY IF EXISTS "Coach insert as self coach" ON public.notes;

CREATE POLICY coach_select_own_students_notes ON public.notes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.note_threads nt
                  WHERE nt.id = notes.thread_id
                    AND public.is_coach_of(nt.student_id)));

CREATE POLICY coach_update_own_students_notes ON public.notes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.note_threads nt
                  WHERE nt.id = notes.thread_id
                    AND public.is_coach_of(nt.student_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.note_threads nt
                       WHERE nt.id = notes.thread_id
                         AND public.is_coach_of(nt.student_id)));

CREATE POLICY coach_insert_own_students_notes ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid()
              AND author_role = 'coach'
              AND EXISTS (SELECT 1 FROM public.note_threads nt
                           WHERE nt.id = notes.thread_id
                             AND public.is_coach_of(nt.student_id)));

-- evaluation_tests (cuelgan de un plan: del coach que lo creó) -----------
DROP POLICY IF EXISTS "Coach full access on evaluation_tests" ON public.evaluation_tests;
CREATE POLICY coach_manage_own_evaluation_tests ON public.evaluation_tests
  FOR ALL TO authenticated
  USING (public.is_coach() AND EXISTS (
    SELECT 1 FROM public.plans p
     WHERE p.id = evaluation_tests.plan_id AND p.created_by = auth.uid()))
  WITH CHECK (public.is_coach() AND EXISTS (
    SELECT 1 FROM public.plans p
     WHERE p.id = evaluation_tests.plan_id AND p.created_by = auth.uid()));

-- evaluation_test_responses (de la persona, vía evaluation_results) -----
DROP POLICY IF EXISTS "Coach full access on evaluation_test_responses" ON public.evaluation_test_responses;
CREATE POLICY coach_manage_own_students_eval_responses ON public.evaluation_test_responses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.evaluation_results er
                  WHERE er.id = evaluation_test_responses.evaluation_result_id
                    AND public.is_coach_of(er.student_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.evaluation_results er
                       WHERE er.id = evaluation_test_responses.evaluation_result_id
                         AND public.is_coach_of(er.student_id)));

-- plan_blocks (igual que plan_exercises) ---------------------------------
DROP POLICY IF EXISTS coach_manage_plan_blocks ON public.plan_blocks;
CREATE POLICY coach_manage_own_plan_blocks ON public.plan_blocks
  FOR ALL TO authenticated
  USING (public.is_coach() AND EXISTS (
    SELECT 1 FROM public.plans p
     WHERE p.id = plan_blocks.plan_id AND p.created_by = auth.uid()))
  WITH CHECK (public.is_coach() AND EXISTS (
    SELECT 1 FROM public.plans p
     WHERE p.id = plan_blocks.plan_id AND p.created_by = auth.uid()));

-- workout_block_logs (SELECT/UPDATE; INSERT/DELETE ya estaban acotados) --
DROP POLICY IF EXISTS coach_view_all_block_logs ON public.workout_block_logs;
DROP POLICY IF EXISTS coach_update_all_block_logs ON public.workout_block_logs;
CREATE POLICY coach_view_own_students_block_logs ON public.workout_block_logs
  FOR SELECT TO authenticated
  USING (public.is_coach_of(student_id));
CREATE POLICY coach_update_own_students_block_logs ON public.workout_block_logs
  FOR UPDATE TO authenticated
  USING (public.is_coach_of(student_id))
  WITH CHECK (public.is_coach_of(student_id));
