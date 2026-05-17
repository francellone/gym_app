-- ============================================================
-- Migration v24d: RPC notes_thread_filter_options(thread_id)
-- ------------------------------------------------------------
-- Devuelve en una sola query las opciones disponibles para los
-- selectores del panel de notas, derivadas de las propias notas
-- del thread (no del catálogo completo). Garantiza match 1:1 con
-- lo que existe y no muestra opciones que devolverían 0 notas.
--
-- Retorna jsonb:
--   { exercises:    [{id, name, muscle_group}, ...]
--   , muscle_groups:[string, ...]
--   , block_types:  [string, ...]
--   , tags:         [string, ...] }
--
-- SECURITY DEFINER bypasea RLS de exercises (el thread_id ya filtra
-- a quién ve qué; el coach del thread tiene acceso vía RLS de notes).
-- ============================================================

CREATE OR REPLACE FUNCTION public.notes_thread_filter_options(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exercises     jsonb;
  v_muscle_groups jsonb;
  v_block_types   jsonb;
  v_tags          jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', e.id, 'name', e.name, 'muscle_group', e.muscle_group)
      ORDER BY e.name
    ),
    '[]'::jsonb
  )
  INTO v_exercises
  FROM (
    SELECT DISTINCT exercise_id
      FROM public.notes
     WHERE thread_id = p_thread_id
       AND deleted_at IS NULL
       AND exercise_id IS NOT NULL
  ) n
  JOIN public.exercises e ON e.id = n.exercise_id;

  SELECT COALESCE(jsonb_agg(mg ORDER BY mg), '[]'::jsonb)
  INTO v_muscle_groups
  FROM (
    SELECT DISTINCT muscle_group AS mg
      FROM public.notes
     WHERE thread_id = p_thread_id
       AND deleted_at IS NULL
       AND muscle_group IS NOT NULL
       AND trim(muscle_group) <> ''
  ) m;

  SELECT COALESCE(jsonb_agg(bt ORDER BY bt), '[]'::jsonb)
  INTO v_block_types
  FROM (
    SELECT DISTINCT block_type AS bt
      FROM public.notes
     WHERE thread_id = p_thread_id
       AND deleted_at IS NULL
       AND block_type IS NOT NULL
  ) b;

  SELECT COALESCE(jsonb_agg(tag ORDER BY tag), '[]'::jsonb)
  INTO v_tags
  FROM (
    SELECT DISTINCT unnest(tags) AS tag
      FROM public.notes
     WHERE thread_id = p_thread_id
       AND deleted_at IS NULL
       AND array_length(tags, 1) > 0
  ) t
  WHERE tag IS NOT NULL AND trim(tag) <> '';

  RETURN jsonb_build_object(
    'exercises',     v_exercises,
    'muscle_groups', v_muscle_groups,
    'block_types',   v_block_types,
    'tags',          v_tags
  );
END;
$$;

COMMENT ON FUNCTION public.notes_thread_filter_options(uuid) IS
  'Opciones de filtros del panel derivadas de las propias notas del thread. v24d.';

GRANT EXECUTE ON FUNCTION public.notes_thread_filter_options(uuid) TO authenticated;
