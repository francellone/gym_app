-- ============================================================
-- v50b · Endurecimiento de la tanda v48-v50 (revisión general)
-- ------------------------------------------------------------
-- 1. search_path fijo en los dos triggers nuevos (advisor
--    function_search_path_mutable).
-- 2. "Volver a la fecha calculada" también recalcula sobre una fila
--    'backfill'. Antes la rama solo contemplaba 'manual', así que
--    confirmar una fecha estimada la dejaba etiquetada 'derived' con la
--    fecha vieja intacta: perdía el "(est.)" sin recalcular nada.
-- 3. Se revoca EXECUTE público sobre las dos funciones nuevas.
--    `fn_notify_expiring_plans` quedaba expuesta como RPC a `anon`, y
--    con p_notify_student = true generaba una notificación para CADA
--    alumna. El cron corre como postgres y no se ve afectado.
--    (Quedan ~58 funciones con la misma exposición de antes: es una
--    auditoría aparte, no la abre esta tanda.)
-- 4. Se borra el pago backfilleado de un perfil de PRUEBA sin coach,
--    que la v49 le había atribuido al primer coach de la tabla.
--    Los tests no dejan rastro.
-- ============================================================

create or replace function public.plan_assignments_sync_closed_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.closed_at := coalesce(new.closed_at, new.end_date);
    new.end_date  := new.closed_at;
    return new;
  end if;
  if new.closed_at is distinct from old.closed_at then
    new.end_date := new.closed_at;
  elsif new.end_date is distinct from old.end_date then
    new.closed_at := new.end_date;
  end if;
  return new;
end;
$$;

create or replace function public.plan_assignments_sync_expected_end()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_weeks   integer;
  v_derived date;
begin
  if coalesce(current_setting('app.bulk_maintenance', true), '') = 'on' then
    return new;
  end if;

  select p.duration_weeks into v_weeks from public.plans p where p.id = new.plan_id;

  if new.start_date is not null and v_weeks is not null and v_weeks > 0 then
    v_derived := new.start_date + (v_weeks * 7 - 1);
  else
    v_derived := null;
  end if;

  if tg_op = 'INSERT' then
    if new.expected_end_date is not null and new.expected_end_date is distinct from v_derived then
      new.expected_end_source := 'manual';
    else
      new.expected_end_date   := v_derived;
      new.expected_end_source := 'derived';
    end if;
    return new;
  end if;

  -- "Volver a la fecha calculada" / confirmar una estimada.
  if new.expected_end_source = 'derived'
     and old.expected_end_source in ('manual', 'backfill')
     and new.expected_end_date is not distinct from old.expected_end_date then
    new.expected_end_date := v_derived;
    return new;
  end if;

  if new.expected_end_date is distinct from old.expected_end_date then
    new.expected_end_source := case
      when new.expected_end_date is not distinct from v_derived then 'derived'
      else 'manual'
    end;
    return new;
  end if;

  if new.expected_end_source <> 'manual'
     and (new.start_date is distinct from old.start_date
          or new.plan_id is distinct from old.plan_id) then
    new.expected_end_date   := v_derived;
    new.expected_end_source := 'derived';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_notify_expiring_plans(boolean) from public, anon, authenticated;
revoke all on function public.payments_sync_profile() from public, anon, authenticated;

delete from public.payments p
 where p.source = 'backfill'
   and exists (
     select 1 from public.profiles s
      where s.id = p.student_id
        and (coalesce(s.is_test, false) = true or s.coach_id is null)
   );
