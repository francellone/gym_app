-- ============================================================
-- GYM APP v11 - FIX RECURSIÓN INFINITA EN RLS
-- Ejecutar DESPUÉS de migration_v10.sql
-- ============================================================
-- Problema: las policies en profiles (y otras tablas) usaban
--   EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
-- Eso lanza una query sobre profiles mientras se evalúa una
-- policy de profiles → recursión infinita → HTTP 500 →
-- AuthContext falla → pantalla en blanco.
--
-- Solución:
--   1. Asegurarnos de que is_coach() exista como SECURITY DEFINER
--      (se salta RLS cuando consulta profiles internamente)
--   2. Reemplazar TODAS las policies recursivas por unas que
--      usen is_coach() en lugar del subquery directo
-- ============================================================


-- ============================================================
-- 0. PREREQUISITO: coach_id en profiles (idempotente)
--    Por si migration_v10 todavía no se corrió.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_coach_id ON public.profiles(coach_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role     ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_plans_created_by  ON public.plans(created_by);

-- Poblar coach_id para alumnos sin coach asignado
UPDATE public.profiles p
SET coach_id = (
  SELECT pl.created_by
  FROM public.plan_assignments pa
  JOIN public.plans pl ON pl.id = pa.plan_id
  WHERE pa.student_id = p.id
  ORDER BY pa.created_at DESC
  LIMIT 1
)
WHERE p.role = 'student'
  AND p.coach_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.plan_assignments pa WHERE pa.student_id = p.id
  );


-- ============================================================
-- 1. HELPER FUNCTIONS — SECURITY DEFINER (evitan recursión)
-- ============================================================

-- is_coach(): true si el usuario actual tiene role = 'coach'
CREATE OR REPLACE FUNCTION public.is_coach()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'coach'
  );
$$;

-- is_student(): true si el usuario actual tiene role = 'student'
CREATE OR REPLACE FUNCTION public.is_student()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'student'
  );
$$;

-- my_coach_id(): coach_id del usuario actual
CREATE OR REPLACE FUNCTION public.my_coach_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_coach() THEN auth.uid()
    ELSE (SELECT coach_id FROM public.profiles WHERE id = auth.uid())
  END;
$$;


-- ============================================================
-- 2. PROFILES — eliminar TODAS las policies existentes
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END$$;

-- Todos ven su propio perfil (sin subquery a profiles → sin recursión)
CREATE POLICY "select_own_profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Coach ve los perfiles de sus alumnos
CREATE POLICY "coach_select_own_students"
  ON public.profiles FOR SELECT
  USING (is_coach() AND role = 'student' AND coach_id = auth.uid());

-- Coach actualiza su propio perfil y los de sus alumnos
CREATE POLICY "coach_update_profiles"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR (is_coach() AND coach_id = auth.uid()));

-- Alumno actualiza solo su propio perfil
CREATE POLICY "student_update_own_profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id AND is_student());

-- Coach crea perfiles de nuevos alumnos
CREATE POLICY "coach_insert_student_profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR is_coach());


-- ============================================================
-- 3. EXERCISES
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'exercises'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exercises', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_manage_own_exercises"
  ON public.exercises FOR ALL
  USING (created_by = auth.uid() AND is_coach());

CREATE POLICY "student_view_assigned_exercises"
  ON public.exercises FOR SELECT
  USING (
    id IN (
      SELECT pe.exercise_id
      FROM public.plan_exercises pe
      JOIN public.plan_assignments pa ON pa.plan_id = pe.plan_id
      WHERE pa.student_id = auth.uid() AND pa.active = true
    )
  );


-- ============================================================
-- 4. PLANS
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'plans'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.plans', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_manage_own_plans"
  ON public.plans FOR ALL
  USING (created_by = auth.uid() AND is_coach());

CREATE POLICY "student_view_own_plans"
  ON public.plans FOR SELECT
  USING (
    id IN (
      SELECT plan_id FROM public.plan_assignments
      WHERE student_id = auth.uid() AND active = true
    )
  );


-- ============================================================
-- 5. PLAN_ASSIGNMENTS
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'plan_assignments'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.plan_assignments', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_manage_own_assignments"
  ON public.plan_assignments FOR ALL
  USING (
    is_coach() AND EXISTS (
      SELECT 1 FROM public.plans
      WHERE id = plan_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "student_view_own_assignments"
  ON public.plan_assignments FOR SELECT
  USING (student_id = auth.uid());


-- ============================================================
-- 6. PLAN_EXERCISES
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'plan_exercises'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.plan_exercises', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_manage_own_plan_exercises"
  ON public.plan_exercises FOR ALL
  USING (
    is_coach() AND EXISTS (
      SELECT 1 FROM public.plans
      WHERE id = plan_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "student_view_own_plan_exercises"
  ON public.plan_exercises FOR SELECT
  USING (
    plan_id IN (
      SELECT plan_id FROM public.plan_assignments
      WHERE student_id = auth.uid() AND active = true
    )
  );


-- ============================================================
-- 7. WORKOUT_LOGS
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'workout_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.workout_logs', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_view_own_students_logs"
  ON public.workout_logs FOR SELECT
  USING (
    is_coach() AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
  );

CREATE POLICY "coach_update_own_students_logs"
  ON public.workout_logs FOR UPDATE
  USING (
    is_coach() AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
  );

CREATE POLICY "student_manage_own_logs"
  ON public.workout_logs FOR ALL
  USING (student_id = auth.uid());


-- ============================================================
-- 8. WORKOUT_SESSIONS
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'workout_sessions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.workout_sessions', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_view_own_students_sessions"
  ON public.workout_sessions FOR SELECT
  USING (
    is_coach() AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
  );

CREATE POLICY "student_manage_own_sessions"
  ON public.workout_sessions FOR ALL
  USING (student_id = auth.uid());


-- ============================================================
-- 9. EVALUATION_RESULTS
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'evaluation_results'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.evaluation_results', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_manage_own_eval_results"
  ON public.evaluation_results FOR ALL
  USING (
    is_coach() AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
  );

CREATE POLICY "student_manage_own_eval_results"
  ON public.evaluation_results FOR ALL
  USING (student_id = auth.uid());


-- ============================================================
-- 10. STUDENT_EDIT_HISTORY
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'student_edit_history'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.student_edit_history', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_manage_own_edit_history"
  ON public.student_edit_history FOR ALL
  USING (
    is_coach() AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
  );

CREATE POLICY "student_view_own_edit_history"
  ON public.student_edit_history FOR SELECT
  USING (student_id = auth.uid());


-- ============================================================
-- 11. STUDENT_PROFILES
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'student_profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.student_profiles', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_read_own_student_profiles"
  ON public.student_profiles FOR SELECT
  USING (
    is_coach() AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
  );

CREATE POLICY "student_manage_own_student_profiles"
  ON public.student_profiles FOR ALL
  USING (student_id = auth.uid());


-- ============================================================
-- 12. EXERCISE_TAGS
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'exercise_tags'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exercise_tags', r.policyname);
  END LOOP;
END$$;

-- Tags propios del coach (exercise_tags.coach_id = coach's user id)
CREATE POLICY "coach_manage_own_tags"
  ON public.exercise_tags FOR ALL
  USING (coach_id = auth.uid() AND is_coach());

-- Alumnos ven tags de sus ejercicios asignados
CREATE POLICY "student_view_exercise_tags"
  ON public.exercise_tags FOR SELECT
  USING (
    id IN (
      SELECT eta.tag_id
      FROM public.exercise_tag_assignments eta
      JOIN public.plan_exercises pe ON pe.exercise_id = eta.exercise_id
      JOIN public.plan_assignments pa ON pa.plan_id = pe.plan_id
      WHERE pa.student_id = auth.uid() AND pa.active = true
    )
  );


-- ============================================================
-- 13. EXERCISE_TAG_ASSIGNMENTS
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'exercise_tag_assignments'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exercise_tag_assignments', r.policyname);
  END LOOP;
END$$;

CREATE POLICY "coach_manage_own_tag_assignments"
  ON public.exercise_tag_assignments FOR ALL
  USING (
    is_coach() AND EXISTS (
      SELECT 1 FROM public.exercises
      WHERE id = exercise_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "student_view_exercise_tag_assignments"
  ON public.exercise_tag_assignments FOR SELECT
  USING (
    exercise_id IN (
      SELECT pe.exercise_id
      FROM public.plan_exercises pe
      JOIN public.plan_assignments pa ON pa.plan_id = pe.plan_id
      WHERE pa.student_id = auth.uid() AND pa.active = true
    )
  );


-- ============================================================
-- 14. ÍNDICES ADICIONALES DE PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_workout_logs_student_id      ON public.workout_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_student_id  ON public.workout_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_student_id ON public.evaluation_results(student_id);
CREATE INDEX IF NOT EXISTS idx_student_edit_history_student_id ON public.student_edit_history(student_id);
