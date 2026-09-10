-- v47 — Los planes con hechos se archivan, no se borran (decisión D4 en
-- docs/decisiones-catalogo-y-borrado.md).
--
-- Borrar un plan fue la causa de 113 de los 191 registros huérfanos irrecuperables y
-- además se llevaba plan_assignments, que es la historia de qué plan tuvo cada alumna y
-- cuándo (la tabla de Progreso v42 la usa para las marcas de plan).
--
--   - plans.archived_at / archived_by: el plan sale del recetario y de los selectores de
--     plantilla; sigue existiendo para todo lo que lo referencia. Reversible.
--   - plan_assignments.plan_id pasa a ON DELETE RESTRICT: candado duro. Un plan con
--     asignaciones no se puede borrar, se archiva.
--   - plan_usage(id): cuántas filas lo referencian, por tabla, más lo que cuelga de sus
--     clones (las asignaciones y los registros viven en el clon, nunca en la plantilla).
--   - set_plan_archived(id, bool): archivar / desarchivar. Un plan con una asignación
--     ACTIVA no se archiva: primero se reemplaza o se cierra la asignación desde la ficha.

alter table public.plans
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_plans_archived_at
  on public.plans (archived_at) where archived_at is not null;

comment on column public.plans.archived_at is
  'Archivado (v47): no aparece en el recetario ni en los selectores de plantilla. Sigue existiendo para todo lo que lo referencia. Un plan con asignación activa no se archiva.';

-- Candado duro: la historia de asignaciones no se borra por arrastre.
alter table public.plan_assignments
  drop constraint if exists plan_assignments_plan_id_fkey;
alter table public.plan_assignments
  add constraint plan_assignments_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete restrict;

-- ============================================================================
-- Uso de un plan
-- ============================================================================

create or replace function public.plan_usage(p_plan_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with clones as (
    select id from public.plans where cloned_from_plan_id = p_plan_id
  ),
  base as (
    select
      (select is_template from public.plans where id = p_plan_id)                                   as is_template,
      (select count(*) from public.workout_logs        where plan_id = p_plan_id)                   as workout_logs,
      (select count(*) from public.workout_sessions    where plan_id = p_plan_id)                   as sessions,
      (select count(*) from public.workout_block_logs  where plan_id = p_plan_id)                   as block_logs,
      (select count(*) from public.evaluation_results  where plan_id = p_plan_id)                   as eval_results,
      (select count(*) from public.evaluation_test_responses r
         where r.test_id in (select id from public.evaluation_tests where plan_id = p_plan_id)
            or r.plan_exercise_id in (select id from public.plan_exercises where plan_id = p_plan_id)) as eval_responses,
      (select count(*) from public.plan_exercise_prescription_history where plan_id = p_plan_id)   as prescription_history,
      (select count(*) from public.plan_assignments    where plan_id = p_plan_id)                   as assignments,
      (select count(*) from public.plan_assignments    where plan_id = p_plan_id and active = true) as active_assignments,
      (select count(distinct student_id) from public.plan_assignments where plan_id = p_plan_id)   as students,
      (select count(*) from clones)                                                                 as clones,
      (select count(*) from public.plan_assignments where plan_id in (select id from clones) and active = true) as clone_active_assignments,
      (select count(distinct student_id) from public.plan_assignments where plan_id in (select id from clones)) as clone_students,
      (select count(*) from public.plans where parent_plan_id = p_plan_id)                          as child_evaluations
  )
  select to_jsonb(base) || jsonb_build_object(
    'total_refs',
      base.workout_logs + base.sessions + base.block_logs + base.eval_results + base.eval_responses
      + base.prescription_history + base.assignments + base.clones + base.child_evaluations)
  from base;
$function$;

grant execute on function public.plan_usage(uuid) to authenticated;

comment on function public.plan_usage(uuid) is
  'Cuántas filas referencian a un plan, por tabla, más lo que cuelga de sus clones (v47). total_refs = 0 → se puede eliminar; > 0 → se archiva. active_assignments > 0 → no se puede archivar.';

-- El trigger de "plan actualizado" sobre plans también respeta el modo mantenimiento
-- (v46 lo aplicó a bloques y casilleros; faltaba el del plan en sí).
create or replace function public.fn_notify_plan_updated_on_plans()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.bulk_maintenance_on() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    perform public.fn_notify_plan_updated_internal(new.id);
  end if;
  return new;
end;
$function$;

-- ============================================================================
-- Archivar / desarchivar
-- ============================================================================

create or replace function public.set_plan_archived(p_plan_id uuid, p_archived boolean)
returns public.plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row    public.plans;
  v_active int;
begin
  if not public.is_coach() then
    raise exception 'solo un coach puede archivar planes' using errcode = '42501';
  end if;

  select * into v_row from public.plans where id = p_plan_id;
  if v_row.id is null then
    raise exception 'plan inexistente' using errcode = 'P0002';
  end if;

  if p_archived then
    select count(*) into v_active
      from public.plan_assignments
     where plan_id = p_plan_id and active = true;
    if v_active > 0 then
      raise exception 'el plan tiene % asignación(es) activa(s); reemplazala o cerrala desde la ficha antes de archivar', v_active
        using errcode = 'P0001';
    end if;
  end if;

  -- Archivar no es una edición del plan: sin "tu coach actualizó tu plan" ni updated_at.
  perform set_config('app.bulk_maintenance', 'on', true);

  update public.plans
     set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
         archived_by = case when p_archived then coalesce(archived_by, auth.uid()) else null end
   where id = p_plan_id
   returning * into v_row;

  return v_row;
end;
$function$;

grant execute on function public.set_plan_archived(uuid, boolean) to authenticated;
