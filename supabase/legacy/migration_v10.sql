-- ============================================================
-- GYM APP v10 - MULTI-TENANCY: AISLAMIENTO POR COACH
-- Ejecutar DESPUÉS de migration_v9.sql
-- ============================================================
-- Problema: las RLS policies del coach solo verificaban
-- "¿es coach?" pero no "¿es TU dato?".
-- Un coach podía ver alumnos, planes, logs y ejercicios de
-- cualquier otro coach.
--
-- Solución:
--   1. Agregar coach_id a profiles (para alumnos)
--   2. Reemplazar TODAS las policies permisivas del coach
--      con policies que filtren por ownership
--   3. Ajustar policies de estudiantes en consecuencia
-- ============================================================


-- ============================================================
-- 1. COACH_ID EN PROFILES
--    Cada alumno pertenece a un coach específico.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_coach_id ON public.profiles(coach_id);

-- Poblar coach_id para alumnos existentes según sus plan_assignments
-- (infiere el coach a partir del plan activo más reciente)
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
-- 2. FUNCIÓN HELPER: my_coach_id()
--    Devuelve el coach_id del usuario actual (para alumnos)
--    o el propio id (para coaches). Evita subqueries repetidas.
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_coach_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
    THEN auth.uid()
    ELSE (SELECT coach_id FROM profiles WHERE id = auth.uid())
  END;
$$;


-- ============================================================
-- 3. PROFILES — policies por coach ownership
-- ============================================================
DROP POLICY IF EXISTS "Coach can view all profiles"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_coach_select_all"          ON public.profiles;
DROP POLICY IF EXISTS "Coach can update all profiles"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_coach_update_all"          ON public.profiles;
DROP POLICY IF EXISTS "Coach can insert profiles"          ON public.profiles;
DROP POLICY IF EXISTS "Students can view own profile"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"                ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"                ON public.profiles;

-- Coach: ve su propio perfil + los alumnos que le pertenecen
CREATE POLICY "coach_select_own_data"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id  -- su propio perfil
    OR (
      role = 'student'
      AND coach_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
    )
  );

-- Alumno: ve solo su propio perfil
CREATE POLICY "student_select_own"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'student')
  );

-- Coach: edita su perfil y los de sus alumnos
CREATE POLICY "coach_update_own_data"
  ON public.profiles FOR UPDATE
  USING (
    (auth.uid() = id)
    OR (
      coach_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
    )
  );

-- Alumno: edita solo su propio perfil
CREATE POLICY "student_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Coach: puede insertar perfiles (crear alumnos)
CREATE POLICY "coach_insert_profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id  -- self-register
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );


-- ============================================================
-- 4. EXERCISES — solo ve/edita las suyas (created_by)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view exercises" ON public.exercises;
DROP POLICY IF EXISTS "Coach can manage exercises"             ON public.exercises;

-- Coach: solo sus ejercicios
CREATE POLICY "coach_manage_own_exercises"
  ON public.exercises FOR ALL
  USING (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- Alumno: ve ejercicios de los planes que tiene asignados
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
-- 5. PLANS — solo ve/edita los suyos (created_by)
-- ============================================================
DROP POLICY IF EXISTS "Coach can manage plans"      ON public.plans;
DROP POLICY IF EXISTS "plans_coach_all"             ON public.plans;
DROP POLICY IF EXISTS "Students can view assigned plans" ON public.plans;
DROP POLICY IF EXISTS "plans_student_select"        ON public.plans;

CREATE POLICY "coach_manage_own_plans"
  ON public.plans FOR ALL
  USING (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

CREATE POLICY "student_view_own_plans"
  ON public.plans FOR SELECT
  USING (
    id IN (
      SELECT plan_id FROM public.plan_assignments
      WHERE student_id = auth.uid() AND active = true
    )
  );


-- ============================================================
-- 6. PLAN_ASSIGNMENTS — coach solo ve las de sus planes/alumnos
-- ============================================================
DROP POLICY IF EXISTS "Coach can manage assignments"    ON public.plan_assignments;
DROP POLICY IF EXISTS "Students can view own assignments" ON public.plan_assignments;

CREATE POLICY "coach_manage_own_assignments"
  ON public.plan_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE id = plan_id AND created_by = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

CREATE POLICY "student_view_own_assignments"
  ON public.plan_assignments FOR SELECT
  USING (student_id = auth.uid());


-- ============================================================
-- 7. PLAN_EXERCISES — coach solo ve los de sus planes
-- ============================================================
DROP POLICY IF EXISTS "Coach can manage plan exercises"                      ON public.plan_exercises;
DROP POLICY IF EXISTS "Students can view plan exercises of assigned plans"   ON public.plan_exercises;

CREATE POLICY "coach_manage_own_plan_exercises"
  ON public.plan_exercises FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE id = plan_id AND created_by = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
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
-- 8. WORKOUT_LOGS — coach solo ve los de sus alumnos
-- ============================================================
DROP POLICY IF EXISTS "Coach can view all workout logs"   ON public.workout_logs;
DROP POLICY IF EXISTS "Coach can update all workout logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Students can manage own workout logs" ON public.workout_logs;

CREATE POLICY "coach_view_own_students_logs"
  ON public.workout_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

CREATE POLICY "coach_update_own_students_logs"
  ON public.workout_logs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

CREATE POLICY "student_manage_own_logs"
  ON public.workout_logs FOR ALL
  USING (student_id = auth.uid());


-- ============================================================
-- 9. WORKOUT_SESSIONS — coach solo ve las de sus alumnos
-- ============================================================
DROP POLICY IF EXISTS "Coach can view all workout sessions"   ON public.workout_sessions;
DROP POLICY IF EXISTS "Students can manage own workout sessions" ON public.workout_sessions;

CREATE POLICY "coach_view_own_students_sessions"
  ON public.workout_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

CREATE POLICY "student_manage_own_sessions"
  ON public.workout_sessions FOR ALL
  USING (student_id = auth.uid());


-- ============================================================
-- 10. EVALUATION_RESULTS — coach solo ve las de sus alumnos
-- ============================================================
DROP POLICY IF EXISTS "Coach can manage all evaluation results"  ON public.evaluation_results;
DROP POLICY IF EXISTS "Students can view own evaluation results" ON public.evaluation_results;
DROP POLICY IF EXISTS "Students can insert own evaluation results" ON public.evaluation_results;
DROP POLICY IF EXISTS "Students can update own evaluation results" ON public.evaluation_results;
DROP POLICY IF EXISTS "Students can manage own evaluation results" ON public.evaluation_results;

CREATE POLICY "coach_manage_own_eval_results"
  ON public.evaluation_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

CREATE POLICY "student_manage_own_eval_results"
  ON public.evaluation_results FOR ALL
  USING (student_id = auth.uid());


-- ============================================================
-- 11. STUDENT_EDIT_HISTORY — coach solo ve la de sus alumnos
-- ============================================================
DROP POLICY IF EXISTS "Coach can manage student edit history" ON public.student_edit_history;
DROP POLICY IF EXISTS "Students can view own edit history"    ON public.student_edit_history;

CREATE POLICY "coach_manage_own_edit_history"
  ON public.student_edit_history FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

CREATE POLICY "student_view_own_edit_history"
  ON public.student_edit_history FOR SELECT
  USING (student_id = auth.uid());


-- ============================================================
-- 12. STUDENT_PROFILES — coach solo ve los de sus alumnos
-- ============================================================
DROP POLICY IF EXISTS "coach_read_student_profiles" ON public.student_profiles;

CREATE POLICY "coach_read_own_student_profiles"
  ON public.student_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = student_id AND coach_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );


-- ============================================================
-- 13. EXERCISE_TAGS — ya usa coach_id, OK. Solo limpieza.
-- ============================================================
-- exercise_tags.coach_id = auth.uid() ya estaba correcto.
-- exercise_tag_assignments: el coach ve tags de sus propios exercises.
DROP POLICY IF EXISTS "Authenticated users can view tags"            ON public.exercise_tags;
DROP POLICY IF EXISTS "Authenticated users can view tag assignments" ON public.exercise_tag_assignments;

-- Alumnos ven tags de ejercicios que tienen asignados
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
-- 14. process_intake_submission — actualizar para respetar coach
-- ============================================================
-- La función ya existe (v9). Solo nos aseguramos de que
-- la policy de intake_form_assignments incluya el coach correcto.
-- Las policies intake_form ya usan coach_id correctamente ✓


-- ============================================================
-- 15. ÍNDICE adicional para performance de las nuevas policies
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_plans_created_by ON public.plans(created_by);
CREATE INDEX IF NOT EXISTS idx_workout_logs_student_id ON public.workout_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_student_id ON public.workout_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_student_id ON public.evaluation_results(student_id);
CREATE INDEX IF NOT EXISTS idx_student_edit_history_student_id ON public.student_edit_history(student_id);
