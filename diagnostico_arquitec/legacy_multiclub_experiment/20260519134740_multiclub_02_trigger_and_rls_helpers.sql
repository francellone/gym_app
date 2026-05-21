-- ============================================================================
-- ARCHIVADO POR ERROR — NO RE-APLICAR EN gym_app
-- ============================================================================
-- Aplicado contra el proyecto Supabase `bvexjanqmfypmtgoapbt` el 2026-05-19
-- a las 13:47:40 UTC-3 por error. Pertenece al proyecto "Aplicación para
-- clubes deportivos". Rolleado a las 14:00:08 por la migración
-- `20260519140008_rollback_multiclub_tables.sql`.
--
-- Ver README.md en esta carpeta para contexto completo.
-- ============================================================================

-- Trigger: crea fila en public.users cuando Supabase registra un nuevo auth user
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, auth_provider, provider_user_id, nombre, apellido)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    NEW.raw_user_meta_data->>'provider_id',
    NEW.raw_user_meta_data->>'nombre',
    NEW.raw_user_meta_data->>'apellido'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;

-- Helper functions para RLS
CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.global_roles gr WHERE gr.user_id = auth.uid() AND gr.role_type IN ('owner_app','support'));
$$;

CREATE OR REPLACE FUNCTION public.is_club_member(target_club_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.club_memberships cm WHERE cm.user_id = auth.uid() AND cm.club_id = target_club_id AND cm.estado = 'activo');
$$;

CREATE OR REPLACE FUNCTION public.has_club_role(target_club_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.club_role_assignments r WHERE r.user_id = auth.uid() AND r.club_id = target_club_id AND r.role_type = ANY(allowed_roles) AND (r.fecha_hasta IS NULL OR r.fecha_hasta >= CURRENT_DATE));
$$;

CREATE OR REPLACE FUNCTION public.can_admin_club(target_club_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_app_owner() OR public.has_club_role(target_club_id, ARRAY['club_admin','club_manager']);
$$;

CREATE OR REPLACE FUNCTION public.my_club_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cm.club_id FROM public.club_memberships cm WHERE cm.user_id = auth.uid() AND cm.estado = 'activo';
$$;

REVOKE ALL ON FUNCTION public.is_app_owner()               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_club_member(UUID)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_club_role(UUID, TEXT[])  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_admin_club(UUID)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_club_ids()                FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_app_owner()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_member(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_club_role(UUID, TEXT[])  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_club(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_club_ids()                TO authenticated;
