-- ============================================================
-- v78 — Comentarios atados al día entrenado y a los eventos del chat
-- (pedido de Franco, 2026-10-23: "así como en un ejercicio queda atado el
-- comentario, también debería ser para las demás")
-- ------------------------------------------------------------
-- 1) notes.workout_session_id y notes.chat_event_id: claves propias (regla de
--    Franco), SET NULL si se borra la sesión o el evento.
-- 2) El CHECK de context_type suma 'session_day' y 'chat_event' (se arma
--    desde el que existe, sin perder ningún valor).
-- 3) notes_resolve_context deriva esas claves (y la fecha, el plan, el
--    ejercicio y el registro del evento cuando los tiene).
-- 4) Relleno: las observaciones del día que hoy son mensajes sueltos
--    "[Día A] …" pasan a estar atadas a su sesión, solo si hay UNA sesión de
--    esa persona ese día. Queda constancia en backup_v78_dia. El texto no se
--    toca; el front ya no muestra el prefijo.
-- ============================================================

-- ── 1) Claves ────────────────────────────────────────────────
alter table public.notes
  add column if not exists workout_session_id uuid references public.workout_sessions(id) on delete set null,
  add column if not exists chat_event_id      uuid references public.chat_events(id) on delete set null;

create index if not exists notes_workout_session_id_idx on public.notes(workout_session_id) where workout_session_id is not null;
create index if not exists notes_chat_event_id_idx      on public.notes(chat_event_id) where chat_event_id is not null;

comment on column public.notes.workout_session_id is 'v78: día entrenado comentado (context_type=session_day). SET NULL si se borra la sesión.';
comment on column public.notes.chat_event_id      is 'v78: evento del chat respondido (context_type=chat_event). SET NULL si se borra el evento.';

-- ── 2) Tipos de contexto permitidos ──────────────────────────
do $$
declare v_def text; v_vals text[];
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.notes'::regclass and conname = 'notes_context_type_check';
  if v_def is null then
    return; -- sin CHECK: no hay nada que ampliar
  end if;
  select array_agg(m[1]) into v_vals from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  v_vals := array(select distinct x from unnest(v_vals || array['session_day', 'chat_event']) x order by 1);
  alter table public.notes drop constraint notes_context_type_check;
  execute format(
    'alter table public.notes add constraint notes_context_type_check check (context_type = any (%L::text[]))',
    v_vals
  );
end $$;

-- ── 3) Resolver de contexto ──────────────────────────────────
create or replace function public.notes_resolve_context()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_exercise_id  uuid;
  v_muscle_group text;
  v_block_type   text;
  v_note_date    date;
  v_plan_id      uuid;
  v_pe_id        uuid;
  v_log_id       uuid;
  v_section      text;
  v_session_id   uuid;
  v_event_id     uuid;
begin
  -- Claves derivadas: siempre las calcula la base (lo que mande el cliente se pisa)
  new.workout_log_id := null;
  new.workout_block_log_id := null;
  new.workout_session_id := null;
  new.chat_event_id := null;

  if new.context_type = 'free' then
    new.exercise_id := null;
    new.block_type  := null;
    new.plan_id := null; new.plan_exercise_id := null; new.plan_section := null;
    return new;

  elsif new.context_type = 'workout_log' then
    select wl.id, pe.exercise_id, pb.block_type, wl.logged_date, wl.plan_id, wl.plan_exercise_id
      into v_log_id, v_exercise_id, v_block_type, v_note_date, v_plan_id, v_pe_id
      from public.workout_logs wl
      left join public.plan_exercises pe on pe.id = wl.plan_exercise_id
      left join public.plan_blocks pb on pb.id = pe.block_id
     where wl.id = new.context_id;
    new.workout_log_id := v_log_id;
    new.plan_id := v_plan_id; new.plan_exercise_id := v_pe_id; new.plan_section := null;

  elsif new.context_type = 'workout_block_log' then
    select wbl.id, pb.block_type, wbl.logged_date, wbl.plan_id
      into v_log_id, v_block_type, v_note_date, v_plan_id
      from public.workout_block_logs wbl
      left join public.plan_blocks pb on pb.id = wbl.plan_block_id
     where wbl.id = new.context_id;
    new.workout_block_log_id := v_log_id;
    new.plan_id := v_plan_id; new.plan_exercise_id := null; new.plan_section := null;

  elsif new.context_type = 'plan_exercise' then
    select pe.exercise_id, pb.block_type, pe.plan_id into v_exercise_id, v_block_type, v_plan_id
      from public.plan_exercises pe
      left join public.plan_blocks pb on pb.id = pe.block_id
     where pe.id = new.context_id;
    new.plan_exercise_id := new.context_id;
    new.plan_id := v_plan_id; new.plan_section := null;

  elsif new.context_type = 'plan' then
    new.plan_id := new.context_id;
    new.plan_exercise_id := null;
    -- plan_section lo manda el cliente (chat_link_note)

  elsif new.context_type = 'evaluation_test' then
    select et.exercise_id into v_exercise_id
      from public.evaluation_test_responses etr
      join public.evaluation_tests et on et.id = etr.test_id
     where etr.id = new.context_id;
    new.plan_id := null; new.plan_exercise_id := null; new.plan_section := null;

  elsif new.context_type = 'evaluation_result' then
    select eval_date into v_note_date from public.evaluation_results where id = new.context_id;
    new.plan_id := null; new.plan_exercise_id := null; new.plan_section := null;

  elsif new.context_type = 'session_day' then
    -- v78: el día entrenado (observación al cerrar el día). El día del plan
    -- (plan_section) lo manda el cliente.
    select ws.id, ws.plan_id, ws.logged_date into v_session_id, v_plan_id, v_note_date
      from public.workout_sessions ws
     where ws.id = new.context_id;
    new.workout_session_id := v_session_id;
    new.plan_id := v_plan_id; new.plan_exercise_id := null;

  elsif new.context_type = 'chat_event' then
    -- v78: respuesta a un evento del chat (semana completa, mejor marca, día).
    select ce.id, ce.exercise_id, (ce.occurred_at at time zone 'America/Argentina/Cordoba')::date, ce.workout_log_id
      into v_event_id, v_exercise_id, v_note_date, v_log_id
      from public.chat_events ce
     where ce.id = new.context_id;
    new.chat_event_id := v_event_id;
    new.workout_log_id := v_log_id;
    new.plan_id := null; new.plan_exercise_id := null; new.plan_section := null;

  elsif new.context_type = 'exercise' then
    v_exercise_id := new.context_id;
    new.plan_id := null; new.plan_exercise_id := null; new.plan_section := null;

  else
    new.plan_id := null; new.plan_exercise_id := null; new.plan_section := null;
  end if;

  if v_exercise_id is not null then
    select e.muscle_group into v_muscle_group from public.exercises e where e.id = v_exercise_id;
  end if;

  new.exercise_id  := v_exercise_id;
  new.muscle_group := v_muscle_group;
  new.block_type   := v_block_type;
  new.note_date    := v_note_date;
  return new;
end;
$function$;

-- ── 4) Relleno de las observaciones del día ──────────────────
create table if not exists public.backup_v78_dia (
  note_id      uuid primary key references public.notes(id) on delete cascade,
  old_context  text not null,
  session_id   uuid not null references public.workout_sessions(id) on delete cascade,
  section      text,
  done_at      timestamptz not null default now()
);
alter table public.backup_v78_dia enable row level security;
revoke all on public.backup_v78_dia from anon, authenticated;

select set_config('app.bulk_maintenance', 'on', true);

with cand as (
  select n.id as note_id,
         n.context_type as old_context,
         (select ws.id from public.workout_sessions ws
           where ws.student_id = nt.student_id and ws.logged_date = n.note_date
           limit 1) as session_id,
         (select count(*) from public.workout_sessions ws
           where ws.student_id = nt.student_id and ws.logged_date = n.note_date) as n_sessions,
         case when n.body ~ '^\[(Día|Day) [A-Za-z]\]'
              then 'day_' || lower(substring(n.body from '^\[(?:Día|Day) ([A-Za-z])\]'))
         end as section
    from public.notes n
    join public.note_threads nt on nt.id = n.thread_id
   where n.deleted_at is null
     and n.context_type = 'free'
     and n.source_note_id is null
     and n.parent_note_id is null
     and n.note_date is not null
     and n.body ~ '^\[[^]]+\] '
),
ok as (
  insert into public.backup_v78_dia (note_id, old_context, session_id, section)
  select note_id, old_context, session_id, section from cand
   where n_sessions = 1
  on conflict (note_id) do nothing
  returning note_id, session_id, section
)
update public.notes n
   set context_type = 'session_day', context_id = ok.session_id, plan_section = ok.section,
       workout_session_id = ok.session_id,
       plan_id = (select ws.plan_id from public.workout_sessions ws where ws.id = ok.session_id)
  from ok
 where n.id = ok.note_id;

select set_config('app.bulk_maintenance', 'off', true);
