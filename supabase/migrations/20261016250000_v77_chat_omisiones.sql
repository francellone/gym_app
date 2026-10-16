-- ============================================================
-- v77 — Todas las omisiones aparecen en el chat (Franco, 2026-10-16)
-- ------------------------------------------------------------
-- Antes solo "no sabía cómo hacerlo" (exercise_unclear) llegaba al chat; el
-- motivo y la nota de las demás omisiones no se veían en ningún lado.
-- - Nuevo kind 'exercise_skipped' (tiempo, elección, molestia, otro), con
--   reason + skip_note en el payload. 'exercise_unclear' sigue igual.
-- - Suman al número de la coach solo las que piden respuesta: con nota,
--   por molestia o por "no sabía". La persona las ve siempre como leídas.
-- - Si la persona cambia el motivo, el evento se actualiza (y cambia de kind).
-- - chat_events.reply_dismissed_at + RPC chat_dismiss_event: "Listo, no hace
--   falta responder" también para eventos.
-- - Historia: las omisiones anteriores se cargan como leídas.
-- La omisión que carga la coach por la persona no genera evento (ya lo sabe).
-- ============================================================

alter table public.chat_events drop constraint if exists chat_events_kind_check;
alter table public.chat_events add constraint chat_events_kind_check
  check (kind in ('day_complete','week_complete','plan_complete','personal_best','exercise_unclear','exercise_skipped'));

alter table public.chat_events drop constraint if exists chat_events_check;
alter table public.chat_events add constraint chat_events_check check (
  (kind in ('exercise_unclear','exercise_skipped') and (workout_log_id is not null or workout_block_log_id is not null))
  or (kind not in ('exercise_unclear','exercise_skipped') and milestone_id is not null)
);

alter table public.chat_events
  add column if not exists reply_dismissed_at timestamptz,
  add column if not exists reply_dismissed_by uuid references public.profiles(id) on delete set null;

-- ¿Pide respuesta de la coach?
create or replace function public._skip_needs_reply(p_reason text, p_note text)
returns boolean language sql immutable as $$
  select coalesce(p_reason, '') in ('unclear', 'discomfort') or nullif(btrim(coalesce(p_note, '')), '') is not null
$$;

create or replace function public.fn_chat_event_skip_unclear()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_is_skip  boolean := new.status = 'skipped';
  v_was_skip boolean := tg_op = 'UPDATE' and old.status = 'skipped';
  v_kind     text := case when new.skip_reason = 'unclear' then 'exercise_unclear' else 'exercise_skipped' end;
  v_thread   uuid;
  v_name     text;
  v_exercise uuid;
  v_payload  jsonb;
  v_needs    boolean := public._skip_needs_reply(new.skip_reason, new.skip_note);
begin
  -- Dejó de ser omisión: se va el evento
  if not v_is_skip then
    if v_was_skip then
      if tg_table_name = 'workout_logs' then
        delete from public.chat_events where workout_log_id = new.id;
      else
        delete from public.chat_events where workout_block_log_id = new.id;
      end if;
    end if;
    return new;
  end if;
  if new.source = 'coach' then return new; end if;

  v_thread := public._chat_thread_for(new.student_id);
  if v_thread is null then return new; end if;

  if tg_table_name = 'workout_logs' then
    select e.name, e.id into v_name, v_exercise
      from public.plan_exercises pe join public.exercises e on e.id = pe.exercise_id
     where pe.id = new.plan_exercise_id;
    v_payload := jsonb_build_object('item_kind','exercise','item_name', v_name, 'date', new.logged_date,
                                    'reason', new.skip_reason, 'skip_note', new.skip_note,
                                    'plan_id', new.plan_id, 'plan_exercise_id', new.plan_exercise_id);
  else
    select coalesce(nullif(pb.title, ''), new.block_title) into v_name
      from public.plan_blocks pb where pb.id = new.plan_block_id;
    v_exercise := new.exercise_id;
    v_payload := jsonb_build_object('item_kind','block','item_name', coalesce(v_name, new.block_title), 'date', new.logged_date,
                                    'reason', new.skip_reason, 'skip_note', new.skip_note,
                                    'plan_id', new.plan_id, 'plan_block_id', new.plan_block_id);
  end if;

  if v_was_skip then
    -- Cambió el motivo o la nota: actualizar en el lugar
    update public.chat_events
       set kind = v_kind,
           payload = v_payload,
           read_at_coach = case
             when v_needs and not public._skip_needs_reply(old.skip_reason, old.skip_note) then null
             else read_at_coach end
     where (tg_table_name = 'workout_logs' and workout_log_id = new.id)
        or (tg_table_name <> 'workout_logs' and workout_block_log_id = new.id);
    if found then return new; end if;
  end if;

  if tg_table_name = 'workout_logs' then
    insert into public.chat_events (thread_id, student_id, kind, workout_log_id, exercise_id, payload, occurred_at, read_at_coach, read_at_student)
    values (v_thread, new.student_id, v_kind, new.id, v_exercise, v_payload, now(),
            case when v_needs then null else now() end, now())
    on conflict do nothing;
  else
    insert into public.chat_events (thread_id, student_id, kind, workout_block_log_id, exercise_id, payload, occurred_at, read_at_coach, read_at_student)
    values (v_thread, new.student_id, v_kind, new.id, v_exercise, v_payload, now(),
            case when v_needs then null else now() end, now())
    on conflict do nothing;
  end if;
  return new;
end;
$function$;

-- El contador también sube si un evento vuelve a "no leído" (cambio de motivo)
create or replace function public.chat_events_bump_thread()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    update public.note_threads
       set last_message_at    = greatest(coalesce(last_message_at, new.occurred_at), new.occurred_at),
           updated_at         = now(),
           unread_for_coach   = unread_for_coach   + case when new.read_at_coach   is null then 1 else 0 end,
           unread_for_student = unread_for_student + case when new.read_at_student is null then 1 else 0 end
     where id = new.thread_id;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.note_threads
       set unread_for_coach = greatest(unread_for_coach
             + case when old.read_at_coach is not null and new.read_at_coach is null then 1
                    when old.read_at_coach is null and new.read_at_coach is not null then -1 else 0 end, 0),
           unread_for_student = greatest(unread_for_student
             + case when old.read_at_student is not null and new.read_at_student is null then 1
                    when old.read_at_student is null and new.read_at_student is not null then -1 else 0 end, 0),
           updated_at = now()
     where id = new.thread_id
       and (old.read_at_coach is distinct from new.read_at_coach or old.read_at_student is distinct from new.read_at_student);
    return new;
  else
    update public.note_threads
       set unread_for_coach   = greatest(unread_for_coach   - case when old.read_at_coach   is null then 1 else 0 end, 0),
           unread_for_student = greatest(unread_for_student - case when old.read_at_student is null then 1 else 0 end, 0),
           updated_at = now()
     where id = old.thread_id;
    return old;
  end if;
end;
$function$;

-- "Listo, no hace falta responder" para eventos
create or replace function public.chat_dismiss_event(p_event_id uuid, p_dismiss boolean default true)
returns void
language plpgsql security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.chat_events e join public.note_threads nt on nt.id = e.thread_id
     where e.id = p_event_id and nt.coach_id = auth.uid() and public.is_coach_of(nt.student_id)
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.chat_events
     set reply_dismissed_at = case when p_dismiss then now() else null end,
         reply_dismissed_by = case when p_dismiss then auth.uid() else null end,
         read_at_coach = coalesce(read_at_coach, now())
   where id = p_event_id;
end;
$function$;
revoke all on function public.chat_dismiss_event(uuid, boolean) from public, anon;
grant execute on function public.chat_dismiss_event(uuid, boolean) to authenticated;

-- Historia: omisiones anteriores (no "no sabía", que ya estaban) como leídas
insert into public.chat_events (thread_id, student_id, kind, workout_log_id, exercise_id, payload, occurred_at, read_at_coach, read_at_student)
select t.thread_id, wl.student_id, 'exercise_skipped', wl.id, e.id,
       jsonb_build_object('item_kind','exercise','item_name', e.name, 'date', wl.logged_date,
                          'reason', wl.skip_reason, 'skip_note', wl.skip_note,
                          'plan_id', wl.plan_id, 'plan_exercise_id', wl.plan_exercise_id),
       wl.updated_at, wl.updated_at, wl.updated_at
  from public.workout_logs wl
  join public.profiles p on p.id = wl.student_id and p.coach_id is not null and p.coach_id <> wl.student_id
  left join public.plan_exercises pe on pe.id = wl.plan_exercise_id
  left join public.exercises e on e.id = pe.exercise_id
  cross join lateral (select public._note_thread_for(wl.student_id, false) as thread_id) t
 where wl.status = 'skipped' and coalesce(wl.skip_reason, '') <> 'unclear' and coalesce(wl.source, '') <> 'coach'
on conflict do nothing;

insert into public.chat_events (thread_id, student_id, kind, workout_block_log_id, exercise_id, payload, occurred_at, read_at_coach, read_at_student)
select t.thread_id, b.student_id, 'exercise_skipped', b.id, b.exercise_id,
       jsonb_build_object('item_kind','block','item_name', coalesce(nullif(pb.title,''), b.block_title), 'date', b.logged_date,
                          'reason', b.skip_reason, 'skip_note', b.skip_note,
                          'plan_id', b.plan_id, 'plan_block_id', b.plan_block_id),
       b.updated_at, b.updated_at, b.updated_at
  from public.workout_block_logs b
  join public.profiles p on p.id = b.student_id and p.coach_id is not null and p.coach_id <> b.student_id
  left join public.plan_blocks pb on pb.id = b.plan_block_id
  cross join lateral (select public._note_thread_for(b.student_id, false) as thread_id) t
 where b.status = 'skipped' and coalesce(b.skip_reason, '') <> 'unclear' and coalesce(b.source, '') <> 'coach'
on conflict do nothing;

-- Los "no sabía" ya cargados: sumarles el motivo al payload
update public.chat_events set payload = payload || jsonb_build_object('reason', 'unclear')
 where kind = 'exercise_unclear' and not (payload ? 'reason');
