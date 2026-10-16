-- ============================================================
-- v75 — Chat del coach (pedido de Franco, 2026-10-16)
-- ------------------------------------------------------------
-- El chat se arma sobre el hilo de notas que ya existe (note_threads/notes).
-- Esta migración agrega:
--   1) chat_events: los eventos que se muestran dentro del chat (día, semana,
--      plan, mejor marca, omisión por "no sabía cómo"). Los ven la persona y
--      la coach. Salen por trigger de student_milestones y de los registros.
--      Suman a los mismos contadores de no leídos del hilo.
--   2) Copias enlazadas de un mensaje de la coach: nota privada, comentario en
--      el ejercicio (todos los planes), comentario en el ejercicio de ESTE plan
--      y comentario en un día del plan. Cada copia es una nota con
--      source_note_id → el mensaje del chat. Claves propias: plan_id,
--      plan_exercise_id, plan_section (regla de Franco: claves en las tablas).
--      Las copias no notifican ni suman no leídos: la persona ya leyó el
--      mensaje original.
--   3) notes_mark_thread_read también marca los eventos.
-- Texto de los eventos y de la pregunta semanal: se resuelve en el front por
-- kind + payload (nunca idioma fijo en la base).
-- ============================================================

-- ── 1) notes: claves de las copias ───────────────────────────
alter table public.notes
  add column if not exists source_note_id   uuid references public.notes(id) on delete set null,
  add column if not exists plan_id          uuid references public.plans(id) on delete cascade,
  add column if not exists plan_exercise_id uuid references public.plan_exercises(id) on delete cascade,
  add column if not exists plan_section     text;

create index if not exists notes_source_note_id_idx   on public.notes(source_note_id) where source_note_id is not null;
create index if not exists notes_plan_id_idx          on public.notes(plan_id) where plan_id is not null;
create index if not exists notes_plan_exercise_id_idx on public.notes(plan_exercise_id) where plan_exercise_id is not null;

comment on column public.notes.source_note_id is 'v75: si es una copia guardada desde el chat, el mensaje original.';
comment on column public.notes.plan_section   is 'v75: día del plan (day_a, day_b…) para notas context_type=plan.';

-- Resolver de contexto: suma plan_id / plan_exercise_id.
create or replace function public.notes_resolve_context()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_exercise_id   uuid;
  v_muscle_group  text;
  v_block_type    text;
  v_note_date     date;
  v_plan_id       uuid;
begin
  v_exercise_id := null; v_muscle_group := null; v_block_type := null; v_note_date := null; v_plan_id := null;

  if new.context_type = 'free' then
    new.exercise_id := null;
    new.block_type  := null;
    new.plan_id := null; new.plan_exercise_id := null; new.plan_section := null;
    return new;

  elsif new.context_type = 'workout_log' then
    select pe.exercise_id, pb.block_type, wl.logged_date
      into v_exercise_id, v_block_type, v_note_date
      from public.workout_logs wl
      join public.plan_exercises pe on pe.id = wl.plan_exercise_id
      left join public.plan_blocks pb on pb.id = pe.block_id
     where wl.id = new.context_id;

  elsif new.context_type = 'workout_block_log' then
    select pb.block_type, wbl.logged_date
      into v_block_type, v_note_date
      from public.workout_block_logs wbl
      join public.plan_blocks pb on pb.id = wbl.plan_block_id
     where wbl.id = new.context_id;

  elsif new.context_type = 'plan_exercise' then
    select pe.exercise_id, pb.block_type, pe.plan_id into v_exercise_id, v_block_type, v_plan_id
      from public.plan_exercises pe
      left join public.plan_blocks pb on pb.id = pe.block_id
     where pe.id = new.context_id;
    new.plan_exercise_id := new.context_id;
    new.plan_id := v_plan_id;

  elsif new.context_type = 'plan' then
    new.plan_id := new.context_id;

  elsif new.context_type = 'evaluation_test' then
    select et.exercise_id into v_exercise_id
      from public.evaluation_test_responses etr
      join public.evaluation_tests et on et.id = etr.test_id
     where etr.id = new.context_id;

  elsif new.context_type = 'evaluation_result' then
    select eval_date into v_note_date
      from public.evaluation_results
     where id = new.context_id;

  elsif new.context_type = 'exercise' then
    v_exercise_id := new.context_id;
  end if;

  if v_exercise_id is not null then
    select e.muscle_group into v_muscle_group
      from public.exercises e where e.id = v_exercise_id;
  end if;

  new.exercise_id  := v_exercise_id;
  new.muscle_group := v_muscle_group;
  new.block_type   := v_block_type;
  new.note_date    := v_note_date;
  return new;
end;
$function$;

-- Las copias no avisan a la persona.
create or replace function public.fn_notify_coach_note()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_student_id uuid;
  v_excerpt    text;
begin
  if new.author_role <> 'coach' or new.visibility <> 'shared' or new.deleted_at is not null
     or new.source_note_id is not null then
    return new;
  end if;
  select student_id into v_student_id from public.note_threads where id = new.thread_id;
  if v_student_id is null then return new; end if;
  v_excerpt := substring(new.body, 1, 140);
  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_student_id, 'coach_comment', 'Tu coach te dejó una nota', v_excerpt,
    jsonb_build_object(
      'note_id',      new.id,
      'thread_id',    new.thread_id,
      'context_type', new.context_type,
      'context_id',   new.context_id,
      'exercise_id',  new.exercise_id
    )
  );
  return new;
end;
$function$;

-- Las copias no suman no leídos (se insertan ya leídas).
create or replace function public.notes_bump_thread()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    update public.note_threads
       set last_message_at = case when new.source_note_id is null then new.created_at else last_message_at end,
           updated_at      = now(),
           unread_for_student = unread_for_student
                              + case when new.author_role='coach' and new.visibility='shared'
                                          and new.deleted_at is null and new.read_at_student is null
                                          and new.source_note_id is null then 1 else 0 end,
           unread_for_coach   = unread_for_coach
                              + case when new.author_role='student' and new.deleted_at is null
                                          and new.read_at_coach is null then 1 else 0 end
     where id = new.thread_id;

  elsif tg_op = 'UPDATE' then
    if old.read_at_coach is null and new.read_at_coach is not null
       and new.author_role='student' and new.deleted_at is null then
      update public.note_threads
         set unread_for_coach = greatest(unread_for_coach - 1, 0), updated_at = now()
       where id = new.thread_id;
    end if;

    if old.read_at_coach is not null and new.read_at_coach is null
       and new.author_role='student' and new.deleted_at is null then
      update public.note_threads
         set unread_for_coach = unread_for_coach + 1, updated_at = now()
       where id = new.thread_id;
    end if;

    if old.read_at_student is null and new.read_at_student is not null
       and new.author_role='coach' and new.visibility='shared' and new.deleted_at is null then
      update public.note_threads
         set unread_for_student = greatest(unread_for_student - 1, 0), updated_at = now()
       where id = new.thread_id;
    end if;

    if old.read_at_student is not null and new.read_at_student is null
       and new.author_role='coach' and new.visibility='shared' and new.deleted_at is null then
      update public.note_threads
         set unread_for_student = unread_for_student + 1, updated_at = now()
       where id = new.thread_id;
    end if;

    if old.deleted_at is null and new.deleted_at is not null then
      if new.author_role = 'student' and new.read_at_coach is null then
        update public.note_threads
           set unread_for_coach = greatest(unread_for_coach - 1, 0), updated_at = now()
         where id = new.thread_id;
      elsif new.author_role = 'coach' and new.visibility = 'shared'
            and new.read_at_student is null then
        update public.note_threads
           set unread_for_student = greatest(unread_for_student - 1, 0), updated_at = now()
         where id = new.thread_id;
      end if;
    end if;

    if old.body is distinct from new.body and new.deleted_at is null and new.source_note_id is null then
      update public.note_threads
         set last_message_at = now(), updated_at = now()
       where id = new.thread_id;
    end if;
  end if;

  return new;
end;
$function$;

-- Editar el texto de una copia (lo hace el trigger de sincronización) no la
-- vuelve a marcar como no leída.
create or replace function public.notes_reset_read_on_body_edit()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
begin
  if old.body is not distinct from new.body then return new; end if;
  if new.deleted_at is not null then return new; end if;
  if new.source_note_id is not null then return new; end if;
  if new.author_role = 'student' then
    new.read_at_coach := null;
  elsif new.author_role = 'coach' and new.visibility = 'shared' then
    new.read_at_student := null;
  end if;
  return new;
end;
$function$;

-- Si la coach edita el mensaje del chat, las copias guardadas se actualizan.
create or replace function public.notes_sync_copies_body()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
begin
  if new.source_note_id is null and old.body is distinct from new.body and new.deleted_at is null then
    update public.notes
       set body = new.body
     where source_note_id = new.id
       and deleted_at is null
       and body is distinct from new.body;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notes_sync_copies_body on public.notes;
create trigger trg_notes_sync_copies_body
  after update of body on public.notes
  for each row execute function public.notes_sync_copies_body();

-- ── 2) Guardar / quitar una copia desde el chat ──────────────
-- p_target: 'private' | 'exercise' | 'plan_exercise' | 'plan_day'
-- p_ref_id: exercise_id | plan_exercise_id | plan_id (según p_target; null en private)
-- p_section: día del plan, solo para plan_day
create or replace function public.chat_link_note(
  p_source_note_id uuid,
  p_target         text,
  p_ref_id         uuid default null,
  p_section        text default null
)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_src        public.notes;
  v_student_id uuid;
  v_ctx_type   text;
  v_ctx_id     uuid;
  v_visibility text := 'shared';
  v_id         uuid;
begin
  if auth.uid() is null then
    raise exception 'Requiere sesión' using errcode = '42501';
  end if;

  select * into v_src from public.notes where id = p_source_note_id;
  if v_src.id is null or v_src.deleted_at is not null then
    raise exception 'El mensaje no existe' using errcode = 'P0002';
  end if;
  if v_src.author_id <> auth.uid() or v_src.author_role <> 'coach' or v_src.source_note_id is not null then
    raise exception 'Solo se pueden guardar mensajes propios' using errcode = '42501';
  end if;

  select nt.student_id into v_student_id
    from public.note_threads nt
   where nt.id = v_src.thread_id and nt.coach_id = auth.uid();
  if v_student_id is null or not public.is_coach_of(v_student_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_target = 'private' then
    v_ctx_type := 'free'; v_ctx_id := null; v_visibility := 'coach_private';

  elsif p_target = 'exercise' then
    if not exists (select 1 from public.exercises where id = p_ref_id) then
      raise exception 'El ejercicio no existe' using errcode = 'P0002';
    end if;
    v_ctx_type := 'exercise'; v_ctx_id := p_ref_id;

  elsif p_target = 'plan_exercise' then
    if not exists (
      select 1 from public.plan_exercises pe
        join public.plan_assignments pa on pa.plan_id = pe.plan_id
       where pe.id = p_ref_id and pa.student_id = v_student_id
    ) then
      raise exception 'El ejercicio no está en un plan de esta persona' using errcode = '42501';
    end if;
    v_ctx_type := 'plan_exercise'; v_ctx_id := p_ref_id;

  elsif p_target = 'plan_day' then
    if p_section is null or not exists (
      select 1 from public.plan_assignments pa
       where pa.plan_id = p_ref_id and pa.student_id = v_student_id
    ) then
      raise exception 'El plan no es de esta persona' using errcode = '42501';
    end if;
    if not exists (select 1 from public.plan_exercises where plan_id = p_ref_id and section = p_section)
       and not exists (select 1 from public.plan_blocks where plan_id = p_ref_id and section = p_section) then
      raise exception 'Ese día no existe en el plan' using errcode = '22023';
    end if;
    v_ctx_type := 'plan'; v_ctx_id := p_ref_id;

  else
    raise exception 'Destino desconocido: %', p_target using errcode = '22023';
  end if;

  -- Ya guardado en el mismo lugar → devolver el existente.
  select id into v_id
    from public.notes
   where source_note_id = v_src.id
     and deleted_at is null
     and context_type = v_ctx_type
     and context_id is not distinct from v_ctx_id
     and visibility = v_visibility
     and plan_section is not distinct from (case when p_target = 'plan_day' then p_section else null end)
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.notes (
    thread_id, author_id, author_role, body, visibility,
    context_type, context_id, plan_section, source_note_id,
    read_at_student, read_at_coach
  ) values (
    v_src.thread_id, auth.uid(), 'coach', v_src.body, v_visibility,
    v_ctx_type, v_ctx_id, case when p_target = 'plan_day' then p_section else null end, v_src.id,
    now(), now()
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.chat_unlink_note(p_copy_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $function$
declare v_copy public.notes;
begin
  select * into v_copy from public.notes where id = p_copy_id;
  if v_copy.id is null or v_copy.source_note_id is null then
    raise exception 'No es una copia del chat' using errcode = 'P0002';
  end if;
  if v_copy.author_id <> auth.uid() or not exists (
    select 1 from public.note_threads nt
     where nt.id = v_copy.thread_id and nt.coach_id = auth.uid() and public.is_coach_of(nt.student_id)
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.notes set deleted_at = now() where id = p_copy_id and deleted_at is null;
end;
$function$;

revoke all on function public.chat_link_note(uuid, text, uuid, text) from public, anon;
revoke all on function public.chat_unlink_note(uuid) from public, anon;
grant execute on function public.chat_link_note(uuid, text, uuid, text) to authenticated;
grant execute on function public.chat_unlink_note(uuid) to authenticated;

-- ── 3) chat_events ───────────────────────────────────────────
create table if not exists public.chat_events (
  id                   uuid primary key default gen_random_uuid(),
  thread_id            uuid not null references public.note_threads(id) on delete cascade,
  student_id           uuid not null references public.profiles(id) on delete cascade,
  kind                 text not null check (kind in ('day_complete','week_complete','plan_complete','personal_best','exercise_unclear')),
  milestone_id         uuid references public.student_milestones(id) on delete cascade,
  workout_log_id       uuid references public.workout_logs(id) on delete cascade,
  workout_block_log_id uuid references public.workout_block_logs(id) on delete cascade,
  exercise_id          uuid references public.exercises(id) on delete set null,
  payload              jsonb not null default '{}'::jsonb,
  occurred_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  read_at_coach        timestamptz,
  read_at_student      timestamptz,
  check (
    (kind = 'exercise_unclear' and (workout_log_id is not null or workout_block_log_id is not null))
    or (kind <> 'exercise_unclear' and milestone_id is not null)
  )
);

create unique index if not exists chat_events_milestone_uq on public.chat_events(milestone_id) where milestone_id is not null;
create unique index if not exists chat_events_wlog_uq      on public.chat_events(workout_log_id) where workout_log_id is not null;
create unique index if not exists chat_events_wblog_uq     on public.chat_events(workout_block_log_id) where workout_block_log_id is not null;
create index if not exists chat_events_thread_idx          on public.chat_events(thread_id, occurred_at desc);
create index if not exists chat_events_student_idx         on public.chat_events(student_id);

comment on table public.chat_events is
  'v75: eventos que se muestran en el chat coach-persona. Texto en el front por kind+payload. Escritura solo por triggers.';

alter table public.chat_events enable row level security;

drop policy if exists chat_events_select on public.chat_events;
create policy chat_events_select on public.chat_events for select to authenticated
  using (
    student_id = (select auth.uid())
    or thread_id in (select public.my_coach_thread_ids())
  );

revoke all on public.chat_events from anon;
grant select on public.chat_events to authenticated;

-- Contadores de no leídos del hilo
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
    if old.read_at_coach is null and new.read_at_coach is not null then
      update public.note_threads set unread_for_coach = greatest(unread_for_coach - 1, 0), updated_at = now()
       where id = new.thread_id;
    end if;
    if old.read_at_student is null and new.read_at_student is not null then
      update public.note_threads set unread_for_student = greatest(unread_for_student - 1, 0), updated_at = now()
       where id = new.thread_id;
    end if;
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

drop trigger if exists trg_chat_events_bump on public.chat_events;
create trigger trg_chat_events_bump
  after insert or update of read_at_coach, read_at_student or delete on public.chat_events
  for each row execute function public.chat_events_bump_thread();

-- Hilo coach-persona de una persona (null si no tiene coach).
create or replace function public._chat_thread_for(p_student uuid)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $function$
declare v_coach uuid;
begin
  select coach_id into v_coach from public.profiles where id = p_student;
  if v_coach is null or v_coach = p_student then return null; end if;
  return public._note_thread_for(p_student, false);
end;
$function$;

-- Hitos → eventos
create or replace function public.fn_chat_event_from_milestone()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_thread  uuid;
  v_coach   uuid;
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
  select coach_id into v_coach from public.profiles where id = new.student_id;

  v_payload := coalesce(new.payload, '{}'::jsonb) || jsonb_build_object('period_key', new.period_key);
  if new.kind = 'week_complete' then
    v_payload := v_payload || jsonb_build_object('variant', floor(random() * 6)::int);
  end if;

  insert into public.chat_events (
    thread_id, student_id, kind, milestone_id, workout_log_id, exercise_id, payload, occurred_at,
    read_at_coach, read_at_student
  ) values (
    v_thread, new.student_id, new.kind, new.id, new.workout_log_id, new.exercise_id, v_payload, new.created_at,
    case when new.created_by = v_coach then now() else null end,
    -- La persona solo tiene "no leído" la pregunta de la semana.
    case when new.kind = 'week_complete' then null else now() end
  )
  on conflict do nothing;
  return new;
end;
$function$;

drop trigger if exists trg_chat_event_from_milestone on public.student_milestones;
create trigger trg_chat_event_from_milestone
  after insert or update of voided_at on public.student_milestones
  for each row execute function public.fn_chat_event_from_milestone();

-- Omisión por "no sabía cómo" → evento (y se borra si deja de serlo)
create or replace function public.fn_chat_event_skip_unclear()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_is_unclear boolean := new.status = 'skipped' and new.skip_reason = 'unclear';
  v_was_unclear boolean := tg_op = 'UPDATE' and old.status = 'skipped' and old.skip_reason = 'unclear';
  v_thread uuid;
  v_name   text;
  v_exercise uuid;
begin
  if not v_is_unclear then
    if v_was_unclear then
      if tg_table_name = 'workout_logs' then
        delete from public.chat_events where workout_log_id = new.id;
      else
        delete from public.chat_events where workout_block_log_id = new.id;
      end if;
    end if;
    return new;
  end if;
  if v_was_unclear then
    -- Sigue siendo omisión: actualizar la nota de la persona, si cambió.
    if tg_table_name = 'workout_logs' then
      update public.chat_events set payload = payload || jsonb_build_object('skip_note', new.skip_note)
       where workout_log_id = new.id;
    else
      update public.chat_events set payload = payload || jsonb_build_object('skip_note', new.skip_note)
       where workout_block_log_id = new.id;
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
    insert into public.chat_events (thread_id, student_id, kind, workout_log_id, exercise_id, payload, occurred_at, read_at_student)
    values (v_thread, new.student_id, 'exercise_unclear', new.id, v_exercise,
            jsonb_build_object('item_kind','exercise','item_name', v_name, 'date', new.logged_date,
                               'skip_note', new.skip_note, 'plan_id', new.plan_id, 'plan_exercise_id', new.plan_exercise_id),
            now(), now())
    on conflict do nothing;
  else
    select coalesce(nullif(pb.title, ''), new.block_title) into v_name
      from public.plan_blocks pb where pb.id = new.plan_block_id;
    insert into public.chat_events (thread_id, student_id, kind, workout_block_log_id, exercise_id, payload, occurred_at, read_at_student)
    values (v_thread, new.student_id, 'exercise_unclear', new.id, new.exercise_id,
            jsonb_build_object('item_kind','block','item_name', coalesce(v_name, new.block_title), 'date', new.logged_date,
                               'skip_note', new.skip_note, 'plan_id', new.plan_id, 'plan_block_id', new.plan_block_id),
            now(), now())
    on conflict do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_chat_event_skip_unclear on public.workout_logs;
create trigger trg_chat_event_skip_unclear
  after insert or update of status, skip_reason, skip_note on public.workout_logs
  for each row execute function public.fn_chat_event_skip_unclear();

drop trigger if exists trg_chat_event_skip_unclear on public.workout_block_logs;
create trigger trg_chat_event_skip_unclear
  after insert or update of status, skip_reason, skip_note on public.workout_block_logs
  for each row execute function public.fn_chat_event_skip_unclear();

-- ── 4) Marcar como leído también marca eventos ───────────────
create or replace function public.notes_mark_thread_read(p_thread_id uuid, p_as_role text)
returns integer
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_caller_id  uuid := auth.uid();
  v_marked     integer := 0;
  v_events     integer := 0;
begin
  if v_caller_id is null then
    raise exception 'notes_mark_thread_read: requiere autenticación';
  end if;
  if p_thread_id is null or p_as_role is null then
    raise exception 'notes_mark_thread_read: thread_id y as_role son obligatorios';
  end if;
  if p_as_role not in ('coach','student') then
    raise exception 'notes_mark_thread_read: as_role debe ser coach o student';
  end if;

  if p_as_role = 'student' then
    if not exists (select 1 from public.note_threads where id = p_thread_id and student_id = v_caller_id) then
      raise exception 'notes_mark_thread_read: no autorizado para marcar como student en este thread';
    end if;
  else
    if not exists (
      select 1 from public.note_threads nt where nt.id = p_thread_id and nt.coach_id = v_caller_id and public.is_coach_of(nt.student_id)
    ) then
      raise exception 'notes_mark_thread_read: no autorizado para marcar como coach';
    end if;
  end if;

  if p_as_role = 'coach' then
    update public.notes
       set read_at_coach = now()
     where thread_id = p_thread_id and author_role = 'student'
       and read_at_coach is null and deleted_at is null;
    get diagnostics v_marked = row_count;
    update public.chat_events set read_at_coach = now()
     where thread_id = p_thread_id and read_at_coach is null;
    get diagnostics v_events = row_count;
  else
    update public.notes
       set read_at_student = now()
     where thread_id = p_thread_id and author_role = 'coach' and visibility = 'shared'
       and read_at_student is null and deleted_at is null;
    get diagnostics v_marked = row_count;
    update public.chat_events set read_at_student = now()
     where thread_id = p_thread_id and read_at_student is null;
    get diagnostics v_events = row_count;
  end if;

  return v_marked + v_events;
end;
$function$;

-- ── 5) Realtime ──────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_events') then
    alter publication supabase_realtime add table public.chat_events;
  end if;
end $$;

-- ── 6) Historia: eventos de lo ya ocurrido, todos leídos ─────
insert into public.chat_events (thread_id, student_id, kind, milestone_id, workout_log_id, exercise_id, payload, occurred_at, read_at_coach, read_at_student)
select t.thread_id, m.student_id, m.kind, m.id, m.workout_log_id, m.exercise_id,
       coalesce(m.payload,'{}'::jsonb) || jsonb_build_object('period_key', m.period_key)
         || case when m.kind = 'week_complete' then jsonb_build_object('variant', (abs(hashtext(m.id::text)) % 6)) else '{}'::jsonb end
         || case when m.voided_at is not null then jsonb_build_object('voided', true, 'void_reason', m.void_reason) else '{}'::jsonb end,
       m.created_at, m.created_at, m.created_at
  from public.student_milestones m
  join public.profiles p on p.id = m.student_id and p.coach_id is not null and p.coach_id <> m.student_id
  cross join lateral (select public._note_thread_for(m.student_id, false) as thread_id) t
 where m.kind in ('day_complete','week_complete','plan_complete','personal_best')
on conflict do nothing;

insert into public.chat_events (thread_id, student_id, kind, workout_log_id, exercise_id, payload, occurred_at, read_at_coach, read_at_student)
select t.thread_id, wl.student_id, 'exercise_unclear', wl.id, e.id,
       jsonb_build_object('item_kind','exercise','item_name', e.name, 'date', wl.logged_date,
                          'skip_note', wl.skip_note, 'plan_id', wl.plan_id, 'plan_exercise_id', wl.plan_exercise_id),
       wl.updated_at, wl.updated_at, wl.updated_at
  from public.workout_logs wl
  join public.profiles p on p.id = wl.student_id and p.coach_id is not null and p.coach_id <> wl.student_id
  left join public.plan_exercises pe on pe.id = wl.plan_exercise_id
  left join public.exercises e on e.id = pe.exercise_id
  cross join lateral (select public._note_thread_for(wl.student_id, false) as thread_id) t
 where wl.status = 'skipped' and wl.skip_reason = 'unclear' and coalesce(wl.source,'') <> 'coach'
on conflict do nothing;

insert into public.chat_events (thread_id, student_id, kind, workout_block_log_id, exercise_id, payload, occurred_at, read_at_coach, read_at_student)
select t.thread_id, b.student_id, 'exercise_unclear', b.id, b.exercise_id,
       jsonb_build_object('item_kind','block','item_name', coalesce(nullif(pb.title,''), b.block_title), 'date', b.logged_date,
                          'skip_note', b.skip_note, 'plan_id', b.plan_id, 'plan_block_id', b.plan_block_id),
       b.updated_at, b.updated_at, b.updated_at
  from public.workout_block_logs b
  join public.profiles p on p.id = b.student_id and p.coach_id is not null and p.coach_id <> b.student_id
  left join public.plan_blocks pb on pb.id = b.plan_block_id
  cross join lateral (select public._note_thread_for(b.student_id, false) as thread_id) t
 where b.status = 'skipped' and b.skip_reason = 'unclear' and coalesce(b.source,'') <> 'coach'
on conflict do nothing;
