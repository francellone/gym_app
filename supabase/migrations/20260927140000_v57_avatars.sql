-- ============================================================
-- v57 — Foto de perfil (pedido de Franco 2026-09-27)
-- ------------------------------------------------------------
-- Decisiones:
--   1) Cada persona sube SOLO su propia foto (la coach no carga la de nadie).
--   2) La foto la ven la propia persona y su coach (profiles.coach_id), y la
--      persona ve la foto de su coach. Nada público: bucket privado y links
--      firmados de vida corta.
--   3) El recorte circular y el achicado a 256 px se hacen en el navegador;
--      acá solo se acepta webp/jpeg/png de hasta 512 KB.
--
-- Ruta: avatars/<user_id>/<timestamp>.webp. profiles.avatar_url guarda la
-- RUTA (no una URL), porque las URLs firmadas vencen.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ¿Quién puede ver la carpeta de <owner>? La persona, su coach, o (si owner
-- es coach) sus personas.
create or replace function public.can_see_avatar(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p_owner = auth.uid()
    or exists (select 1 from public.profiles p where p.id = p_owner and p.coach_id = auth.uid())
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.coach_id = p_owner)
  )
$$;
revoke execute on function public.can_see_avatar(uuid) from public, anon;
grant execute on function public.can_see_avatar(uuid) to authenticated;

-- Carpeta = primer segmento de la ruta. Si no es un uuid válido, nadie la ve.
create or replace function public._avatar_owner(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_see_avatar(public._avatar_owner(name)));

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public._avatar_owner(name) = auth.uid());

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public._avatar_owner(name) = auth.uid())
  with check (bucket_id = 'avatars' and public._avatar_owner(name) = auth.uid());

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public._avatar_owner(name) = auth.uid());

-- El historial de cambios del perfil no registra la foto (sería una ruta
-- ilegible en la pestaña Historial de la coach).
CREATE OR REPLACE FUNCTION public.fn_audit_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_changed_by uuid;
  v_old_jsonb  jsonb;
  v_new_jsonb  jsonb;
  v_key        text;
  v_old_value  text;
  v_new_value  text;
BEGIN
  BEGIN
    v_changed_by := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;

  v_old_jsonb := to_jsonb(OLD);
  v_new_jsonb := to_jsonb(NEW);

  FOR v_key IN SELECT jsonb_object_keys(v_new_jsonb) LOOP
    IF v_key IN ('id', 'created_at', 'updated_at', 'avatar_url') THEN
      CONTINUE;
    END IF;

    v_old_value := v_old_jsonb->>v_key;
    v_new_value := v_new_jsonb->>v_key;

    IF v_old_value IS DISTINCT FROM v_new_value THEN
      INSERT INTO public.student_edit_history (
        student_id, changed_by, field_name, old_value, new_value, changed_at
      ) VALUES (
        NEW.id, v_changed_by, v_key, v_old_value, v_new_value, now()
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
