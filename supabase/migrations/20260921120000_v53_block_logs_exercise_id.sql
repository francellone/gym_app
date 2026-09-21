-- ============================================================
-- v53 — workout_block_logs.exercise_id (el hecho sabe qué ejercicio fue)
-- ------------------------------------------------------------
-- CONTEXTO (Franco, 2026-09-21): "el coach no puede visualizar los datos
-- de los aeróbicos". Los datos existían (workout_block_logs), pero
-- ninguna pantalla del coach los leía. Al revisar el modelo apareció una
-- deuda: un registro aeróbico no sabe qué ejercicio era (bici, cinta...),
-- ese dato vive en plan_exercises del bloque, un salto intermedio. Es la
-- misma regla que cerró v41 para workout_logs (exercise_id propio) y v45
-- para el resto de las tablas de hechos: cada hecho con sus propias claves.
--
-- Esta migración:
--   1) agrega workout_block_logs.exercise_id (FK RESTRICT, como workout_logs),
--   2) rellena los registros AERÓBICOS existentes con el primer ejercicio
--      del bloque (un aeróbico tiene 0 o 1 ejercicio; un circuito tiene
--      varios, así que ahí queda NULL a propósito),
--   3) extiende el trigger de snapshot (v45) para que lo copie al insertar,
--   4) suma la tabla a merge_exercises y exercise_usage (v46) para que la
--      fusión de duplicados no deje referencias colgadas.
-- ============================================================

alter table public.workout_block_logs
  add column if not exists exercise_id uuid
    references public.exercises(id) on delete restrict;

create index if not exists workout_block_logs_exercise_id_idx
  on public.workout_block_logs (exercise_id);

comment on column public.workout_block_logs.exercise_id is
  'Ejercicio del bloque aeróbico al registrar (v53). NULL en circuitos (varios ejercicios). Sobrevive al borrado del bloque.';

-- 2) Relleno de los aeróbicos existentes
update public.workout_block_logs l
   set exercise_id = (
     select pe.exercise_id
       from public.plan_exercises pe
      where pe.block_id = l.plan_block_id
      order by pe.order_index, pe.created_at
      limit 1
   )
 where l.exercise_id is null
   and l.plan_block_id is not null
   and coalesce(l.block_type, 'aerobic') = 'aerobic';

-- 3) Trigger de snapshot: ahora también exercise_id
create or replace function public.workout_block_logs_sync_block()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.plan_block_id is not null
     and (new.section is null
          or tg_op = 'INSERT'
          or new.plan_block_id is distinct from old.plan_block_id) then
    select b.section, b.block_type, b.title
      into new.section, new.block_type, new.block_title
      from public.plan_blocks b
     where b.id = new.plan_block_id;
  end if;

  -- v53: el ejercicio del aeróbico, si el front no lo mandó
  if new.plan_block_id is not null
     and new.exercise_id is null
     and new.block_type = 'aerobic' then
    select pe.exercise_id
      into new.exercise_id
      from public.plan_exercises pe
     where pe.block_id = new.plan_block_id
     order by pe.order_index, pe.created_at
     limit 1;
  end if;
  return new;
end;
$function$;

-- 4) Fusión de ejercicios y conteo de uso
create or replace function public.merge_exercises(p_from uuid, p_into uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_from public.exercises; v_into public.exercises; v_counts jsonb := '{}'::jsonb; v_tag_ids uuid[]; n bigint;
begin
  if not public.is_coach() then raise exception 'solo un coach puede fusionar ejercicios' using errcode = '42501'; end if;
  if p_from = p_into then raise exception 'no se puede fusionar un ejercicio consigo mismo' using errcode = 'P0001'; end if;
  select * into v_from from public.exercises where id = p_from for update;
  select * into v_into from public.exercises where id = p_into for update;
  if v_from.id is null or v_into.id is null then raise exception 'ejercicio inexistente' using errcode = 'P0002'; end if;
  if v_from.merged_into_id is not null then raise exception 'el ejercicio origen ya fue fusionado' using errcode = 'P0001'; end if;
  if v_into.merged_into_id is not null then raise exception 'el ejercicio destino es una lápida de otra fusión' using errcode = 'P0001'; end if;
  if v_into.archived_at is not null then raise exception 'el ejercicio destino está archivado; desarchivalo primero' using errcode = 'P0001'; end if;

  perform set_config('app.bulk_maintenance', 'on', true);

  select coalesce(array_agg(tag_id), '{}') into v_tag_ids from public.exercise_tag_assignments where exercise_id = p_from;
  insert into public.exercise_tag_assignments (exercise_id, tag_id)
    select p_into, tag_id from public.exercise_tag_assignments where exercise_id = p_from on conflict do nothing;
  delete from public.exercise_tag_assignments where exercise_id = p_from;
  v_counts := v_counts || jsonb_build_object('tags', coalesce(array_length(v_tag_ids, 1), 0));

  update public.plan_exercises set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('plan_exercises', n);
  update public.plan_exercises set rm_reference_exercise_id = p_into where rm_reference_exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('rm_references', n);
  update public.evaluation_tests set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('eval_tests', n);

  update public.workout_logs set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('workout_logs', n);
  -- v53
  update public.workout_block_logs set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('workout_block_logs', n);
  update public.evaluation_test_responses set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('eval_responses', n);
  update public.plan_exercise_prescription_history set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('prescription_history', n);
  update public.notes set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', n);

  update public.exercises set archived_at = now(), archived_by = auth.uid(), merged_into_id = p_into where id = p_from;
  insert into public.exercise_merges (from_exercise_id, into_exercise_id, merged_by, counts, from_snapshot, from_tag_ids)
  values (p_from, p_into, auth.uid(), v_counts, to_jsonb(v_from), v_tag_ids);
  return v_counts;
end;
$function$;

create or replace function public.exercise_usage(p_exercise_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'workout_logs',        (select count(*) from public.workout_logs where exercise_id = p_exercise_id),
    'workout_block_logs',  (select count(*) from public.workout_block_logs where exercise_id = p_exercise_id),
    'eval_responses',      (select count(*) from public.evaluation_test_responses where exercise_id = p_exercise_id),
    'eval_tests',          (select count(*) from public.evaluation_tests where exercise_id = p_exercise_id),
    'prescription_history',(select count(*) from public.plan_exercise_prescription_history where exercise_id = p_exercise_id),
    'plan_exercises',      (select count(*) from public.plan_exercises where exercise_id = p_exercise_id),
    'plans',               (select count(distinct plan_id) from public.plan_exercises where exercise_id = p_exercise_id),
    'notes',               (select count(*) from public.notes where exercise_id = p_exercise_id),
    'students',            (select count(distinct s) from (
                              select student_id as s from public.workout_logs where exercise_id = p_exercise_id
                              union
                              select student_id from public.workout_block_logs where exercise_id = p_exercise_id
                              union
                              select er.student_id from public.evaluation_test_responses r join public.evaluation_results er on er.id = r.evaluation_result_id where r.exercise_id = p_exercise_id) u));
$function$;
