-- ============================================================
-- v74b — Corrige las políticas del bucket exercise-images (v74)
-- ------------------------------------------------------------
-- Bug: dentro del EXISTS sobre public.exercises, la columna `name` sin
-- calificar se resolvía como exercises.name (el nombre del ejercicio) y no
-- como storage.objects.name (la ruta del archivo). Resultado: la condición
-- nunca se cumplía y la dueña recibía 42501 al subir (visto 2026-10-16 con
-- Anto en "Vuelo lateral polea"). Se califica como objects.name.
-- ============================================================

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
