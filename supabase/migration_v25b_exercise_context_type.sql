-- ============================================================
-- Migration v25b: context_type 'exercise' (Fase B+)
-- ------------------------------------------------------------
-- Permite escribir notas referenciadas al ejercicio del catálogo
-- (en vez de a un workout_log o plan_exercise concreto). Caso de uso:
-- el coach filtra el panel por "Press de banca" y quiere dejar una
-- observación sobre ese ejercicio, sin estar respondiendo a una
-- ejecución específica. La nota queda denormalizada con
-- `exercise_id` y `muscle_group` para que el filtro la incluya.
--
-- Cambios:
--   1) Ampliar enum CHECK de notes.context_type para sumar 'exercise'.
--   2) Rama nueva en notes_resolve_context para resolver
--      exercise_id = context_id y muscle_group desde exercises.
-- ============================================================

ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_context_type_check;
ALTER TABLE public.notes
  ADD CONSTRAINT notes_context_type_check
  CHECK (context_type IN (
    'free',
    'workout_log',
    'workout_block_log',
    'plan_exercise',
    'evaluation_test',
    'plan',
    'session_day',
    'exercise'
  ));

CREATE OR REPLACE FUNCTION public.notes_resolve_context()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exercise_id   uuid;
  v_muscle_group  text;
  v_block_type    text;
BEGIN
  v_exercise_id := NULL; v_muscle_group := NULL; v_block_type := NULL;

  IF NEW.context_type = 'workout_log' THEN
    SELECT pe.exercise_id, pb.block_type INTO v_exercise_id, v_block_type
      FROM public.workout_logs wl
      JOIN public.plan_exercises pe ON pe.id = wl.plan_exercise_id
      LEFT JOIN public.plan_blocks pb ON pb.id = pe.block_id
     WHERE wl.id = NEW.context_id;

  ELSIF NEW.context_type = 'workout_block_log' THEN
    SELECT pb.block_type INTO v_block_type
      FROM public.workout_block_logs wbl
      JOIN public.plan_blocks pb ON pb.id = wbl.plan_block_id
     WHERE wbl.id = NEW.context_id;

  ELSIF NEW.context_type = 'plan_exercise' THEN
    SELECT pe.exercise_id, pb.block_type INTO v_exercise_id, v_block_type
      FROM public.plan_exercises pe
      LEFT JOIN public.plan_blocks pb ON pb.id = pe.block_id
     WHERE pe.id = NEW.context_id;

  ELSIF NEW.context_type = 'evaluation_test' THEN
    SELECT et.exercise_id INTO v_exercise_id
      FROM public.evaluation_tests et WHERE et.id = NEW.context_id;

  ELSIF NEW.context_type = 'exercise' THEN
    -- Comentario sobre un ejercicio del catálogo (v25b).
    -- context_id es directamente el exercise_id.
    v_exercise_id := NEW.context_id;
    -- muscle_group se denormaliza más abajo (lookup a exercises).

  END IF;

  IF v_exercise_id IS NOT NULL THEN
    SELECT e.muscle_group INTO v_muscle_group
      FROM public.exercises e WHERE e.id = v_exercise_id;
  END IF;

  NEW.exercise_id  := v_exercise_id;
  NEW.muscle_group := v_muscle_group;
  NEW.block_type   := v_block_type;
  RETURN NEW;
END;
$$;
