-- ============================================================
-- v35b — Todo alumno con coach tiene hilo de notas
-- ------------------------------------------------------------
-- Hallazgo 2026-08-04, revisando el alcance multi-coach de la RLS:
-- 12 alumnas de Anto (7 con entrenamientos cargados, varias con logs de esta
-- misma semana) NO tenían fila en `note_threads`.
--
-- Los hilos se creaban de forma LAZY: recién cuando la coach abría la pestaña
-- de notas de esa alumna (`notes_get_or_create_thread`). Si nunca la abrió, no
-- había hilo — y sin hilo `postWorkoutLogNote` / `postWorkoutBlockLogNote` /
-- `postPSEDayNote` cortan con "No hay hilo de notas inicializado para este
-- alumno" y el comentario se descarta. Le pegaba a la ALUMNA y a la COACH por
-- igual, y es independiente del bug de autoría de v35 (ver
-- 20260801144243_notes_guard_body_authorship.sql): mismo síntoma, otra causa.
--
-- Acá el hilo pasa a ser un invariante garantizado por la base, en vez de un
-- efecto secundario de que alguien abra una pantalla.
--
-- APLICADA en producción (bvexjanqmfypmtgoapbt) el 2026-08-04 vía MCP
-- apply_migration, registrada como version 20260804113732 — de ahí el nombre
-- del archivo. Resultado: 15 → 27 hilos, 0 alumnos con coach y sin hilo.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_ensure_note_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- OJO: el front resuelve el hilo con
  --   .from('note_threads').eq('student_id', X).maybeSingle()
  -- o sea asume UN hilo por alumno. Si el alumno cambia de coach y le
  -- creáramos un segundo hilo, maybeSingle() reventaría con "multiple rows".
  -- Por eso solo creamos hilo cuando el alumno NO tiene ninguno.
  IF NEW.role = 'student' AND NEW.coach_id IS NOT NULL AND NEW.coach_id <> NEW.id
     AND NOT EXISTS (SELECT 1 FROM public.note_threads nt WHERE nt.student_id = NEW.id)
  THEN
    INSERT INTO public.note_threads (coach_id, student_id)
    VALUES (NEW.coach_id, NEW.id)
    ON CONFLICT (coach_id, student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profiles_ensure_note_thread() IS
  'v35b — garantiza note_threads(coach_id, student_id) cuando un alumno tiene coach. Antes el hilo se creaba lazy al abrir el panel y, sin hilo, los comentarios del registro se descartaban.';

REVOKE ALL ON FUNCTION public.profiles_ensure_note_thread() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_profiles_ensure_note_thread ON public.profiles;
CREATE TRIGGER trg_profiles_ensure_note_thread
  AFTER INSERT OR UPDATE OF coach_id, role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_ensure_note_thread();

-- Backfill: solo alumnos SIN ningún hilo (mismo criterio que el trigger).
INSERT INTO public.note_threads (coach_id, student_id)
SELECT p.coach_id, p.id
  FROM public.profiles p
 WHERE p.role = 'student'
   AND p.coach_id IS NOT NULL
   AND p.coach_id <> p.id
   AND NOT EXISTS (SELECT 1 FROM public.note_threads nt WHERE nt.student_id = p.id)
ON CONFLICT (coach_id, student_id) DO NOTHING;

COMMIT;

-- ── Verificación inline (convención 4 del README de supabase/) ──
DO $$
DECLARE
  v_sin_hilo int;
  v_dups     int;
  v_trg      int;
BEGIN
  SELECT count(*) INTO v_sin_hilo
    FROM public.profiles p
   WHERE p.role = 'student' AND p.coach_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.note_threads nt WHERE nt.student_id = p.id);

  SELECT count(*) INTO v_dups
    FROM (SELECT student_id FROM public.note_threads GROUP BY student_id HAVING count(*) > 1) d;

  SELECT count(*) INTO v_trg
    FROM pg_trigger WHERE tgname = 'trg_profiles_ensure_note_thread' AND NOT tgisinternal;

  IF v_sin_hilo <> 0 OR v_dups <> 0 OR v_trg <> 1 THEN
    RAISE EXCEPTION 'v35b: quedo inconsistente (sin_hilo=%, duplicados=%, trigger=%)',
      v_sin_hilo, v_dups, v_trg;
  END IF;

  RAISE NOTICE 'OK v35b — todos los alumnos con coach tienen hilo, sin duplicados, trigger instalado.';
END $$;
