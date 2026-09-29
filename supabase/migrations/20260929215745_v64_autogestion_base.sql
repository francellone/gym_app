-- v64 — Base para entrenar sin coach y para la coach que también entrena
--
-- Decisiones de Franco (2026-09-27/29): quien se registra elige "entreno",
-- "entreno a otros" o ambas. Sin coach, la persona arma su plan (por bloques
-- o "plan libre") y carga sus ejercicios.
--
-- Modelo elegido (sin romper nada de lo existente):
--   * role sigue siendo el panel principal ('coach' | 'student').
--   * profiles.also_trains: la coach que además entrena (caso "ambas").
--     Para role='student' no significa nada: una persona siempre entrena.
--   * Persona sin coach = role 'student' con coach_id NULL.
--   * AUTORÍA = PROPIEDAD: cualquiera puede crear y editar planes y ejercicios
--     propios (created_by = yo) y asignarse SUS planes a sí mismo. Asignar a
--     OTRAS personas sigue siendo solo del coach (policies de v33 intactas).
--     La UI decide a quién se lo ofrece; la base solo garantiza que nadie toque
--     lo ajeno.
--   * Nadie se autonotifica: "nuevo plan asignado" y "tu coach actualizó tu
--     plan" se saltean cuando quien actúa es la misma persona que los recibiría.

-- 1. La coach que también entrena -----------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS also_trains boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.also_trains IS
  'Solo para role=coach: además tiene su propio entrenamiento (caso "ambas").';

-- 2. Planes propios ----------------------------------------------------------------
DROP POLICY IF EXISTS owner_manage_own_plans ON public.plans;
CREATE POLICY owner_manage_own_plans ON public.plans
  FOR ALL TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS owner_manage_own_plan_exercises ON public.plan_exercises;
CREATE POLICY owner_manage_own_plan_exercises ON public.plan_exercises
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plans p
                  WHERE p.id = plan_exercises.plan_id AND p.created_by = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plans p
                       WHERE p.id = plan_exercises.plan_id AND p.created_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS owner_manage_own_plan_blocks ON public.plan_blocks;
CREATE POLICY owner_manage_own_plan_blocks ON public.plan_blocks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plans p
                  WHERE p.id = plan_blocks.plan_id AND p.created_by = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plans p
                       WHERE p.id = plan_blocks.plan_id AND p.created_by = (SELECT auth.uid())));

-- Asignarme a mí un plan mío (no uno ajeno, no a otra persona)
DROP POLICY IF EXISTS self_assign_own_plans ON public.plan_assignments;
CREATE POLICY self_assign_own_plans ON public.plan_assignments
  FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid())
         AND EXISTS (SELECT 1 FROM public.plans p
                      WHERE p.id = plan_assignments.plan_id AND p.created_by = (SELECT auth.uid())))
  WITH CHECK (student_id = (SELECT auth.uid())
              AND EXISTS (SELECT 1 FROM public.plans p
                           WHERE p.id = plan_assignments.plan_id AND p.created_by = (SELECT auth.uid())));

-- 3. Ejercicios propios: el dueño, sea coach o persona -----------------------------
DROP POLICY IF EXISTS coach_manage_own_exercises ON public.exercises;
DROP POLICY IF EXISTS owner_manage_own_exercises ON public.exercises;
CREATE POLICY owner_manage_own_exercises ON public.exercises
  FOR ALL TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

-- 4. Sin autonotificaciones -----------------------------------------------------------
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_notify_plan_assigned()'::regprocedure);
  IF position($o$BEGIN
  SELECT title INTO v_plan_title$o$ IN d) = 0 THEN
    RAISE EXCEPTION 'v64: no encontré el bloque esperado en fn_notify_plan_assigned';
  END IF;
  d := replace(d, $o$BEGIN
  SELECT title INTO v_plan_title$o$, $n$BEGIN
  -- v64: si la persona se asignó su propio plan, no hay a quién avisar
  IF NEW.student_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_plan_title$n$);
  EXECUTE d;

  d := pg_get_functiondef('public.fn_notify_plan_updated_internal(uuid,uuid)'::regprocedure);
  IF position($o$       AND (p_only_student IS NULL OR pa.student_id = p_only_student)$o$ IN d) = 0 THEN
    RAISE EXCEPTION 'v64: no encontré el bloque esperado en fn_notify_plan_updated_internal';
  END IF;
  d := replace(d, $o$       AND (p_only_student IS NULL OR pa.student_id = p_only_student)$o$,
$n$       AND (p_only_student IS NULL OR pa.student_id = p_only_student)
       -- v64: quien edita su propio plan no recibe "tu coach actualizó tu plan"
       AND pa.student_id IS DISTINCT FROM auth.uid()$n$);
  EXECUTE d;
END
$mig$;
