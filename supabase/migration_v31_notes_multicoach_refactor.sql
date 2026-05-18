-- ============================================================
-- Migration v31: refactor multi-coach del panel de notas
-- ------------------------------------------------------------
-- Después del hotfix v30 (que revirtió el realineamiento de v28
-- porque rompía el frontend), esta migración hace el fix
-- definitivo en coordinación con el refactor del frontend
-- (lib/notes.js + StudentNotesTab.jsx + StudentEvaluationsTab.jsx).
--
-- Cambio de modelo:
--   De "1 coach administrativo único" → "cada coach es
--   independiente, sólo ve a sus alumnos asignados".
--
-- Pasos:
--   1. (Safety) Borrar threads vacíos que tengan algún hermano:
--      son duplicados generados por bugs previos.
--   2. Realinear note_threads.coach_id a profiles.coach_id de
--      cada alumno con coach asignado. Los huérfanos (4 alumnos
--      sin coach_id) quedan con su thread bajo Carlos como
--      fallback histórico.
--   3. Endurecer el RPC notes_get_or_create_thread:
--      - El caller debe ser coach (is_coach() = true).
--      - p_coach_id debe ser auth.uid().
--      - El alumno debe estar asignado a este coach (o aún no
--        tener coach asignado).
--      Antes el RPC no validaba nada y permitía que cualquier
--      coach creara un thread sobre cualquier alumno.
--   4. Reforzar deprecación de get_coach_id() vía COMMENT.
--
-- Frontend que cambia en paralelo:
--   - src/lib/notes.js:
--       getOrCreateThreadForStudent(studentId, coachId) — ahora
--         recibe coachId explícito en vez de llamar get_coach_id().
--       postEvalCommentNote(..., coachId) — idem para autoría.
--   - src/pages/coach/student/StudentNotesTab.jsx:
--       Pasa profile.id al wrapper.
--   - src/pages/coach/student/StudentEvaluationsTab.jsx:
--       Usa useAuth y pasa profile.id en los 2 calls de
--       postEvalCommentNote.
-- ============================================================

-- Step 1: safety — borrar threads vacíos con hermanos
DELETE FROM public.note_threads AS nt
 WHERE NOT EXISTS (SELECT 1 FROM public.notes n WHERE n.thread_id = nt.id)
   AND EXISTS (
     SELECT 1 FROM public.note_threads other
      WHERE other.student_id = nt.student_id
        AND other.id <> nt.id
   );

-- Step 2: realinear coach_id a profiles.coach_id donde aplique
UPDATE public.note_threads nt
   SET coach_id = s.coach_id
  FROM public.profiles s
 WHERE nt.student_id = s.id
   AND s.coach_id IS NOT NULL
   AND nt.coach_id IS DISTINCT FROM s.coach_id;

-- Step 3: refactor del RPC con validación
CREATE OR REPLACE FUNCTION public.notes_get_or_create_thread(
  p_coach_id   uuid,
  p_student_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id               uuid;
  v_caller           uuid := auth.uid();
  v_student_coach_id uuid;
BEGIN
  IF p_coach_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'notes_get_or_create_thread: coach_id y student_id son obligatorios'
      USING ERRCODE = '22023';
  END IF;

  -- El caller debe ser coach y estar pidiendo bajo su propio id
  IF v_caller IS NULL OR v_caller <> p_coach_id THEN
    RAISE EXCEPTION 'notes_get_or_create_thread: p_coach_id debe ser el del usuario logueado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_coach() THEN
    RAISE EXCEPTION 'notes_get_or_create_thread: el caller no es coach'
      USING ERRCODE = '42501';
  END IF;

  -- El alumno debe estar asignado a este coach (o aún no tener
  -- coach asignado — fallback para huérfanos que se gestionen
  -- manualmente desde la UI).
  SELECT coach_id INTO v_student_coach_id
    FROM public.profiles
   WHERE id = p_student_id;

  IF v_student_coach_id IS NOT NULL AND v_student_coach_id <> p_coach_id THEN
    RAISE EXCEPTION 'notes_get_or_create_thread: el alumno no está asignado a este coach'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_id
    FROM public.note_threads
   WHERE coach_id = p_coach_id AND student_id = p_student_id;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.note_threads (coach_id, student_id)
  VALUES (p_coach_id, p_student_id)
  ON CONFLICT (coach_id, student_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.notes_get_or_create_thread(uuid, uuid) IS
  'v31 (multi-coach): el caller debe ser coach, p_coach_id debe ser su propio id, '
  'y el alumno debe estar asignado a ese coach (o no tener coach asignado).';

-- Step 4: endurecer deprecation de get_coach_id
COMMENT ON FUNCTION public.get_coach_id() IS
  'DEPRECATED v28 + v31: devuelve un coach arbitrario sin ORDER BY. NO USAR. '
  'Para el coach del usuario logueado: usar auth.uid() (si is_coach()) o my_coach_id().';

-- Step 5: verificación
DO $$
DECLARE
  v_misaligned int;
  v_threads    int;
  v_notes_act  int;
BEGIN
  SELECT count(*) INTO v_threads   FROM public.note_threads;
  SELECT count(*) INTO v_notes_act FROM public.notes WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_misaligned
    FROM public.note_threads nt
    JOIN public.profiles s ON s.id = nt.student_id
   WHERE s.coach_id IS NOT NULL
     AND nt.coach_id IS DISTINCT FROM s.coach_id;

  IF v_misaligned > 0 THEN
    RAISE EXCEPTION 'v31: quedaron % threads desalineados', v_misaligned;
  END IF;

  IF v_notes_act < 70 THEN
    RAISE EXCEPTION 'v31: se perdieron notas. Antes >= 70, ahora %', v_notes_act;
  END IF;

  RAISE NOTICE 'v31 ok: % threads, % notas activas, RPC reforzada', v_threads, v_notes_act;
END;
$$;
