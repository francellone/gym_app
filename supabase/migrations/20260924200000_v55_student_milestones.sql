-- ============================================================
-- v55 — hitos y celebraciones (fundamento en DB)
-- ------------------------------------------------------------
-- CONTEXTO (pedido de un coach, decisiones de Franco 2026-09-24): la
-- persona recibe celebraciones escalonadas (día < semana < plan) más
-- mejores marcas y racha semanal, y la coach recibe avisos informativos.
-- Plan completo: doc del proyecto `claude/plan-celebraciones-hitos.md`.
--
-- La regla de "día completo / semana completa" vive en el front
-- (completionRules.js, computeWeekAdherence). No se copia a SQL para no
-- tener dos versiones que se desalineen: el front detecta el hito y lo
-- informa con award_milestone. La base garantiza lo que el front no
-- puede: que cada hito exista UNA sola vez (clave única) aunque se
-- recargue la PWA o se use otro dispositivo, y que la coach reciba un
-- solo aviso.
--
-- 1) Tabla student_milestones (hechos con claves propias: student,
--    assignment, workout_log y exercise como FKs, no solo en el payload).
-- 2) award_milestone: inserta idempotente; solo si es nuevo notifica.
--    - day_complete: NO crea un aviso nuevo. Actualiza en el lugar el
--      activity_update del día ("registró actividad") a session_completed
--      ("completó su día") SIN tocar `read` (decisión Franco). Un día
--      parcial nunca llega acá y se queda con "registró actividad".
--    - week_complete / plan_complete: aviso informativo nuevo.
--    - personal_best / streak / streak_freeze_used: sin aviso.
--    - Si llama la coach (modo coach) no se notifica a sí misma y el hito
--      queda con celebrated_at NULL: la persona lo ve al abrir la app.
-- 3) mark_milestones_celebrated: la persona marca como vistos los
--    pendientes.
-- 4) void_personal_best: anular una marca (persona o coach). Si anula la
--    persona, aviso a la coach. El log anulado sale de las comparaciones
--    futuras (lo resuelve el front leyendo voided_at).
-- 5) plans.completion_message: mensaje de cierre editable al crear el
--    plan. Se agrega a las DOS RPCs que clonan con lista explícita de
--    columnas (assign_template_to_student, migrate_assignment_off_template).
-- 6) merge_exercises: re-apunta también student_milestones.exercise_id
--    (la FK es RESTRICT, sin esto la fusión fallaría).
-- ============================================================

-- ── 5) mensaje de cierre del plan ───────────────────────────
alter table public.plans
  add column if not exists completion_message text
  constraint plans_completion_message_len check (completion_message is null or char_length(completion_message) <= 1000);

comment on column public.plans.completion_message is
  'v55: mensaje que ve la persona al terminar el plan. NULL = texto automático en el idioma de la persona. Lo edita la coach al crear el plan.';

-- ── 1) tabla ────────────────────────────────────────────────
create table if not exists public.student_milestones (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  kind           text not null,
  period_key     text not null,
  assignment_id  uuid references public.plan_assignments(id) on delete cascade,
  workout_log_id uuid references public.workout_logs(id) on delete cascade,
  exercise_id    uuid references public.exercises(id) on delete restrict,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null,
  celebrated_at  timestamptz,
  voided_at      timestamptz,
  voided_by      uuid references public.profiles(id) on delete set null,
  void_reason    text,
  constraint student_milestones_unique unique (student_id, kind, period_key),
  constraint student_milestones_kind_check check (kind in
    ('day_complete','week_complete','plan_complete','personal_best','streak','streak_freeze_used')),
  constraint student_milestones_period_check check (
       (kind = 'day_complete'       and period_key ~ '^\d{4}-\d{2}-\d{2}$')
    or (kind in ('week_complete','streak_freeze_used') and period_key ~ '^\d{4}-W\d{2}$')
    or (kind = 'plan_complete'      and assignment_id is not null and period_key = assignment_id::text)
    or (kind = 'personal_best'      and workout_log_id is not null and exercise_id is not null
                                    and period_key = workout_log_id::text)
    or (kind = 'streak'             and period_key ~ '^streak-\d+$')
  ),
  constraint student_milestones_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (kind = 'personal_best' and voided_at is not null)
  ),
  constraint student_milestones_void_reason_len check (void_reason is null or char_length(void_reason) <= 200)
);

comment on table public.student_milestones is
  'v55: hitos otorgados a la persona (día/semana/plan completos, mejores marcas, racha). Una fila por (persona, tipo, período). Se escribe solo por RPC (award_milestone, mark_milestones_celebrated, void_personal_best).';

create index if not exists student_milestones_student_created_idx
  on public.student_milestones (student_id, created_at desc);
create index if not exists student_milestones_pending_idx
  on public.student_milestones (student_id) where celebrated_at is null;
create index if not exists student_milestones_exercise_idx
  on public.student_milestones (student_id, exercise_id) where kind = 'personal_best';

alter table public.student_milestones enable row level security;

drop policy if exists student_milestones_select on public.student_milestones;
create policy student_milestones_select on public.student_milestones
  for select using (
    student_id = auth.uid()
    or (public.is_coach() and exists (
          select 1 from public.profiles p
           where p.id = student_milestones.student_id and p.coach_id = auth.uid()))
  );
-- Sin políticas de insert/update/delete: se escribe solo por las RPCs.

-- ── helper: ¿el caller puede actuar sobre esta persona? ─────
-- Devuelve 'student' | 'coach' | NULL.
create or replace function public.milestone_caller_role(p_student_id uuid)
returns text
language sql stable security definer
set search_path to 'public'
as $$
  select case
    when auth.uid() = p_student_id then 'student'
    when public.is_coach() and exists (
      select 1 from public.profiles p where p.id = p_student_id and p.coach_id = auth.uid()
    ) then 'coach'
    else null
  end;
$$;

-- ── 2) award_milestone ──────────────────────────────────────
create or replace function public.award_milestone(
  p_student_id     uuid,
  p_kind           text,
  p_period_key     text,
  p_payload        jsonb default '{}'::jsonb,
  p_assignment_id  uuid  default null,
  p_workout_log_id uuid  default null
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_role        text := public.milestone_caller_role(p_student_id);
  v_period      text := p_period_key;
  v_exercise_id uuid;
  v_id          uuid;
  v_row         public.student_milestones;
  v_coach_id    uuid;
  v_name        text;
  v_plan_title  text;
  v_week_start  date;
  v_updated     int;
begin
  if v_role is null then
    raise exception 'sin permiso para registrar hitos de esta persona' using errcode = '42501';
  end if;

  if p_assignment_id is not null and not exists (
    select 1 from public.plan_assignments where id = p_assignment_id and student_id = p_student_id
  ) then
    raise exception 'la asignación no pertenece a esta persona' using errcode = '42501';
  end if;

  if p_kind = 'plan_complete' then
    if p_assignment_id is null then
      raise exception 'plan_complete requiere assignment_id' using errcode = '22023';
    end if;
    v_period := p_assignment_id::text;
  end if;

  if p_kind = 'personal_best' then
    -- el ejercicio se deriva del log: no se confía en el front
    select wl.exercise_id into v_exercise_id
      from public.workout_logs wl
     where wl.id = p_workout_log_id
       and wl.student_id = p_student_id
       and wl.completed is true
       and wl.status = 'done';
    if v_exercise_id is null then
      raise exception 'personal_best requiere un registro hecho de esta persona' using errcode = '22023';
    end if;
    v_period := p_workout_log_id::text;
  end if;

  insert into public.student_milestones (
    student_id, kind, period_key, assignment_id, workout_log_id, exercise_id,
    payload, created_by, celebrated_at
  ) values (
    p_student_id, p_kind, v_period, p_assignment_id,
    case when p_kind = 'personal_best' then p_workout_log_id end,
    v_exercise_id,
    coalesce(p_payload, '{}'::jsonb), auth.uid(),
    case when v_role = 'student' then now() end
  )
  on conflict (student_id, kind, period_key) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_row from public.student_milestones
     where student_id = p_student_id and kind = p_kind and period_key = v_period;
    return jsonb_build_object('is_new', false, 'id', v_row.id,
      'celebrated_at', v_row.celebrated_at, 'voided_at', v_row.voided_at);
  end if;

  -- ── avisos a la coach (solo si registró la persona) ───────
  if v_role = 'student' and p_kind in ('day_complete','week_complete','plan_complete') then
    select coach_id, coalesce(nullif(trim(name), ''), email)
      into v_coach_id, v_name
      from public.profiles where id = p_student_id;

    if v_coach_id is not null then
      if p_kind = 'day_complete' then
        update public.notifications
           set type  = 'session_completed',
               title = v_name || ' completó su día',
               body  = 'Completó el entrenamiento del ' || to_char(v_period::date, 'DD/MM/YYYY') || '.',
               data  = data || jsonb_build_object('completed', true, 'milestone_id', v_id)
         where user_id = v_coach_id
           and type = 'activity_update'
           and data->>'student_id' = p_student_id::text
           and data->>'date' = v_period;
        get diagnostics v_updated = row_count;

        if v_updated = 0 and not exists (
          select 1 from public.notifications
           where user_id = v_coach_id and type = 'session_completed'
             and data->>'student_id' = p_student_id::text
             and data->>'date' = v_period
        ) then
          insert into public.notifications (user_id, type, title, body, data)
          values (v_coach_id, 'session_completed',
            v_name || ' completó su día',
            'Completó el entrenamiento del ' || to_char(v_period::date, 'DD/MM/YYYY') || '.',
            jsonb_build_object('student_id', p_student_id, 'student_name', v_name,
                               'date', v_period, 'completed', true, 'milestone_id', v_id));
        end if;

      elsif p_kind = 'week_complete' then
        v_week_start := to_date(v_period, 'IYYY-"W"IW');
        insert into public.notifications (user_id, type, title, body, data)
        values (v_coach_id, 'week_completed',
          v_name || ' completó su semana',
          'Cumplió las sesiones previstas de la semana del '
            || to_char(v_week_start, 'DD/MM') || ' al ' || to_char(v_week_start + 6, 'DD/MM') || '.',
          jsonb_build_object('student_id', p_student_id, 'student_name', v_name,
                             'week', v_period, 'week_start', v_week_start, 'milestone_id', v_id));

      elsif p_kind = 'plan_complete' then
        select pl.title into v_plan_title
          from public.plan_assignments pa join public.plans pl on pl.id = pa.plan_id
         where pa.id = p_assignment_id;
        insert into public.notifications (user_id, type, title, body, data)
        values (v_coach_id, 'plan_completed',
          v_name || ' terminó su plan',
          coalesce('Cerró el plan «' || v_plan_title || '».', 'Cerró su plan.'),
          jsonb_build_object('student_id', p_student_id, 'student_name', v_name,
                             'assignment_id', p_assignment_id, 'plan_title', v_plan_title,
                             'milestone_id', v_id));
      end if;
    end if;
  end if;

  return jsonb_build_object('is_new', true, 'id', v_id,
    'celebrated_at', case when v_role = 'student' then now() end, 'voided_at', null);
end;
$$;

comment on function public.award_milestone(uuid, text, text, jsonb, uuid, uuid) is
  'v55: registra un hito una sola vez (on conflict do nothing) y, solo si es nuevo y lo registró la persona, avisa a la coach. day_complete actualiza en el lugar el activity_update del día sin tocar read.';

-- ── 3) mark_milestones_celebrated ───────────────────────────
create or replace function public.mark_milestones_celebrated(p_ids uuid[])
returns int
language plpgsql security definer
set search_path to 'public'
as $$
declare n int;
begin
  update public.student_milestones
     set celebrated_at = now()
   where id = any(p_ids)
     and student_id = auth.uid()
     and celebrated_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── 4) void_personal_best ───────────────────────────────────
create or replace function public.void_personal_best(p_milestone_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_row      public.student_milestones;
  v_role     text;
  v_coach_id uuid;
  v_name     text;
  v_exercise text;
begin
  select * into v_row from public.student_milestones where id = p_milestone_id for update;
  if v_row.id is null or v_row.kind <> 'personal_best' then
    raise exception 'marca inexistente' using errcode = 'P0002';
  end if;

  v_role := public.milestone_caller_role(v_row.student_id);
  if v_role is null then
    raise exception 'sin permiso para anular esta marca' using errcode = '42501';
  end if;

  if v_row.voided_at is not null then
    return jsonb_build_object('voided', false, 'already_voided_at', v_row.voided_at);
  end if;

  update public.student_milestones
     set voided_at = now(), voided_by = auth.uid(), void_reason = left(p_reason, 200)
   where id = p_milestone_id;

  if v_role = 'student' then
    select coach_id, coalesce(nullif(trim(name), ''), email)
      into v_coach_id, v_name from public.profiles where id = v_row.student_id;
    select name into v_exercise from public.exercises where id = v_row.exercise_id;
    if v_coach_id is not null then
      insert into public.notifications (user_id, type, title, body, data)
      values (v_coach_id, 'personal_best_voided',
        v_name || ' anuló una mejor marca',
        coalesce('Ejercicio: ' || v_exercise || '.', 'Anuló una mejor marca.'),
        jsonb_build_object('student_id', v_row.student_id, 'student_name', v_name,
                           'milestone_id', v_row.id, 'exercise_id', v_row.exercise_id,
                           'exercise_name', v_exercise, 'workout_log_id', v_row.workout_log_id,
                           'reason', p_reason));
    end if;
  end if;

  return jsonb_build_object('voided', true);
end;
$$;

revoke execute on function public.milestone_caller_role(uuid) from public, anon;
revoke execute on function public.award_milestone(uuid, text, text, jsonb, uuid, uuid) from public, anon;
revoke execute on function public.mark_milestones_celebrated(uuid[]) from public, anon;
revoke execute on function public.void_personal_best(uuid, text) from public, anon;
grant execute on function public.milestone_caller_role(uuid) to authenticated, service_role;
grant execute on function public.award_milestone(uuid, text, text, jsonb, uuid, uuid) to authenticated, service_role;
grant execute on function public.mark_milestones_celebrated(uuid[]) to authenticated, service_role;
grant execute on function public.void_personal_best(uuid, text) to authenticated, service_role;

-- ── 5b) clonado: completion_message en las dos RPCs ─────────
-- Cuerpos idénticos a los vigentes salvo la columna nueva en el INSERT
-- INTO plans (misma firma → CREATE OR REPLACE conserva el ACL).
CREATE OR REPLACE FUNCTION public.assign_template_to_student(p_template_id uuid, p_student_id uuid, p_start_date date DEFAULT CURRENT_DATE, p_end_date date DEFAULT NULL::date, p_schedule_mode text DEFAULT 'flexible'::text, p_preferred_days jsonb DEFAULT NULL::jsonb, p_linked_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_plan_id       uuid := gen_random_uuid();
  v_new_assignment_id uuid;
  v_student_name      text;
  v_is_template       boolean;
  v_block_map         jsonb;
  v_ex_map            jsonb;
  v_creator           uuid;
BEGIN
  SELECT is_template INTO v_is_template FROM public.plans WHERE id = p_template_id;
  IF v_is_template IS NULL THEN
    RAISE EXCEPTION 'Plan % no existe', p_template_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_is_template = false THEN
    RAISE EXCEPTION 'Plan % no es una plantilla (is_template=false). Usá INSERT directo para asignar una instancia.', p_template_id USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(trim(name), ''), email) INTO v_student_name
    FROM public.profiles WHERE id = p_student_id AND role = 'student';
  IF v_student_name IS NULL THEN
    RAISE EXCEPTION 'Alumno % no existe o no tiene role=student', p_student_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_creator := COALESCE(auth.uid(), (SELECT created_by FROM public.plans WHERE id = p_template_id));

  INSERT INTO public.plans (
    id, title, description, goal, sessions_per_week, duration_weeks,
    is_template, created_by, plan_type, eval_type, eval_method,
    has_activation, eval_tags, cloned_from_plan_id, completion_message
  )
  SELECT
    v_new_plan_id,
    trim(both ' ' from COALESCE(p.title, 'Sin nombre')) || ' — ' || v_student_name,
    p.description,
    p.goal, p.sessions_per_week, p.duration_weeks,
    false, v_creator,
    p.plan_type, p.eval_type, p.eval_method,
    p.has_activation, p.eval_tags, p_template_id, p.completion_message
  FROM public.plans p WHERE p.id = p_template_id;

  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_block_map FROM public.plan_blocks WHERE plan_id = p_template_id;

  INSERT INTO public.plan_blocks (
    id, plan_id, section, block_type, order_index, title, notes,
    aerobic_format, aerobic_total_minutes, aerobic_intensity,
    aerobic_work_seconds, aerobic_rest_seconds, aerobic_rounds,
    aerobic_expected_sensation, circuit_type, circuit_work_seconds,
    circuit_rest_seconds, circuit_rounds, circuit_total_minutes,
    circuit_intensity, aerobic_zone, default_pct_1rm
  )
  SELECT
    (v_block_map->>(pb.id::text))::uuid, v_new_plan_id,
    pb.section, pb.block_type, pb.order_index, pb.title, pb.notes,
    pb.aerobic_format, pb.aerobic_total_minutes, pb.aerobic_intensity,
    pb.aerobic_work_seconds, pb.aerobic_rest_seconds, pb.aerobic_rounds,
    pb.aerobic_expected_sensation, pb.circuit_type, pb.circuit_work_seconds,
    pb.circuit_rest_seconds, pb.circuit_rounds, pb.circuit_total_minutes,
    pb.circuit_intensity, pb.aerobic_zone, pb.default_pct_1rm
  FROM public.plan_blocks pb WHERE pb.plan_id = p_template_id;

  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_ex_map FROM public.plan_exercises WHERE plan_id = p_template_id;

  INSERT INTO public.plan_exercises (
    id, plan_id, exercise_id, section, block_label, order_index,
    suggested_sets, suggested_reps, suggested_weight, rest_time,
    suggested_pse, extra_notes, suggested_weights, block_id,
    exercise_mode, duration_seconds,
    weight_mode, unilateral,
    pct_1rm, rm_reference_exercise_id,
    eval_type, eval_method, expected_value, expected_unit, mandatory, instructions
  )
  SELECT
    (v_ex_map->>(pe.id::text))::uuid, v_new_plan_id,
    pe.exercise_id, pe.section, pe.block_label, pe.order_index,
    pe.suggested_sets, pe.suggested_reps, pe.suggested_weight, pe.rest_time,
    pe.suggested_pse, pe.extra_notes, pe.suggested_weights,
    CASE WHEN pe.block_id IS NOT NULL AND v_block_map ? pe.block_id::text
         THEN (v_block_map->>(pe.block_id::text))::uuid ELSE NULL END,
    pe.exercise_mode, pe.duration_seconds,
    pe.weight_mode, pe.unilateral,
    pe.pct_1rm, pe.rm_reference_exercise_id,
    pe.eval_type, pe.eval_method, pe.expected_value, pe.expected_unit, pe.mandatory, pe.instructions
  FROM public.plan_exercises pe WHERE pe.plan_id = p_template_id;

  INSERT INTO public.evaluation_tests (
    plan_id, exercise_id, exercise_name, test_type, instructions,
    expected_value, expected_unit, mandatory, order_index
  )
  SELECT
    v_new_plan_id, et.exercise_id, et.exercise_name, et.test_type, et.instructions,
    et.expected_value, et.expected_unit, et.mandatory, et.order_index
  FROM public.evaluation_tests et WHERE et.plan_id = p_template_id;

  INSERT INTO public.plan_assignments (
    student_id, plan_id, start_date, end_date,
    schedule_mode, preferred_days, linked_assignment_id
  )
  VALUES (
    p_student_id, v_new_plan_id, p_start_date, p_end_date,
    p_schedule_mode, p_preferred_days, p_linked_assignment_id
  )
  RETURNING id INTO v_new_assignment_id;

  RETURN jsonb_build_object(
    'assignment_id', v_new_assignment_id, 'plan_id', v_new_plan_id,
    'template_id', p_template_id, 'student_id', p_student_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.migrate_assignment_off_template(p_assignment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_plan_id  uuid;
  v_new_plan_id  uuid := gen_random_uuid();
  v_student_id   uuid;
  v_student_name text;
  v_block_map    jsonb;
  v_ex_map       jsonb;
BEGIN
  SELECT pa.plan_id, pa.student_id
    INTO v_old_plan_id, v_student_id
    FROM public.plan_assignments pa
    JOIN public.plans p ON p.id = pa.plan_id
   WHERE pa.id = p_assignment_id
     AND p.is_template = true;

  IF v_old_plan_id IS NULL THEN
    RAISE EXCEPTION 'Assignment % no existe o no apunta a una plantilla', p_assignment_id;
  END IF;

  SELECT COALESCE(NULLIF(trim(name), ''), email)
    INTO v_student_name
    FROM public.profiles WHERE id = v_student_id;

  INSERT INTO public.plans (
    id, title, description, goal, sessions_per_week, duration_weeks,
    is_template, created_by, plan_type, eval_type, eval_method,
    has_activation, eval_tags, cloned_from_plan_id, completion_message
  )
  SELECT
    v_new_plan_id,
    trim(both ' ' from COALESCE(p.title, 'Sin nombre')) || ' — ' || v_student_name,
    p.description,
    p.goal, p.sessions_per_week, p.duration_weeks,
    false,
    p.created_by, p.plan_type, p.eval_type, p.eval_method,
    p.has_activation, p.eval_tags, v_old_plan_id, p.completion_message
  FROM public.plans p
  WHERE p.id = v_old_plan_id;

  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_block_map
    FROM public.plan_blocks
   WHERE plan_id = v_old_plan_id;

  INSERT INTO public.plan_blocks (
    id, plan_id, section, block_type, order_index, title, notes,
    aerobic_format, aerobic_total_minutes, aerobic_intensity,
    aerobic_work_seconds, aerobic_rest_seconds, aerobic_rounds,
    aerobic_expected_sensation, circuit_type, circuit_work_seconds,
    circuit_rest_seconds, circuit_rounds, circuit_total_minutes,
    circuit_intensity, aerobic_zone, default_pct_1rm
  )
  SELECT
    (v_block_map->>(pb.id::text))::uuid,
    v_new_plan_id,
    pb.section, pb.block_type, pb.order_index, pb.title, pb.notes,
    pb.aerobic_format, pb.aerobic_total_minutes, pb.aerobic_intensity,
    pb.aerobic_work_seconds, pb.aerobic_rest_seconds, pb.aerobic_rounds,
    pb.aerobic_expected_sensation, pb.circuit_type, pb.circuit_work_seconds,
    pb.circuit_rest_seconds, pb.circuit_rounds, pb.circuit_total_minutes,
    pb.circuit_intensity, pb.aerobic_zone, pb.default_pct_1rm
  FROM public.plan_blocks pb
  WHERE pb.plan_id = v_old_plan_id;

  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_ex_map
    FROM public.plan_exercises
   WHERE plan_id = v_old_plan_id;

  INSERT INTO public.plan_exercises (
    id, plan_id, exercise_id, section, block_label, order_index,
    suggested_sets, suggested_reps, suggested_weight, rest_time,
    suggested_pse, extra_notes, suggested_weights, block_id,
    exercise_mode, duration_seconds,
    weight_mode, unilateral,
    pct_1rm, rm_reference_exercise_id,
    eval_type, eval_method, expected_value, expected_unit, mandatory, instructions
  )
  SELECT
    (v_ex_map->>(pe.id::text))::uuid,
    v_new_plan_id,
    pe.exercise_id, pe.section, pe.block_label, pe.order_index,
    pe.suggested_sets, pe.suggested_reps, pe.suggested_weight, pe.rest_time,
    pe.suggested_pse, pe.extra_notes, pe.suggested_weights,
    CASE
      WHEN pe.block_id IS NOT NULL AND v_block_map ? pe.block_id::text
        THEN (v_block_map->>(pe.block_id::text))::uuid
      ELSE NULL
    END,
    pe.exercise_mode, pe.duration_seconds,
    pe.weight_mode, pe.unilateral,
    pe.pct_1rm, pe.rm_reference_exercise_id,
    pe.eval_type, pe.eval_method, pe.expected_value, pe.expected_unit, pe.mandatory, pe.instructions
  FROM public.plan_exercises pe
  WHERE pe.plan_id = v_old_plan_id;

  UPDATE public.workout_logs wl
     SET plan_id = v_new_plan_id,
         plan_exercise_id = CASE
           WHEN wl.plan_exercise_id IS NOT NULL AND v_ex_map ? wl.plan_exercise_id::text
             THEN (v_ex_map->>(wl.plan_exercise_id::text))::uuid
           ELSE wl.plan_exercise_id
         END
   WHERE wl.student_id = v_student_id
     AND wl.plan_id = v_old_plan_id;

  UPDATE public.workout_sessions
     SET plan_id = v_new_plan_id
   WHERE student_id = v_student_id
     AND plan_id = v_old_plan_id;

  UPDATE public.workout_block_logs wbl
     SET plan_id = v_new_plan_id,
         plan_block_id = CASE
           WHEN wbl.plan_block_id IS NOT NULL AND v_block_map ? wbl.plan_block_id::text
             THEN (v_block_map->>(wbl.plan_block_id::text))::uuid
           ELSE wbl.plan_block_id
         END
   WHERE wbl.student_id = v_student_id
     AND wbl.plan_id = v_old_plan_id;

  UPDATE public.evaluation_results
     SET plan_id = v_new_plan_id
   WHERE student_id = v_student_id
     AND plan_id = v_old_plan_id;

  UPDATE public.plan_assignments
     SET plan_id = v_new_plan_id
   WHERE id = p_assignment_id;

  RETURN v_new_plan_id;
END;
$function$;

-- ── 6) merge_exercises: re-apuntar las marcas ───────────────
CREATE OR REPLACE FUNCTION public.merge_exercises(p_from uuid, p_into uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  update public.workout_block_logs set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('workout_block_logs', n);
  update public.evaluation_test_responses set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('eval_responses', n);
  update public.plan_exercise_prescription_history set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('prescription_history', n);
  update public.notes set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', n);
  -- v55: marcas personales (FK RESTRICT)
  update public.student_milestones set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('milestones', n);

  update public.exercises set archived_at = now(), archived_by = auth.uid(), merged_into_id = p_into where id = p_from;
  insert into public.exercise_merges (from_exercise_id, into_exercise_id, merged_by, counts, from_snapshot, from_tag_ids)
  values (p_from, p_into, auth.uid(), v_counts, to_jsonb(v_from), v_tag_ids);
  return v_counts;
end;
$function$;

-- ── 7) tipos de notificación nuevos (aplicado como v55b) ────
-- notifications tiene un CHECK con la lista cerrada de tipos: sin esto
-- los avisos de semana / plan / marca anulada fallan (lo detectó el test).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'plan_assigned','activity_update','session_completed','plan_expiring','stagnation_alert',
  'coach_comment','weekly_summary','schema_health_alert','student_note','form_submitted',
  'plan_updated','profile_change','evaluation_completed',
  'week_completed','plan_completed','personal_best_voided'
]::text[]));
