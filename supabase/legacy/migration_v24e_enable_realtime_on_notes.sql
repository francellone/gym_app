-- ============================================================
-- Migration v24e: habilitar realtime en notes + note_threads
-- ------------------------------------------------------------
-- Hallazgo de auditoría (2026-05-17): el hook useNotes monta un
-- canal supabase.channel(...).on('postgres_changes', ...) pero
-- la tabla `notes` no estaba en la publicación supabase_realtime,
-- por lo cual nunca llegaban eventos. El código de realtime existía
-- en cliente pero era no-op. Agregamos tanto `notes` como
-- `note_threads` (para que en Fase B se puedan refrescar contadores
-- de no-leídas en vivo desde una bandeja).
--
-- Sin REPLICA IDENTITY personalizado: el DEFAULT (PRIMARY KEY)
-- alcanza para INSERT/UPDATE/DELETE con NEW.id / OLD.id, que es
-- lo que el cliente usa.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.note_threads;

DO $$
DECLARE
  c integer;
BEGIN
  SELECT count(*) INTO c FROM pg_publication_tables
   WHERE pubname='supabase_realtime'
     AND schemaname='public'
     AND tablename IN ('notes','note_threads');
  IF c <> 2 THEN
    RAISE EXCEPTION 'v24e: esperaba 2 tablas en supabase_realtime, encontré %', c;
  END IF;
  RAISE NOTICE 'v24e ok: realtime habilitado en notes + note_threads';
END;
$$;
