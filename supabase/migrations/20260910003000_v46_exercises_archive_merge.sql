-- v46 — El catálogo de ejercicios no se borra: se archiva, se fusiona o, si nadie lo
-- referencia, se elimina. Decisiones D2 y D3 en docs/decisiones-catalogo-y-borrado.md.
--
--   - exercises.archived_at / archived_by: "no lo quiero usar más". Sale de los selectores,
--     sigue existiendo para todo lo que lo referencia. Reversible.
--   - exercises.merged_into_id: lápida de un duplicado fusionado. Siempre archivado.
--   - exercise_merges: auditoría de cada fusión (conteos + copia del origen + sus etiquetas).
--   - merge_exercises(from, into): repunta las 8 referencias al canónico en una transacción.
--   - set_exercise_archived(id, bool): archivar / desarchivar (security definer, is_coach()).
--   - exercise_duplicate_candidates(): grupos por nombre normalizado y por video_url.
--   - exercise_usage(): suma 'students' (alumnas con historial) para el preview.
--   - app.bulk_maintenance: GUC de sesión que silencia las notificaciones de "plan
--     actualizado" y el touch de updated_at mientras corre una fusión.

-- ============================================================================
-- Columnas de archivado y lápida
-- ============================================================================

alter table public.exercises
  add column if not exists archived_at    timestamptz,
  add column if not exists archived_by    uuid references public.profiles(id) on delete set null,
  add column if not exists merged_into_id uuid references public.exercises(id) on delete set null;

create index if not exists idx_exercises_archived_at
  on public.exercises (archived_at) where archived_at is not null;

comment on column public.exercises.archived_at is
  'Archivado (v46): no aparece en selectores ni en la biblioteca por defecto. Sigue existiendo para todo lo que lo referencia.';
comment on column public.exercises.merged_into_id is
  'Lápida (v46): este ejercicio fue fusionado en merged_into_id. Todas sus referencias se repuntaron. Siempre archivado.';

-- ============================================================================
-- Auditoría de fusiones
-- ============================================================================

create table if not exists public.exercise_merges (
  id               uuid primary key default gen_random_uuid(),
  from_exercise_id uuid not null references public.exercises(id) on delete restrict,
  into_exercise_id uuid not null references public.exercises(id) on delete restrict,
  merged_by        uuid references public.profiles(id) on delete set null,
  merged_at        timestamptz not null default now(),
  counts           jsonb not null,
  from_snapshot    jsonb not null,
  from_tag_ids     uuid[] not null default '{}'
);

comment on table public.exercise_merges is
  'Una fila por fusión de ejercicios (v46). counts = filas repuntadas por tabla; from_snapshot = la fila del origen antes de fusionar; from_tag_ids = sus etiquetas. Con esto la fusión se puede deshacer a mano.';

alter table public.exercise_merges enable row level security;

drop policy if exists coach_select_exercise_merges on public.exercise_merges;
create policy coach_select_exercise_merges on public.exercise_merges
  for select using (public.is_coach());

-- ============================================================================
-- GUC de mantenimiento masivo: silencia notificaciones y touch de updated_at
-- ============================================================================

create or replace function public.bulk_maintenance_on()
returns boolean
language sql
stable
as $function$
  select coalesce(current_setting('app.bulk_maintenance', true), '') = 'on';
$function$;

create or replace function public.fn_notify_plan_updated_on_children()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_plan_id uuid;
begin
  -- v46: una fusión de ejercicios repunta casilleros de muchos planes sin cambiarles
  -- nada a las alumnas. No es un "plan actualizado".
  if public.bulk_maintenance_on() then
    return coalesce(new, old);
  end if;
  v_plan_id := coalesce(new.plan_id, old.plan_id);
  perform public.fn_notify_plan_updated_internal(v_plan_id);
  return coalesce(new, old);
end;
$function$;

create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- v46: un repunte masivo por fusión no es una edición del registro.
  if public.bulk_maintenance_on() then
    return new;
  end if;
  new.updated_at = now();
  return new;
end;
$function$;

-- ============================================================================
-- Archivar / desarchivar
-- ============================================================================

create or replace function public.set_exercise_archived(p_exercise_id uuid, p_archived boolean)
returns public.exercises
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.exercises;
begin
  if not public.is_coach() then
    raise exception 'solo un coach puede archivar ejercicios' using errcode = '42501';
  end if;

  select * into v_row from public.exercises where id = p_exercise_id;
  if v_row.id is null then
    raise exception 'ejercicio inexistente' using errcode = 'P0002';
  end if;
  if not p_archived and v_row.merged_into_id is not null then
    raise exception 'este ejercicio fue fusionado en otro y no se puede desarchivar'
      using errcode = 'P0001';
  end if;

  update public.exercises
     set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
         archived_by = case when p_archived then coalesce(archived_by, auth.uid()) else null end
   where id = p_exercise_id
   returning * into v_row;

  return v_row;
end;
$function$;

grant execute on function public.set_exercise_archived(uuid, boolean) to authenticated;

-- ============================================================================
-- Fusionar duplicados
-- ============================================================================

create or replace function public.merge_exercises(p_from uuid, p_into uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_from     public.exercises;
  v_into     public.exercises;
  v_counts   jsonb := '{}'::jsonb;
  v_tag_ids  uuid[];
  n          bigint;
begin
  if not public.is_coach() then
    raise exception 'solo un coach puede fusionar ejercicios' using errcode = '42501';
  end if;
  if p_from = p_into then
    raise exception 'no se puede fusionar un ejercicio consigo mismo' using errcode = 'P0001';
  end if;

  select * into v_from from public.exercises where id = p_from for update;
  select * into v_into from public.exercises where id = p_into for update;
  if v_from.id is null or v_into.id is null then
    raise exception 'ejercicio inexistente' using errcode = 'P0002';
  end if;
  if v_from.merged_into_id is not null then
    raise exception 'el ejercicio origen ya fue fusionado' using errcode = 'P0001';
  end if;
  if v_into.merged_into_id is not null then
    raise exception 'el ejercicio destino es una lápida de otra fusión' using errcode = 'P0001';
  end if;
  if v_into.archived_at is not null then
    raise exception 'el ejercicio destino está archivado; desarchivalo primero' using errcode = 'P0001';
  end if;

  -- Silenciar "tu coach actualizó tu plan" y el touch de updated_at durante el repunte.
  perform set_config('app.bulk_maintenance', 'on', true);

  -- Etiquetas: se copian al canónico (sin duplicar) y se guardan para la auditoría.
  select coalesce(array_agg(tag_id), '{}') into v_tag_ids
    from public.exercise_tag_assignments where exercise_id = p_from;
  insert into public.exercise_tag_assignments (exercise_id, tag_id)
    select p_into, tag_id from public.exercise_tag_assignments where exercise_id = p_from
    on conflict do nothing;
  delete from public.exercise_tag_assignments where exercise_id = p_from;
  v_counts := v_counts || jsonb_build_object('tags', coalesce(array_length(v_tag_ids, 1), 0));

  -- Configuración de planes
  update public.plan_exercises set exercise_id = p_into where exercise_id = p_from;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('plan_exercises', n);

  update public.plan_exercises set rm_reference_exercise_id = p_into where rm_reference_exercise_id = p_from;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('rm_references', n);

  update public.evaluation_tests set exercise_id = p_into where exercise_id = p_from;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('eval_tests', n);

  -- Hechos (los snapshots de nombre se conservan: dicen cómo se llamaba en ese momento)
  update public.workout_logs set exercise_id = p_into where exercise_id = p_from;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('workout_logs', n);

  update public.evaluation_test_responses set exercise_id = p_into where exercise_id = p_from;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('eval_responses', n);

  update public.plan_exercise_prescription_history set exercise_id = p_into where exercise_id = p_from;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('prescription_history', n);

  update public.notes set exercise_id = p_into where exercise_id = p_from;
  get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', n);

  -- Lápida
  update public.exercises
     set archived_at = now(), archived_by = auth.uid(), merged_into_id = p_into
   where id = p_from;

  insert into public.exercise_merges (from_exercise_id, into_exercise_id, merged_by, counts, from_snapshot, from_tag_ids)
  values (p_from, p_into, auth.uid(), v_counts, to_jsonb(v_from), v_tag_ids);

  return v_counts;
end;
$function$;

grant execute on function public.merge_exercises(uuid, uuid) to authenticated;

comment on function public.merge_exercises(uuid, uuid) is
  'Fusiona el ejercicio p_from en p_into (v46): repunta plan_exercises (exercise_id y rm_reference), evaluation_tests, workout_logs, evaluation_test_responses, prescription_history, notes y etiquetas; deja p_from como lápida archivada con merged_into_id; audita en exercise_merges. Devuelve los conteos.';

-- ============================================================================
-- Candidatos a duplicado
-- ============================================================================

create or replace function public.exercise_duplicate_candidates()
returns table (kind text, group_key text, exercise_ids uuid[])
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with activos as (
    select id, name, video_url,
           lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) as norm_name
      from public.exercises
     where archived_at is null
  ),
  por_nombre as (
    select 'name'::text as kind, norm_name as group_key, array_agg(id order by name) as exercise_ids
      from activos group by norm_name having count(*) > 1
  ),
  por_video as (
    select 'video'::text as kind, video_url as group_key, array_agg(id order by name) as exercise_ids
      from activos
     where video_url is not null and btrim(video_url) <> ''
     group by video_url having count(*) > 1
  )
  select * from por_nombre
  union all
  -- Un grupo por video que ya es idéntico a un grupo por nombre no se repite.
  select v.* from por_video v
   where not exists (select 1 from por_nombre n where n.exercise_ids = v.exercise_ids)
  order by 1, 2;
$function$;

grant execute on function public.exercise_duplicate_candidates() to authenticated;

-- ============================================================================
-- exercise_usage: suma alumnas con historial
-- ============================================================================

create or replace function public.exercise_usage(p_exercise_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'workout_logs',        (select count(*) from public.workout_logs                       where exercise_id = p_exercise_id),
    'eval_responses',      (select count(*) from public.evaluation_test_responses          where exercise_id = p_exercise_id),
    'eval_tests',          (select count(*) from public.evaluation_tests                   where exercise_id = p_exercise_id),
    'prescription_history',(select count(*) from public.plan_exercise_prescription_history where exercise_id = p_exercise_id),
    'plan_exercises',      (select count(*) from public.plan_exercises                     where exercise_id = p_exercise_id),
    'plans',               (select count(distinct plan_id) from public.plan_exercises      where exercise_id = p_exercise_id),
    'notes',               (select count(*) from public.notes                              where exercise_id = p_exercise_id),
    'students',            (select count(distinct s) from (
                              select student_id as s from public.workout_logs where exercise_id = p_exercise_id
                              union
                              select er.student_id from public.evaluation_test_responses r
                                join public.evaluation_results er on er.id = r.evaluation_result_id
                               where r.exercise_id = p_exercise_id) u)
  );
$function$;
