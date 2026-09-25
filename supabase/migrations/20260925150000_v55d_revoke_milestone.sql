-- ============================================================
-- v55d — deshacer un hito cuando se desmarca (decisión Franco 2026-09-25)
-- ------------------------------------------------------------
-- "Si se desmarca, que la coach no reciba el aviso." Cuando una persona
-- (o la coach en modo coach) desmarca y el día / la semana / el plan dejan
-- de estar cumplidos, el front llama a revoke_milestone:
--   - borra la fila del hito (si se vuelve a completar, se otorga y se
--     avisa de nuevo, como la primera vez);
--   - day_complete: el aviso del día vuelve a ser "registró actividad"
--     (se había actualizado en el lugar, v55);
--   - week_complete / plan_complete: se borran sus avisos a la coach.
-- Solo esos tres tipos. Las marcas personales se borran solas con su log
-- (FK ON DELETE CASCADE) y la racha se recalcula siempre desde el
-- historial.
-- ============================================================
create or replace function public.revoke_milestone(
  p_student_id uuid,
  p_kind       text,
  p_period_key text
)
returns boolean
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_role     text := public.milestone_caller_role(p_student_id);
  v_row      public.student_milestones;
  v_name     text;
begin
  if v_role is null then
    raise exception 'sin permiso para modificar hitos de esta persona' using errcode = '42501';
  end if;
  if p_kind not in ('day_complete', 'week_complete', 'plan_complete') then
    raise exception 'tipo de hito no revocable: %', p_kind using errcode = '22023';
  end if;

  delete from public.student_milestones
   where student_id = p_student_id and kind = p_kind and period_key = p_period_key
  returning * into v_row;
  if v_row.id is null then
    return false;
  end if;

  if p_kind = 'day_complete' then
    select coalesce(nullif(trim(name), ''), email) into v_name
      from public.profiles where id = p_student_id;
    update public.notifications
       set type  = 'activity_update',
           title = v_name || ' registró actividad hoy',
           body  = 'Tiene registros del ' || to_char(p_period_key::date, 'DD/MM/YYYY') || ' para revisar.',
           data  = (data - 'completed') - 'milestone_id'
     where type = 'session_completed'
       and data->>'milestone_id' = v_row.id::text;
  else
    delete from public.notifications where data->>'milestone_id' = v_row.id::text;
  end if;

  return true;
end;
$$;

comment on function public.revoke_milestone(uuid, text, text) is
  'v55d: deshace un hito de día/semana/plan al desmarcar (borra la fila y corrige o borra el aviso a la coach).';

revoke execute on function public.revoke_milestone(uuid, text, text) from public, anon;
grant execute on function public.revoke_milestone(uuid, text, text) to authenticated, service_role;
