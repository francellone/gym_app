-- ============================================================
-- Migration v24b: coach puede SELECT cualquier ejercicio del catálogo
-- ------------------------------------------------------------
-- Contexto: la policy existente `coach_manage_own_exercises` (ALL)
-- restringe a `created_by = auth.uid()`. Eso fue diseñado para un
-- modelo multi-coach que ya no aplica — el catálogo de ejercicios
-- es compartido (admin único). Esta policy SELECT permisiva no
-- afecta writes (esos siguen exigiendo created_by = auth.uid() via
-- la policy ALL existente). Solo amplía la lectura.
--
-- No toca a los alumnos: su policy `student_view_assigned_exercises`
-- sigue limitándolos a los ejercicios de sus planes activos.
--
-- Aplicada en producción el 2026-05-17 después de detectar que los
-- selects de filtros del panel de notas (Fase A) venían vacíos para
-- coaches distintos al creador original del catálogo.
-- ============================================================

CREATE POLICY "coach_select_all_exercises"
  ON public.exercises FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

COMMENT ON POLICY "coach_select_all_exercises" ON public.exercises IS
  'Cualquier coach puede leer el catálogo completo. Las escrituras siguen restringidas a created_by por coach_manage_own_exercises (v24b).';
