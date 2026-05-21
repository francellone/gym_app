-- ============================================================
-- Migration v23: bloquear evaluaciones en workout_sessions
-- ------------------------------------------------------------
-- Cierra el problema de evaluaciones contaminando los cómputos
-- del calendario y del dashboard del alumno. Tiene dos partes:
--
--   P2 (trigger): rechaza INSERT/UPDATE de workout_sessions
--                 cuyo plan_id corresponda a un plan
--                 plan_type='evaluation'. Las evaluaciones se
--                 guardan en evaluation_results /
--                 evaluation_test_responses.
--
--   P3 (cleanup): borra las filas legacy de workout_sessions con
--                 plan_id de evaluación (auditadas como históricas
--                 de marzo-abril 2026, sin nuevas escrituras desde
--                 entonces).
--
-- Diseño:
--   - Toda la migración corre en una sola transacción: si algo
--     falla, no queda media migración aplicada.
--   - El trigger se crea ANTES del DELETE para cerrar la puerta
--     a inserts concurrentes durante el cleanup.
--   - La verificación final aborta con EXCEPTION si quedaran
--     filas legacy después del cleanup.
--
-- Bug reportado el 2026-05-10. Confirmado por queries de
-- auditoría Q5 (legacy) y Q10 (calendario contaminado).
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Pre-flight: contar filas legacy
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  legacy_count integer;
BEGIN
  SELECT count(*) INTO legacy_count
    FROM public.workout_sessions ws
    JOIN public.plans p ON p.id = ws.plan_id
   WHERE p.plan_type = 'evaluation';

  RAISE NOTICE 'workout_sessions con plan_type=evaluation a borrar: %', legacy_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Trigger: bloquear plan_id de evaluación en workout_sessions
-- ─────────────────────────────────────────────────────────────
-- Se dispara BEFORE INSERT y BEFORE UPDATE de plan_id. No filtra
-- UPDATEs que no tocan plan_id (típicos: finished_at, borg_scale)
-- para evitar overhead innecesario.
--
-- Si el plan_id no existe, RETURN NEW (la FK ya rechaza). Si
-- existe y plan_type='evaluation', RAISE EXCEPTION con código
-- 'check_violation' y mensaje accionable.
CREATE OR REPLACE FUNCTION public.workout_sessions_block_evaluations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pt text;
BEGIN
  SELECT plan_type INTO pt
    FROM public.plans
   WHERE id = NEW.plan_id;

  IF pt = 'evaluation' THEN
    RAISE EXCEPTION
      'workout_sessions no puede referenciar planes de evaluación (plan_id=%). Las evaluaciones se guardan en evaluation_results.',
      NEW.plan_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.workout_sessions_block_evaluations() IS
  'Bloquea INSERT/UPDATE de workout_sessions cuando plan_id pertenece a un plan plan_type=evaluation. Las evaluaciones deben persistirse en evaluation_results. Agregada por migration_v23 (2026-05-10) tras detectar contaminación legacy en el calendario.';

DROP TRIGGER IF EXISTS trg_workout_sessions_block_evaluations
  ON public.workout_sessions;

CREATE TRIGGER trg_workout_sessions_block_evaluations
  BEFORE INSERT OR UPDATE OF plan_id ON public.workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.workout_sessions_block_evaluations();

-- ─────────────────────────────────────────────────────────────
-- 3. Cleanup: borrar filas legacy
-- ─────────────────────────────────────────────────────────────
-- Devuelve la cantidad borrada en el RAISE NOTICE para que quede
-- registrado en los logs de Supabase.
DO $$
DECLARE
  deleted_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.workout_sessions ws
      USING public.plans p
     WHERE p.id = ws.plan_id
       AND p.plan_type = 'evaluation'
    RETURNING ws.id
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RAISE NOTICE 'workout_sessions legacy borradas: %', deleted_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Verificación post-cleanup
-- ─────────────────────────────────────────────────────────────
-- Si quedó algo (no debería), aborta la transacción.
DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining
    FROM public.workout_sessions ws
    JOIN public.plans p ON p.id = ws.plan_id
   WHERE p.plan_type = 'evaluation';

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'Migration v23 abortada: quedan % workout_sessions con plan_type=evaluation tras el cleanup',
      remaining;
  END IF;

  RAISE NOTICE 'Verificación ok: 0 workout_sessions con plan_type=evaluation';
END;
$$;

COMMIT;

-- ============================================================
-- POST: cómo testear que el trigger funciona
-- ============================================================
-- Correr en una transacción suelta (NO dentro de esta migración)
-- para confirmar que rechaza inserts:
--
--   BEGIN;
--     INSERT INTO public.workout_sessions (student_id, plan_id, logged_date)
--     SELECT
--       (SELECT id FROM public.profiles WHERE role = 'student' LIMIT 1),
--       (SELECT id FROM public.plans WHERE plan_type = 'evaluation' LIMIT 1),
--       CURRENT_DATE;
--   ROLLBACK;
--
-- Resultado esperado: ERROR 23514 con el mensaje del trigger.
-- ============================================================
