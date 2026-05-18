-- ============================================================
-- Migration v30: HOTFIX — revertir realineamiento de
-- note_threads.coach_id hecho en v28.
-- ------------------------------------------------------------
-- Síntoma observado (2026-05-18):
--   Después de aplicar v28, al abrir el panel de Notas de un
--   alumno desde el coach, las notas viejas no aparecían. El
--   frontend creaba threads paralelos vacíos.
--
-- Causa raíz:
--   El frontend (StudentNotesTab.jsx + lib/notes.js) usa el RPC
--   notes_get_or_create_thread(coach_id, student_id), pasándole
--   coach_id = get_coach_id() — función que devuelve siempre el
--   mismo coach (Carlos Sosa, por LIMIT 1 sin ORDER BY).
--
--   v28 realineó note_threads.coach_id a profiles.coach_id de
--   cada alumno (apuntando a Anto/Gonza para sus alumnos). El
--   RPC dejó de encontrar los threads existentes (busca por par
--   exacto coach_id+student_id) y creaba threads nuevos vacíos
--   bajo Carlos. Las notas viejas quedaron "huérfanas" en
--   threads con coach_id = Anto/Gonza que el front no consulta.
--
-- Decisión (acordada con el usuario):
--   Hotfix: revertir el realineamiento (devolver coach_id a
--   Carlos en todos los threads). Las notifs siguen routeándose
--   al coach correcto porque v28 cambió las funciones de notif
--   (fn_notify_student_note, etc.) para usar profiles.coach_id
--   del alumno, no nt.coach_id.
--
--   Fix definitivo (próxima etapa, NO incluido aquí):
--   refactorizar notes_get_or_create_thread y StudentNotesTab
--   para que pasen el coach real (profile.id del coach logueado
--   o profiles.coach_id del alumno) en lugar de get_coach_id().
--
-- Pasos:
--   1. DELETE de threads fantasma: vacíos (sin notas), con
--      coach=Carlos, cuando existe otro thread del mismo alumno
--      con coach!=Carlos. Esos son los duplicados creados por el
--      front al no encontrar el realineado. Estos DELETE evitan
--      colisiones del UNIQUE (coach_id, student_id) al revertir.
--   2. UPDATE coach_id = Carlos en todos los threads restantes.
--   3. Verificación: ningún thread quedó con coach_id != Carlos
--      y el conteo de notas activas se mantiene en ≥ 70.
-- ============================================================

-- Step 1: borrar fantasmas y preexistentes vacíos que bloquearían el UNIQUE
DELETE FROM public.note_threads AS nt
 WHERE nt.coach_id = '228aa338-3360-41b4-9f8b-6f1cd1e1e96c'  -- Carlos Sosa
   AND NOT EXISTS (SELECT 1 FROM public.notes n WHERE n.thread_id = nt.id)
   AND EXISTS (
     SELECT 1 FROM public.note_threads other
      WHERE other.student_id = nt.student_id
        AND other.id        <> nt.id
        AND other.coach_id  <> '228aa338-3360-41b4-9f8b-6f1cd1e1e96c'
   );

-- Step 2: revertir coach_id a Carlos en todos los threads restantes
UPDATE public.note_threads
   SET coach_id = '228aa338-3360-41b4-9f8b-6f1cd1e1e96c'  -- Carlos Sosa
 WHERE coach_id <> '228aa338-3360-41b4-9f8b-6f1cd1e1e96c';

-- Step 3: verificación
DO $$
DECLARE
  v_threads_non_carlos int;
  v_threads_total      int;
  v_notes_active       int;
  v_carlos_id          uuid := '228aa338-3360-41b4-9f8b-6f1cd1e1e96c';
BEGIN
  SELECT count(*) INTO v_threads_total      FROM public.note_threads;
  SELECT count(*) INTO v_notes_active       FROM public.notes WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_threads_non_carlos FROM public.note_threads WHERE coach_id <> v_carlos_id;

  IF v_threads_non_carlos > 0 THEN
    RAISE EXCEPTION 'v30: quedaron % threads con coach_id != Carlos', v_threads_non_carlos;
  END IF;

  IF v_notes_active < 70 THEN
    RAISE EXCEPTION 'v30: se perdieron notas! Antes había >= 70 activas, ahora hay %', v_notes_active;
  END IF;

  RAISE NOTICE 'v30 ok: % threads totales, % notas activas, todos los threads bajo Carlos',
    v_threads_total, v_notes_active;
END;
$$;
