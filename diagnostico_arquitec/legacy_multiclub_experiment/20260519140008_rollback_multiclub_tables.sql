-- ============================================================================
-- ROLLBACK del experimento multiclub — aplicado el 2026-05-19 14:00:08 UTC-3
-- ============================================================================
-- Revirtió completamente las 3 migraciones aplicadas por error 13 minutos antes.
--
-- Ver README.md en esta carpeta para contexto completo.
-- ============================================================================

-- Eliminar trigger de auth primero (es lo más crítico)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();

-- Eliminar tablas en orden (dependencias primero)
DROP TABLE IF EXISTS public.club_role_assignments CASCADE;
DROP TABLE IF EXISTS public.club_memberships CASCADE;
DROP TABLE IF EXISTS public.global_roles CASCADE;
DROP TABLE IF EXISTS public.clubs CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Eliminar helper functions
DROP FUNCTION IF EXISTS public.is_app_owner();
DROP FUNCTION IF EXISTS public.is_club_member(UUID);
DROP FUNCTION IF EXISTS public.has_club_role(UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.can_admin_club(UUID);
DROP FUNCTION IF EXISTS public.my_club_ids();
DROP FUNCTION IF EXISTS public.set_updated_at();
