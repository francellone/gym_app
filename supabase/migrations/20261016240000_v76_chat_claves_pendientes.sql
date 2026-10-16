-- ============================================================
-- v76 — Chat: claves propias de los comentarios, pendientes y avisos
-- (2026-10-16, después de dos revisiones de especialistas)
-- ------------------------------------------------------------
-- 1) notes.plan_id / plan_exercise_id pasan a ON DELETE SET NULL (en v75
--    eran CASCADE: sacar un ejercicio del plan borraba sus comentarios).
-- 2) Claves propias para los comentarios de registros: workout_log_id y
--    workout_block_log_id (SET NULL: desmarcar un registro NO borra la
--    conversación). El resolvedor de contexto las deriva siempre y limpia
--    lo que no corresponde a cada tipo de contexto.
-- 3) Relleno de las claves en las notas existentes (no dispara triggers:
--    ninguno escucha estas columnas; updated_at no cambia).
-- 4) Reenganche CONTROLADO de comentarios colgados (su registro se borró al
--    desmarcar y se volvió a marcar): solo si hay UN único registro de la
--    misma persona, mismo ejercicio y mismo día. Queda constancia en
--    backup_v76_reenganche. Desde ahora lo hace solo un trigger al marcar.
-- 5) Respuestas a un solo nivel (responder a una respuesta cuelga del original).
-- 6) "Listo, no hace falta responder": notes.reply_dismissed_at/_by + RPC.
-- 7) Los eventos entran leídos para la coach salvo "no sabía cómo hacerlo";
--    recálculo único de los contadores de no leídos.
-- ============================================================

-- ── 1) FKs del plan a SET NULL ───────────────────────────────
alter table public.notes drop constraint if exists notes_plan_id_fkey;
alter table public.notes add constraint notes_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete set null;
alter table public.notes drop constraint if exists notes_plan_exercise_id_fkey;
alter table public.notes add constraint notes_plan_exercise_id_fkey
  foreign key (plan_exercise_id) references public.plan_exercises(id) on delete set null;

-- ── 2) Claves de registro + "listo sin responder" ────────────
alter table public.notes
  add column if not exists workout_log_id       uuid references public.workout_logs(id) on delete set null,
  add column if not exists workout_block_log_id uuid references public.workout_block_logs(id) on delete set null,
  add column if not exists reply_dismissed_at   timestamptz,
  add column if not exists reply_dismissed_by   uuid references public.profiles(id) on delete set null;

create index if not exists notes_workout_log_id_idx       on public.notes(workout_log_id) where workout_log_id is not null;
create index if not exists notes_workout_block_log_id_idx on public.notes(workout_block_log_id) where workout_block_log_id is not null;

comment on column public.notes.workout_log_id is 'v76: registro comentado (derivado de context_id por trigger). SET NULL si se borra el registro.';
comment on column public.notes.reply_dismissed_at is 'v76: la coach marcó "Listo, no hace falta responder".';

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
begin
  -- Claves derivadas: siempre las calcula la base (lo que mande el cliente se pisa)
  new.workout_log_id := null;
  new.workout_block_log_id := null;

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

-- ── 3) Relleno de claves (sin tocar context_id ni updated_at) ─
update public.notes n
   set workout_log_id = w.id, plan_id = w.plan_id, plan_exercise_id = w.plan_exercise_id
  from public.workout_logs w
 where n.context_type = 'workout_log' and w.id = n.context_id;

update public.notes n
   set workout_block_log_id = b.id, plan_id = b.plan_id
  from public.workout_block_logs b
 where n.context_type = 'workout_block_log' and b.id = n.context_id;

-- ── 4) Reenganche controlado de comentarios colgados ─────────
create table if not exists public.backup_v76_reenganche (
  note_id        uuid primary key references public.notes(id) on delete cascade,
  old_context_id uuid not null,
  new_log_id     uuid not null references public.workout_logs(id) on delete cascade,
  done_at        timestamptz not null default now()
);
alter table public.backup_v76_reenganche enable row level security;
revoke all on public.backup_v76_reenganche from anon, authenticated;

-- Candidatos: misma persona, mismo ejercicio, mismo día; solo si hay UNO.
create or replace function public._orphan_log_note_matches()
returns table(note_id uuid, old_context_id uuid, new_log_id uuid, candidates int)
language sql stable security definer
set search_path to 'public'
as $$
  select n.id, n.context_id,
         (array_agg(w.id))[1],
         count(w.id)::int
    from public.notes n
    join public.note_threads nt on nt.id = n.thread_id
    left join lateral (
      select w.id
        from public.workout_logs w
        join public.plan_exercises pe on pe.id = w.plan_exercise_id
       where w.student_id = nt.student_id
         and pe.exercise_id = n.exercise_id
         and w.logged_date = n.note_date
    ) w on true
   where n.deleted_at is null
     and n.context_type = 'workout_log'
     and n.exercise_id is not null
     and n.note_date is not null
     and not exists (select 1 from public.workout_logs x where x.id = n.context_id)
   group by n.id, n.context_id
$$;
revoke all on function public._orphan_log_note_matches() from public, anon, authenticated;

do $$
begin
  perform set_config('app.bulk_maintenance', 'on', true);
  insert into public.backup_v76_reenganche (note_id, old_context_id, new_log_id)
  select note_id, old_context_id, new_log_id
    from public._orphan_log_note_matches()
   where candidates = 1
  on conflict do nothing;
  update public.notes n
     set context_id = b.new_log_id
    from public.backup_v76_reenganche b
   where b.note_id = n.id and n.context_id = b.old_context_id;
  perform set_config('app.bulk_maintenance', 'off', true);
end $$;

-- Desde ahora: al marcar un registro, re-enganchar los comentarios que
-- quedaron colgados al desmarcar el mismo ejercicio el mismo día.
create or replace function public.fn_reattach_log_notes()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_exercise uuid;
  v_same int;
begin
  select exercise_id into v_exercise from public.plan_exercises where id = new.plan_exercise_id;
  if v_exercise is null then return new; end if;
  -- Solo si este es el ÚNICO registro de ese ejercicio ese día (si no, ambiguo)
  select count(*) into v_same
    from public.workout_logs w join public.plan_exercises pe on pe.id = w.plan_exercise_id
   where w.student_id = new.student_id and w.logged_date = new.logged_date and pe.exercise_id = v_exercise;
  if v_same <> 1 then return new; end if;

  perform set_config('app.bulk_maintenance', 'on', true);
  update public.notes n
     set context_id = new.id
    from public.note_threads nt
   where nt.id = n.thread_id
     and nt.student_id = new.student_id
     and n.deleted_at is null
     and n.context_type = 'workout_log'
     and n.workout_log_id is null
     and n.exercise_id = v_exercise
     and n.note_date = new.logged_date
     and not exists (select 1 from public.workout_logs x where x.id = n.context_id);
  perform set_config('app.bulk_maintenance', 'off', true);
  return new;
end;
$function$;

drop trigger if exists trg_reattach_log_notes on public.workout_logs;
create trigger trg_reattach_log_notes
  after insert on public.workout_logs
  for each row execute function public.fn_reattach_log_notes();

-- ── 5) Respuestas a un solo nivel ────────────────────────────
create or replace function public.notes_flatten_parent()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare v_gp uuid;
begin
  if new.parent_note_id is not null then
    select parent_note_id into v_gp from public.notes where id = new.parent_note_id;
    if v_gp is not null then new.parent_note_id := v_gp; end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notes_flatten_parent on public.notes;
create trigger trg_notes_flatten_parent
  before insert or update of parent_note_id on public.notes
  for each row execute function public.notes_flatten_parent();

do $$
begin
  perform set_config('app.bulk_maintenance', 'on', true);
  update public.notes c
     set parent_note_id = p.parent_note_id
    from public.notes p
   where c.parent_note_id = p.id and p.parent_note_id is not null;
  perform set_config('app.bulk_maintenance', 'off', true);
end $$;

-- ── 6) "Listo, no hace falta responder" ──────────────────────
create or replace function public.chat_dismiss_reply(p_note_id uuid, p_dismiss boolean default true)
returns void
language plpgsql security definer
set search_path to 'public'
as $function$
declare v_note public.notes;
begin
  select * into v_note from public.notes where id = p_note_id;
  if v_note.id is null then raise exception 'El mensaje no existe' using errcode = 'P0002'; end if;
  if v_note.author_role <> 'student' or not exists (
    select 1 from public.note_threads nt
     where nt.id = v_note.thread_id and nt.coach_id = auth.uid() and public.is_coach_of(nt.student_id)
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.notes
     set reply_dismissed_at = case when p_dismiss then now() else null end,
         reply_dismissed_by = case when p_dismiss then auth.uid() else null end
   where id = p_note_id;
end;
$function$;
revoke all on function public.chat_dismiss_reply(uuid, boolean) from public, anon;
grant execute on function public.chat_dismiss_reply(uuid, boolean) to authenticated;

-- ── 7) Eventos: leídos para la coach salvo "no sabía cómo" ───
create or replace function public.fn_chat_event_from_milestone()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_thread  uuid;
  v_payload jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.voided_at is distinct from new.voided_at then
      update public.chat_events
         set payload = payload || jsonb_build_object('voided', new.voided_at is not null, 'void_reason', new.void_reason)
       where milestone_id = new.id;
    end if;
    return new;
  end if;
  if new.kind not in ('day_complete','week_complete','plan_complete','personal_best') then
    return new;
  end if;
  v_thread := public._chat_thread_for(new.student_id);
  if v_thread is null then return new; end if;
  v_payload := coalesce(new.payload, '{}'::jsonb) || jsonb_build_object('period_key', new.period_key);
  if new.kind = 'week_complete' then
    v_payload := v_payload || jsonb_build_object('variant', floor(random() * 6)::int);
  end if;
  insert into public.chat_events (
    thread_id, student_id, kind, milestone_id, workout_log_id, exercise_id, payload, occurred_at,
    read_at_coach, read_at_student
  ) values (
    v_thread, new.student_id, new.kind, new.id, new.workout_log_id, new.exercise_id, v_payload, new.created_at,
    now(),  -- v76: se ven en el chat pero no suman al número de la coach
    case when new.kind = 'week_complete' then null else now() end
  )
  on conflict do nothing;
  return new;
end;
$function$;

update public.chat_events set read_at_coach = now()
 where kind <> 'exercise_unclear' and read_at_coach is null;

-- Recálculo de contadores (también sirve más adelante si se descuadran)
create or replace function public.chat_recount_threads()
returns int
language plpgsql security definer
set search_path to 'public'
as $function$
declare v_n int;
begin
  with c as (
    select t.id,
      (select count(*) from public.notes n
        where n.thread_id = t.id and n.author_role = 'student' and n.deleted_at is null and n.read_at_coach is null)
      + (select count(*) from public.chat_events e where e.thread_id = t.id and e.read_at_coach is null) as uc,
      (select count(*) from public.notes n
        where n.thread_id = t.id and n.author_role = 'coach' and n.visibility = 'shared'
          and n.deleted_at is null and n.read_at_student is null and n.source_note_id is null)
      + (select count(*) from public.chat_events e where e.thread_id = t.id and e.read_at_student is null) as us
    from public.note_threads t
  )
  update public.note_threads t
     set unread_for_coach = c.uc, unread_for_student = c.us
    from c
   where c.id = t.id and (t.unread_for_coach <> c.uc or t.unread_for_student <> c.us);
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;
revoke all on function public.chat_recount_threads() from public, anon, authenticated;

select public.chat_recount_threads();
