-- ============================================================
-- Migration v25c: respetar muscle_group manual en notas 'free'
-- ------------------------------------------------------------
-- Fase B++ permite escribir una nota con contexto "Grupo muscular"
-- (sin atarse a un ejercicio o log puntual). Como muscle_group NO
-- es una entidad estable (es un text label en exercises, sin id),
-- la nota va con context_type='free' (sin context_id) y el cliente
-- manda el muscle_group como text.
--
-- Cambio en notes_resolve_context: si la nota es 'free', ya no
-- pisamos muscle_group con NULL — lo dejamos como vino del cliente.
-- exercise_id y block_type sí los limpiamos a NULL (no aplican).
--
-- Esto mantiene la consistencia del filtro: una nota con
-- muscle_group='PUSH EXERCISE' y context_type='free' aparecerá
-- cuando el coach filtre por ese grupo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notes_resolve_context()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exercise_id   uuid;
  v_muscle_group  text;
  v_block_type    text;
BEGIN
  v_exercise_id := NULL; v_muscle_group := NULL; v_block_type := NULL;

  IF NEW.context_type = 'free' THEN
    NEW.exercise_id := NULL;
    NEW.block_type  := NULL;
    -- muscle_group queda como vino del cliente (NULL o text)
    RETURN NEW;

  ELSIF NEW.context_type = 'workout_log' THEN
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
    v_exercise_id := NEW.context_id;
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

COMMENT ON FUNCTION public.notes_resolve_context() IS
  'Denormaliza exercise_id, muscle_group y block_type desde el contexto. Para context_type=free, respeta muscle_group del cliente (v25c).';
