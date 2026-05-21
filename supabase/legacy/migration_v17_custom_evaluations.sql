-- ============================================================
-- Migration v17: Sistema de Evaluaciones Personalizadas (Pruebas)
-- ============================================================
-- Incluye:
--   1. Columna eval_tags en plans (categorías de la evaluación)
--   2. Tabla evaluation_tests  (pruebas individuales de eval custom)
--   3. Tabla evaluation_test_responses (respuestas + comentarios)
--   4. RLS policies
-- ============================================================

-- ── 1. Tags de evaluación en plans ───────────────────────────────
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS eval_tags text[] DEFAULT '{}';

-- ── 2. Tabla evaluation_tests ────────────────────────────────────
-- Una "prueba" es un ítem de evaluación dentro de un plan custom.
-- Puede referenciar un exercise existente (exercise_id) o ser libre (exercise_name).
CREATE TABLE IF NOT EXISTS public.evaluation_tests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  exercise_id    uuid        REFERENCES public.exercises(id) ON DELETE SET NULL,
  exercise_name  text,        -- nombre libre cuando no hay exercise_id
  test_type      text        NOT NULL CHECK (test_type IN (
                               'reps','tiempo','distancia','peso',
                               'movilidad','tecnica','video','libre'
                             )),
  instructions   text,
  expected_value text,        -- valor esperado definido por el coach
  expected_unit  text,        -- unidad del expected_value
  mandatory      boolean     NOT NULL DEFAULT false,
  order_index    int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_tests_plan_id
  ON public.evaluation_tests(plan_id, order_index);

-- ── 3. Tabla evaluation_test_responses ───────────────────────────
-- Respuesta del alumno a cada prueba individual + comentarios coach.
CREATE TABLE IF NOT EXISTS public.evaluation_test_responses (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_result_id  uuid        NOT NULL REFERENCES public.evaluation_results(id) ON DELETE CASCADE,
  test_id               uuid        NOT NULL REFERENCES public.evaluation_tests(id)   ON DELETE CASCADE,
  student_response      jsonb,       -- { value: '...', unit: '...' }
  student_comment       text,
  coach_comment_public  text,        -- visible para el alumno
  coach_comment_private text,        -- solo visible para el coach
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(evaluation_result_id, test_id)
);

CREATE INDEX IF NOT EXISTS idx_etr_result_id
  ON public.evaluation_test_responses(evaluation_result_id);
CREATE INDEX IF NOT EXISTS idx_etr_test_id
  ON public.evaluation_test_responses(test_id);

-- Trigger updated_at
CREATE TRIGGER evaluation_test_responses_updated_at
  BEFORE UPDATE ON public.evaluation_test_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 4. RLS Policies ──────────────────────────────────────────────

ALTER TABLE public.evaluation_tests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_test_responses ENABLE ROW LEVEL SECURITY;

-- evaluation_tests: coach puede todo
CREATE POLICY "Coach full access on evaluation_tests"
  ON public.evaluation_tests FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- evaluation_tests: alumno puede leer las pruebas de sus planes asignados
CREATE POLICY "Student read evaluation_tests for assigned plans"
  ON public.evaluation_tests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plan_assignments pa
      JOIN  public.profiles p ON p.id = auth.uid()
      WHERE pa.plan_id    = evaluation_tests.plan_id
        AND pa.student_id = auth.uid()
        AND p.role = 'student'
    )
  );

-- evaluation_test_responses: coach puede todo
CREATE POLICY "Coach full access on evaluation_test_responses"
  ON public.evaluation_test_responses FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- evaluation_test_responses: alumno puede ver/editar las suyas
CREATE POLICY "Student access own evaluation_test_responses"
  ON public.evaluation_test_responses FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluation_results er
      WHERE er.id         = evaluation_test_responses.evaluation_result_id
        AND er.student_id = auth.uid()
    )
  );
