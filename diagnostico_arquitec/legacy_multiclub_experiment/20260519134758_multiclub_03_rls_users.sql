-- ============================================================================
-- ARCHIVADO POR ERROR — NO RE-APLICAR EN gym_app
-- ============================================================================
-- Aplicado contra el proyecto Supabase `bvexjanqmfypmtgoapbt` el 2026-05-19
-- a las 13:47:58 UTC-3 por error. Pertenece al proyecto "Aplicación para
-- clubes deportivos". Rolleado a las 14:00:08 por la migración
-- `20260519140008_rollback_multiclub_tables.sql`.
--
-- Ver README.md en esta carpeta para contexto completo.
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- SELECT: sí mismo, admins del club donde es miembro, o app owner
CREATE POLICY users_select_self_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_app_owner()
    OR EXISTS (
      SELECT 1 FROM public.club_memberships cm
      WHERE cm.user_id = public.users.id AND cm.estado = 'activo'
        AND public.can_admin_club(cm.club_id)
    )
  );

-- INSERT: el usuario puede crear su propia fila (onboarding / upsert defensivo)
CREATE POLICY users_insert_self ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- UPDATE: sí mismo o app owner
CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING  (id = auth.uid() OR public.is_app_owner())
  WITH CHECK (id = auth.uid() OR public.is_app_owner());

-- DELETE: solo app owner
CREATE POLICY users_delete_owner_app ON public.users
  FOR DELETE TO authenticated
  USING (public.is_app_owner());

-- Backfill: crear filas para los usuarios de auth que ya existen
INSERT INTO public.users (id, email, auth_provider, onboarding_completado)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_app_meta_data->>'provider', 'email'),
  FALSE
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = au.id)
ON CONFLICT (id) DO NOTHING;
