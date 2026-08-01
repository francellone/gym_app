-- ============================================================
-- v35 — Nadie puede editar el TEXTO de una nota que no escribió
-- ------------------------------------------------------------
-- Contexto (bug reportado 2026-08-01, modo coach v33):
--   `postWorkoutLogNote` / `postWorkoutBlockLogNote` hardcodeaban la autoría
--   como {author_id: studentId, author_role: 'student'}. En modo coach eso
--   producía dos daños distintos:
--     a) INSERT → rechazado por la policy "Coach insert as self coach"
--        (exige author_id = auth.uid() AND author_role = 'coach'). El caller
--        solo hacía console.warn: el comentario de la coach se perdía.
--     b) UPDATE → si la alumna YA había comentado ese log, el lookup
--        (author_role='student') encontraba SU nota y la coach le pisaba el
--        texto. La policy "Coach update notes" (v24f) lo permite, porque es
--        deliberadamente amplia para marcar leído y soft-delete.
--
--   El front ya se corrigió (la autoría viaja como parámetro). Esta migración
--   es el backstop en la base: la policy sigue permitiendo al coach UPDATE
--   (read_at_coach, deleted_at, etc.), pero el `body` queda protegido por
--   autoría. Mismo criterio que v33 con save_workout_log: la verdad se deriva
--   de auth.uid(), no de lo que mande el cliente.
--
-- No rompe la UI: NoteCard ya gatea editar/borrar con `isOwn`
-- (currentUserId === note.author_id).
--
-- APLICADA en producción (bvexjanqmfypmtgoapbt) el 2026-08-01 vía MCP
-- apply_migration, registrada como version 20260801144243 — de ahí el nombre
-- del archivo. Verificada con tests de RLS + trigger bajo la sesión de la coach
-- (ver diagnostico_arquitec/notas_modo_coach_2026-08-01.md §5).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.notes_guard_body_authorship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Solo aplica a sesiones autenticadas. service_role, SECURITY DEFINER y
  -- tareas de mantenimiento (auth.uid() NULL) quedan fuera a propósito:
  -- si no, un backfill legítimo no podría corregir textos.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.body IS DISTINCT FROM OLD.body AND OLD.author_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION
      'No se puede editar el texto de una nota ajena (nota %, autor %).', OLD.id, OLD.author_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notes_guard_body_authorship() IS
  'v35 — bloquea editar notes.body cuando auth.uid() no es el autor. Deja pasar read_at_*, deleted_at y demás columnas. auth.uid() NULL (service_role / definer / backfill) no se ve afectado.';

DROP TRIGGER IF EXISTS trg_notes_guard_body_authorship ON public.notes;
CREATE TRIGGER trg_notes_guard_body_authorship
  BEFORE UPDATE OF body ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_guard_body_authorship();

COMMIT;

-- ── Verificación inline (convención 4 del README de supabase/) ──
DO $$
DECLARE
  v_fn  int;
  v_trg int;
BEGIN
  SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'notes_guard_body_authorship';

  SELECT count(*) INTO v_trg
    FROM pg_trigger
   WHERE tgname = 'trg_notes_guard_body_authorship' AND NOT tgisinternal;

  IF v_fn <> 1 OR v_trg <> 1 THEN
    RAISE EXCEPTION 'v35: la guarda de autoría no quedó instalada (fn=%, trg=%)', v_fn, v_trg;
  END IF;

  RAISE NOTICE 'OK v35 — trg_notes_guard_body_authorship instalado sobre public.notes.';
END $$;
