-- ============================================================
-- Migration v25f: updated_at solo cambia con cambios de contenido
-- ------------------------------------------------------------
-- Bug observado en producción 2026-05-17: TODAS las notas (67/67)
-- aparecían con "· editada" en la UI porque el trigger
-- `notes_updated_at` (BEFORE UPDATE genérico) pisaba updated_at
-- en cualquier UPDATE, incluyendo:
--   - markThreadRead (SET read_at_coach/read_at_student)
--   - softDeleteNote (SET deleted_at)
--   - El propio backfill v24c (SET created_at=X, updated_at=X)
--
-- Fix:
--   1) Restringir el trigger a UPDATE OF body, tags, visibility,
--      context_type, context_id, parent_note_id (los campos de
--      contenido real). Cambios de read_at_*, deleted_at o el
--      mismo updated_at ya no disparan el trigger.
--   2) Reset de updated_at = created_at para todas las notas vivas
--      con drift, porque la corrupción fue silenciosa y el usuario
--      aún no editó contenido genuinamente desde el panel.
-- ============================================================

DROP TRIGGER IF EXISTS notes_updated_at ON public.notes;
CREATE TRIGGER notes_updated_at
  BEFORE UPDATE OF body, tags, visibility, context_type, context_id, parent_note_id
  ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

UPDATE public.notes
   SET updated_at = created_at
 WHERE deleted_at IS NULL
   AND extract(epoch FROM (updated_at - created_at)) > 2;
