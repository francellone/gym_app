-- ============================================================
-- v79 — La nota del bienestar llega al chat (Franco, 2026-10-24)
-- ------------------------------------------------------------
-- La persona escribe una nota en el bienestar diario y hoy la coach solo la
-- ve si entra a esa pestaña. Ahora aparece en el chat como evento
-- 'wellbeing_note' (texto en el front por kind+payload), atado a su registro
-- (chat_events.wellbeing_log_id, CASCADE: si se borra el registro, se va).
-- - Entra NO leída para la coach (es algo que escribió la persona).
-- - Si la persona cambia la nota, se actualiza y vuelve a no leída; si la
--   borra, se va el evento.
-- - La que carga la coach por la persona no genera evento (ya la sabe).
-- - La coach la responde como cualquier evento (nota context_type chat_event).
-- - Historia: las notas que ya existían se cargan como leídas.
-- ============================================================

alter table public.chat_events
  add column if not exists wellbeing_log_id uuid references public.wellbeing_logs(id) on delete cascade;
create unique index if not exists chat_events_wellbeing_uq on public.chat_events(wellbeing_log_id) where wellbeing_log_id is not null;
comment on column public.chat_events.wellbeing_log_id is 'v79: registro de bienestar cuya nota se muestra en el chat (kind=wellbeing_note).';

alter table public.chat_events drop constraint if exists chat_events_kind_check;
alter table public.chat_events add constraint chat_events_kind_check
  check (kind in ('day_complete','week_complete','plan_complete','personal_best','exercise_unclear','exercise_skipped','wellbeing_note'));

alter table public.chat_events drop constraint if exists chat_events_check;
alter table public.chat_events add constraint chat_events_check check (
  (kind in ('exercise_unclear','exercise_skipped') and (workout_log_id is not null or workout_block_log_id is not null))
  or (kind = 'wellbeing_note' and wellbeing_log_id is not null)
  or (kind not in ('exercise_unclear','exercise_skipped','wellbeing_note') and milestone_id is not null)
);

create or replace function public._wellbeing_payload(w public.wellbeing_logs)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'note', btrim(w.notes), 'date', w.date,
    'sleep_quality', w.sleep_quality, 'energy_level', w.energy_level,
    'nutrition_quality', w.nutrition_quality, 'hydration_quality', w.hydration_quality,
    'stress_level', w.stress_level, 'muscle_fatigue', w.muscle_fatigue)
$$;

create or replace function public.fn_chat_event_wellbeing()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_note   text := nullif(btrim(coalesce(new.notes, '')), '');
  v_thread uuid;
begin
  if v_note is null then
    delete from public.chat_events where wellbeing_log_id = new.id;
    return new;
  end if;
  if coalesce(new.source, '') = 'coach' then return new; end if;

  update public.chat_events
     set payload = public._wellbeing_payload(new),
         read_at_coach = case
           when tg_op = 'UPDATE' and nullif(btrim(coalesce(old.notes, '')), '') is distinct from v_note then null
           else read_at_coach end,
         reply_dismissed_at = case
           when tg_op = 'UPDATE' and nullif(btrim(coalesce(old.notes, '')), '') is distinct from v_note then null
           else reply_dismissed_at end
   where wellbeing_log_id = new.id;
  if found then return new; end if;

  v_thread := public._chat_thread_for(new.user_id);
  if v_thread is null then return new; end if;

  insert into public.chat_events (thread_id, student_id, kind, wellbeing_log_id, payload, occurred_at, read_at_coach, read_at_student)
  values (v_thread, new.user_id, 'wellbeing_note', new.id, public._wellbeing_payload(new), now(), null, now())
  on conflict do nothing;
  return new;
end;
$function$;

drop trigger if exists trg_chat_event_wellbeing on public.wellbeing_logs;
create trigger trg_chat_event_wellbeing
  after insert or update of notes on public.wellbeing_logs
  for each row execute function public.fn_chat_event_wellbeing();

-- Historia: las notas que ya existían, como leídas (no suman al número).
insert into public.chat_events (thread_id, student_id, kind, wellbeing_log_id, payload, occurred_at, read_at_coach, read_at_student)
select public._chat_thread_for(w.user_id), w.user_id, 'wellbeing_note', w.id, public._wellbeing_payload(w),
       coalesce(w.created_at, w.date::timestamptz), now(), now()
  from public.wellbeing_logs w
 where nullif(btrim(coalesce(w.notes, '')), '') is not null
   and coalesce(w.source, '') <> 'coach'
   and public._chat_thread_for(w.user_id) is not null
on conflict do nothing;
