-- ============================================================
-- Migration v27: habilitar realtime en notifications
-- ------------------------------------------------------------
-- Síntoma observado (2026-05-17):
--   * La campana de notificaciones del coach no actualiza en vivo.
--   * El badge de no-leídas queda desincronizado entre pestañas:
--     al marcar una notificación como leída en una vista, la otra
--     no refleja el cambio hasta refrescar manualmente.
--
-- Causa raíz:
--   La tabla `public.notifications` (creada en v16) tiene triggers
--   que insertan correctamente (plan asignado, primer log del día,
--   sesión completada, etc.), pero NUNCA fue agregada a la
--   publicación lógica `supabase_realtime`. Las suscripciones del
--   frontend a `postgres_changes` sobre esa tabla se conectan sin
--   error pero nunca reciben eventos: el código de realtime en
--   cliente es no-op, igual que el caso de `notes` antes de v24e.
--
-- Antecedente:
--   v24e (migration_v24e_enable_realtime_on_notes.sql) resolvió el
--   mismo bug para `notes` y `note_threads`. Esta migración aplica
--   el mismo fix a `notifications`.
--
-- Diferencia con v24e:
--   Acá sí necesitamos REPLICA IDENTITY FULL, porque el cliente
--   observa la transición de `read` false→true vía UPDATE y debe
--   poder comparar OLD vs NEW. Con el default (PRIMARY KEY) Postgres
--   sólo emite la PK en el payload de OLD y el cambio del flag se
--   pierde.
--
-- Idempotencia:
--   `ALTER PUBLICATION ... ADD TABLE` no soporta `IF NOT EXISTS`,
--   por lo cual envolvemos el ADD en un DO block que consulta
--   `pg_publication_tables` antes de ejecutar.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. AGREGAR notifications A LA PUBLICACIÓN supabase_realtime
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    RAISE NOTICE 'v27: public.notifications agregada a supabase_realtime';
  ELSE
    RAISE NOTICE 'v27: public.notifications ya estaba en supabase_realtime, skip';
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. REPLICA IDENTITY FULL
-- ------------------------------------------------------------
-- Necesario para que los eventos UPDATE incluyan la fila completa
-- vieja y nueva en el payload de WAL/realtime. Sin esto, OLD sólo
-- trae la PK y el cliente no puede detectar el flip de `read`.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ────────────────────────────────────────────────────────────
-- 3. VERIFICACIÓN FINAL
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  c integer;
BEGIN
  SELECT count(*) INTO c FROM pg_publication_tables
   WHERE pubname    = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename  = 'notifications';
  IF c <> 1 THEN
    RAISE EXCEPTION 'v27: esperaba 1 tabla (notifications) en supabase_realtime, encontré %', c;
  END IF;
  RAISE NOTICE 'v27 ok: realtime habilitado en notifications (con REPLICA IDENTITY FULL)';
END;
$$;
