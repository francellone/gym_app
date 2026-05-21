-- ============================================================
-- Migration v26b: columna note_date (Opción B de session_day)
-- ------------------------------------------------------------
-- Agrega notes.note_date (date, nullable) para representar "qué día
-- está hablando la nota", separado de created_at ("cuándo se escribió").
--
-- Caso de uso: el coach escribe el martes "el lunes te vi cansado".
-- created_at = martes (cuándo se escribió), note_date = lunes (sobre
-- qué día). El filtro temporal por defecto sigue siendo created_at;
-- note_date queda como metadato del thread.
--
-- Semántica:
--   - context_type='free': el cliente puede setear note_date manual
--     (similar al patrón muscle_group de v25c).
--   - context_type='workout_log': trigger setea note_date = logged_date.
--   - context_type='workout_block_log': idem.
--   - context_type='evaluation_test' / 'exercise' / 'plan_exercise':
--     NULL (no aplica una fecha lógica).
--
-- Backfill: para notas mirror existentes, populate note_date desde
-- la fuente legacy.
-- ============================================================

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS note_date date;

CREATE INDEX IF NOT EXISTS idx_notes_note_date
  ON public.notes(note_date)
  WHERE note_date IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.notes.note_date IS
  'Fecha sobre la que habla la nota (≠ created_at que es cuándo se escribió). Manual para free, derivada del log para mirrors. v26b.';

CREATE OR REPLACE FUNCTION public.notes_resolve_context()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exercise_id   uuid;
  v_muscle_group  text;
  v_block_type    text;
  v_note_date     date;
BEGIN
  v_exercise_id := NULL; v_muscle_group := NULL; v_block_type := NULL; v_note_date := NULL;

  IF NEW.context_type = 'free' THEN
    NEW.exercise_id := NULL;
    NEW.block_type  := NULL;
    -- muscle_group y note_date quedan como vinieron del cliente
    RETURN NEW;

  ELSIF NEW.context_type = 'workout_log' THEN
    SELECT pe.exercise_id, pb.block_type, wl.logged_date
      INTO v_exercise_id, v_block_type, v_note_date
      FROM public.workout_logs wl
      JOIN public.plan_exercises pe ON pe.id = wl.plan_exercise_id
      LEFT JOIN public.plan_blocks pb ON pb.id = pe.block_id
     WHERE wl.id = NEW.context_id;

  ELSIF NEW.context_type = 'workout_block_log' THEN
    SELECT pb.block_type, wbl.logged_date
      INTO v_block_type, v_note_date
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
  NEW.note_date    := v_note_date;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notes_resolve_context() IS
  'Denormaliza exercise_id, muscle_group, block_type, note_date desde el contexto. Para context_type=free respeta muscle_group y note_date del cliente (v26b).';

-- Backfill de note_date para mirrors existentes
UPDATE public.notes n
   SET note_date = wl.logged_date
  FROM public.workout_logs wl
 WHERE n.context_type = 'workout_log'
   AND n.context_id = wl.id
   AND n.note_date IS NULL;

UPDATE public.notes n
   SET note_date = wbl.logged_date
  FROM public.workout_block_logs wbl
 WHERE n.context_type = 'workout_block_log'
   AND n.context_id = wbl.id
   AND n.note_date IS NULL;
