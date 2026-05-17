-- ============================================================
-- Migration v24f: RPC notes_mark_thread_read + endurecer policy coach
-- ------------------------------------------------------------
-- Cierra dos hallazgos de la auditoría 2026-05-17:
--
-- 1) D1: el alumno no podía bajar su contador `unread_for_student`
--    porque la policy "Student update own notes" exige
--    `author_id = auth.uid()`. La función markThreadRead intenta
--    actualizar notas del coach → 0 filas afectadas. Solución:
--    RPC `notes_mark_thread_read(thread_id, as_role)` con
--    SECURITY DEFINER que bypasea RLS y valida explícitamente
--    los permisos.
--
-- 2) DR5: la policy "Coach full access on notes" permitía al coach
--    insertar notas con `author_role='student'` (impersonación
--    accidental o maliciosa). La partimos en SELECT/INSERT/UPDATE
--    con CHECK explícito en INSERT exigiendo author_role='coach' y
--    author_id=auth.uid(). UPDATE se mantiene permisivo para que el
--    coach pueda marcar como leído / soft-borrar notas del alumno.
--    No hay policy DELETE (hard-delete sigue bloqueado a todos).
-- ============================================================

CREATE OR REPLACE FUNCTION public.notes_mark_thread_read(
  p_thread_id uuid,
  p_as_role   text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id  uuid := auth.uid();
  v_other_role text;
  v_marked     integer := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'notes_mark_thread_read: requiere autenticación';
  END IF;
  IF p_thread_id IS NULL OR p_as_role IS NULL THEN
    RAISE EXCEPTION 'notes_mark_thread_read: thread_id y as_role son obligatorios';
  END IF;
  IF p_as_role NOT IN ('coach','student') THEN
    RAISE EXCEPTION 'notes_mark_thread_read: as_role debe ser coach o student';
  END IF;

  IF p_as_role = 'student' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.note_threads
       WHERE id = p_thread_id AND student_id = v_caller_id
    ) THEN
      RAISE EXCEPTION 'notes_mark_thread_read: no autorizado para marcar como student en este thread';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'coach'
    ) THEN
      RAISE EXCEPTION 'notes_mark_thread_read: no autorizado para marcar como coach';
    END IF;
  END IF;

  v_other_role := CASE p_as_role WHEN 'coach' THEN 'student' ELSE 'coach' END;

  IF p_as_role = 'coach' THEN
    UPDATE public.notes
       SET read_at_coach = now()
     WHERE thread_id   = p_thread_id
       AND author_role = v_other_role
       AND read_at_coach IS NULL
       AND deleted_at IS NULL;
  ELSE
    UPDATE public.notes
       SET read_at_student = now()
     WHERE thread_id   = p_thread_id
       AND author_role = v_other_role
       AND visibility  = 'shared'
       AND read_at_student IS NULL
       AND deleted_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_marked = ROW_COUNT;
  RETURN v_marked;
END;
$$;

COMMENT ON FUNCTION public.notes_mark_thread_read(uuid, text) IS
  'Marca como leído todo lo del otro rol en el thread. v24f.';

GRANT EXECUTE ON FUNCTION public.notes_mark_thread_read(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- Endurecer policies del coach sobre `notes`
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Coach full access on notes" ON public.notes;

CREATE POLICY "Coach select all notes"
  ON public.notes FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

CREATE POLICY "Coach insert as self coach"
  ON public.notes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
    AND author_id   = auth.uid()
    AND author_role = 'coach'
  );

CREATE POLICY "Coach update notes"
  ON public.notes FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
  );

COMMENT ON POLICY "Coach select all notes" ON public.notes IS
  'Coach SELECT total. v24f.';
COMMENT ON POLICY "Coach insert as self coach" ON public.notes IS
  'Coach INSERT exige author_id = auth.uid() y author_role = coach. v24f.';
COMMENT ON POLICY "Coach update notes" ON public.notes IS
  'Coach UPDATE para marcar leído / soft-delete / editar bodies. v24f.';
