-- ============================================================
-- 38b — Migración de CUTOVER (doc 37/38, evals por día + método por ejercicio)
-- ============================================================
-- Se aplica JUNTO con el push del código (regla de oro doc 37). NO antes.
-- Mueve las pruebas custom de evaluation_tests → plan_exercises (cajón único)
-- y reata las respuestas de alumnas. Transacción única con verificación que
-- aborta (rollback) si los conteos no cuadran.
--
-- Pre-cutover esperado (verificado 30/05): 32 evaluation_tests, 8 responses.
-- NO borra evaluation_tests ni la columna test_id (cleanup = fase 2, post-smoke).
-- ============================================================

BEGIN;

-- 1) DDL en evaluation_test_responses: nuevo key por plan_exercise_id.
ALTER TABLE public.evaluation_test_responses
  ADD COLUMN IF NOT EXISTS plan_exercise_id uuid
    REFERENCES public.plan_exercises(id) ON DELETE CASCADE;

-- test_id pasa a nullable (las respuestas nuevas keyean por plan_exercise_id).
ALTER TABLE public.evaluation_test_responses
  ALTER COLUMN test_id DROP NOT NULL;

-- Unique para el upsert nuevo (onConflict: evaluation_result_id,plan_exercise_id).
-- Los NULL en plan_exercise_id se tratan como distintos → no choca con filas legacy.
CREATE UNIQUE INDEX IF NOT EXISTS uq_etr_result_planexercise
  ON public.evaluation_test_responses (evaluation_result_id, plan_exercise_id);
-- (Se mantiene el unique viejo (evaluation_result_id, test_id) para el path legacy.)

-- 2) Columna temporal de mapeo origen→destino.
ALTER TABLE public.plan_exercises ADD COLUMN IF NOT EXISTS __src_test_id uuid;

-- 3) Mover las pruebas custom a plan_exercises.
--    eval_type='custom', eval_method = test_type (el input de la prueba:
--    libre/reps/tiempo/peso/...). El código de la alumna despacha el input
--    por eval_method para custom (EvalByDayForm.CustomInput).
INSERT INTO public.plan_exercises (
  plan_id, exercise_id, section, order_index,
  eval_type, eval_method, expected_value, expected_unit, mandatory, instructions,
  __src_test_id
)
SELECT
  et.plan_id, et.exercise_id, 'day_a', et.order_index,
  'custom', COALESCE(et.test_type, 'libre'),
  et.expected_value, et.expected_unit, COALESCE(et.mandatory, false), et.instructions,
  et.id
FROM public.evaluation_tests et;

-- 4) Reatar las respuestas: test_id (→evaluation_tests) → plan_exercise_id (→nueva fila).
UPDATE public.evaluation_test_responses r
SET plan_exercise_id = pe.id
FROM public.plan_exercises pe
WHERE pe.__src_test_id = r.test_id
  AND r.plan_exercise_id IS NULL;

-- 5) Verificación (aborta si algo no cuadra).
DO $$
DECLARE
  v_tests       int;
  v_moved       int;
  v_resp_total  int;
  v_resp_reatad int;
  v_resp_huerf  int;
BEGIN
  SELECT count(*) INTO v_tests FROM public.evaluation_tests;
  SELECT count(*) INTO v_moved FROM public.plan_exercises WHERE __src_test_id IS NOT NULL;
  SELECT count(*) INTO v_resp_total FROM public.evaluation_test_responses;
  SELECT count(*) INTO v_resp_reatad FROM public.evaluation_test_responses WHERE plan_exercise_id IS NOT NULL;
  -- Huérfanas: respuestas con test_id que NO encontraron destino.
  SELECT count(*) INTO v_resp_huerf
    FROM public.evaluation_test_responses r
   WHERE r.plan_exercise_id IS NULL AND r.test_id IS NOT NULL;

  IF v_moved <> v_tests THEN
    RAISE EXCEPTION 'Mudanza incompleta: % tests, % movidas', v_tests, v_moved;
  END IF;
  IF v_resp_huerf > 0 THEN
    RAISE EXCEPTION 'Quedaron % respuestas huérfanas (test_id sin plan_exercise destino)', v_resp_huerf;
  END IF;

  RAISE NOTICE 'OK — tests movidas: %, respuestas reatadas: % / % totales', v_moved, v_resp_reatad, v_resp_total;
END $$;

-- 6) Limpiar la columna temporal de mapeo.
ALTER TABLE public.plan_exercises DROP COLUMN __src_test_id;

COMMIT;
