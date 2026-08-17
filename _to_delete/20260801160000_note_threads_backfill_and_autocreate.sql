-- ============================================================
-- v35b — Todo alumno con coach tiene hilo de notas (backfill + trigger)
-- ------------------------------------------------------------
-- Problema (detectado 2026-08-01 auditando la RLS):
--   `note_threads` se crea LAZY: recién cuando la coach abre la pestaña de
--   notas de esa alumna (RPC notes_get_or_create_thread). Si nunca la abrió,
--   no hay hilo — y entonces postWorkoutLogNote / postWorkoutBlockLogNote /
--   postPSEDayNote / postEvalResultNote cortan con
--   "No hay hilo de notas inicializado para este alumno" y el comentario se
--   descarta. Le pega a la alumna Y a la coach por igual.
--
--   Al momento del fix, 10 alumnas de Anto no tenían hilo, 6 de ellas
--   entrenando esa misma semana:
--     Jessica Nieto (94 logs), Mahnaz Beit Masha (66), Karen Guerinoni (37),
--     Andrea Martinez (36), Kendra Williams (30), Nadia Kent (23),
--     y sin logs: Keeley Obrien, Samantha Sanabria, Nicolette Foo, Prueba 2.
--
-- Solución: dejar de depender de que alguien "pase por ahí".
--   1) backfill idempotente de los hilos faltantes;
--   2) trigger en profiles que crea el hilo cuando un alumno recibe coach.
--
-- Relacionado: [[coach-mode-notas-mal-atribuidas]] — misma familia de bug
-- (error de guardado tragado por console.warn). El front ya lo surface en el
-- SaveErrorBanner desde v35.
-- ============================================================

BEGIN;

-- ── 1. Trigger: el hilo se crea solo ────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_ensure_note_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER            -- crea el hilo sin depender de la RLS del caller
SET search_path = public, pg_temp
AS $$
BEGIN
  -- OJO: el front resuelve el hilo con
  --   .from('note_threads').eq('student_id', X).maybeSingle()
  -- o sea asume UN hilo por alumno. Si el alumno cambia de coach y le
  -- creáramos un segundo hilo, `maybeSingle()` reventaría con "multiple rows".
  -- Por eso solo creamos hilo cuando el alumno NO tiene ninguno.
  -- (Reasignar de coach necesita decidir si se migra el hilo o se abre otro,
  --  y eso toca getStudentThread — queda fuera de esta migración.)
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

-- ── 2. Backfill de los que ya existen ───────────────────────
-- Solo alumnos SIN ningún hilo (mismo criterio que el trigger). Los 4 alumnos
-- con coach_id NULL cuyo hilo apunta a un coach de prueba quedan como están.
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
  v_trg      int;
BEGIN
  SELECT count(*) INTO v_sin_hilo
    FROM public.profiles p
   WHERE p.role = 'student' AND p.coach_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.note_threads nt WHERE nt.student_id = p.id);

  SELECT count(*) INTO v_trg
    FROM pg_trigger WHERE tgname = 'trg_profiles_ensure_note_thread' AND NOT tgisinternal;

  IF v_sin_hilo <> 0 OR v_trg <> 1 THEN
    RAISE EXCEPTION 'v35b: quedaron % alumnos con coach y sin hilo (trigger=%)', v_sin_hilo, v_trg;
  END IF;

  RAISE NOTICE 'OK v35b — 0 alumnos con coach sin hilo de notas; trigger instalado.';
END $$;

-- ── Control extra: nadie debería quedar con más de un hilo ──
DO $$
DECLARE v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT student_id FROM public.note_threads GROUP BY student_id HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'v35b: % alumnos con mas de un hilo — getStudentThread usa maybeSingle() y va a romper', v_dupes;
  END IF;
  RAISE NOTICE 'OK v35b — 0 alumnos con hilo duplicado.';
END $$;
