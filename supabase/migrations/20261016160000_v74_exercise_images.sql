-- ============================================================
-- v74 — Imagen por ejercicio (pedido de una coach, 2026-10-15)
-- ------------------------------------------------------------
-- Decisiones de Franco (2026-10-15/16):
--   1) La sube la coach, UNA por ejercicio, en el catálogo. Aparece en todos
--      los planes que lo usan. No se usan miniaturas de YouTube.
--   2) La ve quien ya puede ver el ejercicio (dueña, coaches con acceso al
--      catálogo, personas que lo tienen en un plan). Bucket privado + links
--      firmados, igual que las fotos de perfil (v57).
--   3) El achicado (lado mayor 800 px, webp) se hace en el navegador; acá se
--      acepta webp/jpeg/png de hasta 1 MB.
--
-- Ruta: exercise-images/<exercise_id>/<timestamp>.webp
-- exercises.image_path guarda la RUTA, no una URL (las firmadas vencen).
--
-- Lectura: la política consulta public.exercises con los permisos de quien
-- pide, así que hereda exactamente la visibilidad del ejercicio
-- (select_visible_exercises). Escritura: solo la dueña del ejercicio
-- (misma regla que owner_manage_own_exercises).
--
-- Fusión (merge_exercises): la imagen NO se traspasa; el ejercicio que queda
-- conserva la suya. Pendiente si hiciera falta.
-- ============================================================

alter table public.exercises add column if not exists image_path text;
comment on column public.exercises.image_path is
  'v74: ruta dentro del bucket privado exercise-images (<exercise_id>/<ts>.webp). NULL = sin imagen.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-images', 'exercise-images', false, 1048576, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Carpeta = primer segmento de la ruta. Si no es un uuid válido, nadie la ve.
create or replace function public._exercise_image_owner_id(p_name text)
returns uuid language plpgsql immutable set search_path = public as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;

drop policy if exists exercise_images_select on storage.objects;
create policy exercise_images_select on storage.objects for select to authenticated
  using (
    bucket_id = 'exercise-images'
    and exists (
      select 1 from public.exercises e
      where e.id = public._exercise_image_owner_id(objects.name)
    )
  );

drop policy if exists exercise_images_insert_owner on storage.objects;
create policy exercise_images_insert_owner on storage.objects for insert to authenticated
  with check (
    bucket_id = 'exercise-images'
    and exists (
      select 1 from public.exercises e
      where e.id = public._exercise_image_owner_id(objects.name)
        and e.created_by = (select auth.uid())
    )
  );

drop policy if exists exercise_images_update_owner on storage.objects;
create policy exercise_images_update_owner on storage.objects for update to authenticated
  using (
    bucket_id = 'exercise-images'
    and exists (
      select 1 from public.exercises e
      where e.id = public._exercise_image_owner_id(objects.name)
        and e.created_by = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'exercise-images'
    and exists (
      select 1 from public.exercises e
      where e.id = public._exercise_image_owner_id(objects.name)
        and e.created_by = (select auth.uid())
    )
  );

drop policy if exists exercise_images_delete_owner on storage.objects;
create policy exercise_images_delete_owner on storage.objects for delete to authenticated
  using (
    bucket_id = 'exercise-images'
    and exists (
      select 1 from public.exercises e
      where e.id = public._exercise_image_owner_id(objects.name)
        and e.created_by = (select auth.uid())
    )
  );
