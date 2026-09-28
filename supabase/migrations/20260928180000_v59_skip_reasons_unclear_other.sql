-- ============================================================
-- v59 (2026-09-28) — motivos de omisión nuevos + aviso a la coach
-- ------------------------------------------------------------
-- Pedido de Franco tras usar el registro por confirmación en su primera
-- semana de plan nuevo: omitió un ejercicio porque no había video y otro
-- porque no lo entendió, y ninguno de los tres motivos le encajaba.
--
-- 1. skip_reason suma 'unclear' ("no sabía cómo hacerlo") y 'other'.
--    'choice' ("elegí no hacerlo") sigue siendo válido para las filas
--    viejas, pero la pantalla ya no lo ofrece.
-- 2. skip_note: texto corto opcional que acompaña al motivo (pensado para
--    "otro"). Solo en omitidos; tope de 280 caracteres.
-- 3. save_workout_log gana p_skip_note (20 params). La firma de 19 se
--    DROPea: con otra lista de args, CREATE OR REPLACE crea un overload y
--    PostgREST no puede elegir ("could not choose best candidate").
-- 4. 'unclear' es una falla del PLAN, no de la persona: avisa a la coach
--    con una notificación 'exercise_unclear' (ejercicio y bloque). Si la
--    registró la propia coach no se avisa (ya lo sabe). El texto se
--    resuelve en el front por type+payload; title/body quedan de respaldo.
-- ============================================================

-- ── 1 y 2: columnas y CHECKs ─────────────────────────────────
alter table public.workout_logs
  add column if not exists skip_note text;
alter table public.workout_block_logs
  add column if not exists skip_note text;

comment on column public.workout_logs.skip_note is
  'v59: aclaración opcional de la persona al omitir (motivo "otro"). Solo con status=skipped.';
comment on column public.workout_block_logs.skip_note is
  'v59: aclaración opcional de la persona al omitir (motivo "otro"). Solo con status=skipped.';

alter table public.workout_logs
  drop constraint if exists workout_logs_skip_reason_check,
  add constraint workout_logs_skip_reason_check
    check (skip_reason is null or skip_reason in ('choice', 'time', 'discomfort', 'unclear', 'other')),
  drop constraint if exists workout_logs_skip_note_check,
  add constraint workout_logs_skip_note_check
    check (skip_note is null or (status = 'skipped' and char_length(skip_note) <= 280));

alter table public.workout_block_logs
  drop constraint if exists workout_block_logs_skip_reason_check,
  add constraint workout_block_logs_skip_reason_check
    check (skip_reason is null or skip_reason in ('choice', 'time', 'discomfort', 'unclear', 'other')),
  drop constraint if exists workout_block_logs_skip_note_check,
  add constraint workout_block_logs_skip_note_check
    check (skip_note is null or (status = 'skipped' and char_length(skip_note) <= 280));

-- ── 3: RPC ───────────────────────────────────────────────────
drop function if exists public.save_workout_log(
  uuid, uuid, uuid, date, text, jsonb, uuid, jsonb, boolean, text, integer, integer,
  text, text, boolean, boolean, text, text, text
);

create or replace function public.save_workout_log(
  p_student_id uuid, p_plan_id uuid, p_plan_exercise_id uuid, p_logged_date date,
  p_weight_mode text, p_reps jsonb,
  p_log_id uuid default null, p_weights jsonb default null, p_unilateral boolean default false,
  p_reps_unit text default null, p_actual_sets integer default null,
  p_perceived_difficulty integer default null, p_perceived_difficulty_label text default null,
  p_notes text default null, p_completed boolean default true, p_logged_late boolean default false,
  p_status text default 'done', p_skip_reason text default null, p_entry_mode text default null,
  p_skip_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_log_id       uuid;
  v_sets         int;
  v_reps_text    text;
  v_weights_text text;
  v_weight_num   numeric;
  v_first_w      numeric;
  v_caller       uuid;
  v_source       text;
  v_owner        uuid;
  v_completed    boolean;
  v_skip_note    text;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'No autenticado'
      USING ERRCODE = 'insufficient_privilege';
  ELSIF v_caller = p_student_id THEN
    v_source := 'student';
  ELSIF public.is_coach() AND EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_student_id AND coach_id = v_caller
  ) THEN
    v_source := 'coach';
  ELSE
    RAISE EXCEPTION 'No autorizado para registrar entrenamientos de este alumno'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_student_id IS NULL OR p_plan_id IS NULL OR p_plan_exercise_id IS NULL OR p_logged_date IS NULL THEN
    RAISE EXCEPTION 'student_id, plan_id, plan_exercise_id y logged_date son obligatorios'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_weight_mode NOT IN ('with_weight', 'barbell_only', 'bodyweight') THEN
    RAISE EXCEPTION 'weight_mode inválido: %', p_weight_mode
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_reps_unit IS NOT NULL AND p_reps_unit NOT IN ('reps','pasos','respiraciones','segundos') THEN
    RAISE EXCEPTION 'reps_unit inválido: %', p_reps_unit
      USING ERRCODE = 'check_violation';
  END IF;

  -- v54 + v59
  IF p_status IS NULL OR p_status NOT IN ('done', 'skipped') THEN
    RAISE EXCEPTION 'status inválido: %', p_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_skip_reason IS NOT NULL AND p_skip_reason NOT IN ('choice', 'time', 'discomfort', 'unclear', 'other') THEN
    RAISE EXCEPTION 'skip_reason inválido: %', p_skip_reason
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_entry_mode IS NOT NULL AND p_entry_mode NOT IN ('confirmed', 'edited') THEN
    RAISE EXCEPTION 'entry_mode inválido: %', p_entry_mode
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = 'done' AND p_skip_reason IS NOT NULL THEN
    RAISE EXCEPTION 'skip_reason solo admite status=skipped'
      USING ERRCODE = 'check_violation';
  END IF;
  v_skip_note := nullif(btrim(coalesce(p_skip_note, '')), '');
  IF p_status = 'done' AND v_skip_note IS NOT NULL THEN
    RAISE EXCEPTION 'skip_note solo admite status=skipped'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = 'skipped' AND (
       (p_reps IS NOT NULL AND p_reps != '[]'::jsonb)
    OR (p_weights IS NOT NULL AND p_weights != '[]'::jsonb)
    OR p_perceived_difficulty IS NOT NULL
    OR p_entry_mode IS NOT NULL
    OR coalesce(p_actual_sets, 0) <> 0
  ) THEN
    RAISE EXCEPTION 'status=skipped no admite reps, pesos, series, PSE ni entry_mode'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_weight_mode = 'bodyweight' AND p_weights IS NOT NULL AND p_weights != '[]'::jsonb THEN
    RAISE EXCEPTION 'weight_mode=bodyweight no admite p_weights (debe ser NULL)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_reps IS NOT NULL AND p_weights IS NOT NULL
    AND jsonb_array_length(p_reps) != jsonb_array_length(p_weights) THEN
    RAISE EXCEPTION 'p_reps y p_weights deben tener la misma longitud'
      USING ERRCODE = 'check_violation';
  END IF;

  v_completed := CASE WHEN p_status = 'skipped' THEN false ELSE p_completed END;

  v_sets := COALESCE(p_actual_sets, jsonb_array_length(COALESCE(p_reps, '[]'::jsonb)));

  IF p_reps IS NOT NULL THEN
    v_reps_text := p_reps::text;
  ELSE
    v_reps_text := NULL;
  END IF;

  IF p_weights IS NOT NULL THEN
    v_weights_text := p_weights::text;
    SELECT (e.value)::numeric INTO v_first_w
      FROM jsonb_array_elements(p_weights) WITH ORDINALITY e(value, ord)
     WHERE jsonb_typeof(e.value) = 'number'
     ORDER BY ord LIMIT 1;
    v_weight_num := v_first_w;
  ELSE
    v_weights_text := NULL;
    v_weight_num := NULL;
  END IF;

  IF p_status = 'skipped' THEN
    v_sets := 0;
    v_reps_text := NULL;
    v_weights_text := NULL;
    v_weight_num := NULL;
  END IF;

  IF p_log_id IS NULL THEN
    INSERT INTO public.workout_logs (
      student_id, plan_id, plan_exercise_id, logged_date,
      actual_sets, actual_reps_jsonb, actual_weights_jsonb,
      weight_mode, unilateral, reps_unit,
      perceived_difficulty, perceived_difficulty_label,
      completed, logged_late,
      actual_reps, actual_weights, actual_weight,
      logged_by, source,
      status, skip_reason, entry_mode, skip_note
    ) VALUES (
      p_student_id, p_plan_id, p_plan_exercise_id, p_logged_date,
      v_sets,
      CASE WHEN p_status = 'skipped' THEN NULL ELSE p_reps END,
      CASE WHEN p_status = 'skipped' THEN NULL ELSE p_weights END,
      p_weight_mode, p_unilateral, p_reps_unit,
      p_perceived_difficulty, p_perceived_difficulty_label,
      v_completed, p_logged_late,
      v_reps_text, v_weights_text, v_weight_num,
      v_caller, v_source,
      p_status, p_skip_reason, p_entry_mode, v_skip_note
    )
    RETURNING id INTO v_log_id;
  ELSE
    SELECT student_id INTO v_owner FROM public.workout_logs WHERE id = p_log_id;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Log % no encontrado para UPDATE', p_log_id
        USING ERRCODE = 'no_data_found';
    END IF;
    IF v_owner != p_student_id THEN
      RAISE EXCEPTION 'El log % no pertenece al alumno indicado', p_log_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.workout_logs SET
      student_id = p_student_id,
      plan_id = p_plan_id,
      plan_exercise_id = p_plan_exercise_id,
      logged_date = p_logged_date,
      actual_sets = v_sets,
      actual_reps_jsonb = CASE WHEN p_status = 'skipped' THEN NULL ELSE p_reps END,
      actual_weights_jsonb = CASE WHEN p_status = 'skipped' THEN NULL ELSE p_weights END,
      weight_mode = p_weight_mode,
      unilateral = p_unilateral,
      reps_unit = p_reps_unit,
      perceived_difficulty = p_perceived_difficulty,
      perceived_difficulty_label = p_perceived_difficulty_label,
      completed = v_completed,
      logged_late = p_logged_late,
      actual_reps = v_reps_text,
      actual_weights = v_weights_text,
      actual_weight = v_weight_num,
      logged_by = v_caller,
      source = v_source,
      status = p_status,
      skip_reason = p_skip_reason,
      entry_mode = p_entry_mode,
      skip_note = v_skip_note
    WHERE id = p_log_id
    RETURNING id INTO v_log_id;
  END IF;

  RETURN v_log_id;
END;
$function$;

revoke all on function public.save_workout_log(
  uuid, uuid, uuid, date, text, jsonb, uuid, jsonb, boolean, text, integer, integer,
  text, text, boolean, boolean, text, text, text, text
) from public, anon;
grant execute on function public.save_workout_log(
  uuid, uuid, uuid, date, text, jsonb, uuid, jsonb, boolean, text, integer, integer,
  text, text, boolean, boolean, text, text, text, text
) to authenticated, service_role;

-- ── 4: aviso a la coach por "no sabía cómo hacerlo" ──────────
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'plan_assigned', 'activity_update', 'session_completed', 'plan_expiring', 'stagnation_alert',
  'coach_comment', 'weekly_summary', 'schema_health_alert', 'student_note', 'form_submitted',
  'plan_updated', 'profile_change', 'evaluation_completed', 'week_completed', 'plan_completed',
  'personal_best_voided', 'exercise_unclear'
]::text[]));

create or replace function public.fn_notify_skip_unclear()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_coach_id     uuid;
  v_student_name text;
  v_item_name    text;
  v_kind         text;
  v_item_id      uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'skipped' OR NEW.skip_reason IS DISTINCT FROM 'unclear' THEN
    RETURN NEW;
  END IF;
  -- En un UPDATE solo avisa si el motivo recién pasa a 'unclear'.
  IF TG_OP = 'UPDATE' AND OLD.status = 'skipped' AND OLD.skip_reason = 'unclear' THEN
    RETURN NEW;
  END IF;
  -- Si lo registró la coach, ya lo sabe.
  IF NEW.source = 'coach' THEN RETURN NEW; END IF;

  SELECT coach_id, name INTO v_coach_id, v_student_name
    FROM public.profiles WHERE id = NEW.student_id;
  IF v_coach_id IS NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'workout_logs' THEN
    v_kind := 'exercise';
    v_item_id := NEW.plan_exercise_id;
    SELECT e.name INTO v_item_name
      FROM public.plan_exercises pe
      JOIN public.exercises e ON e.id = pe.exercise_id
     WHERE pe.id = NEW.plan_exercise_id;
  ELSE
    v_kind := 'block';
    v_item_id := NEW.plan_block_id;
    SELECT coalesce(nullif(pb.title, ''), NEW.block_title) INTO v_item_name
      FROM public.plan_blocks pb WHERE pb.id = NEW.plan_block_id;
    v_item_name := coalesce(v_item_name, NEW.block_title);
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_coach_id,
    'exercise_unclear',
    coalesce(v_student_name, 'Una persona') || ' no supo cómo hacer un ejercicio',
    coalesce(v_item_name, 'Un ejercicio') || ' (' || to_char(NEW.logged_date, 'DD/MM/YYYY') || ')'
      || CASE WHEN NEW.skip_note IS NOT NULL THEN ': ' || NEW.skip_note ELSE '' END,
    jsonb_build_object(
      'student_id',   NEW.student_id,
      'student_name', v_student_name,
      'date',         NEW.logged_date,
      'plan_id',      NEW.plan_id,
      'item_kind',    v_kind,
      'item_id',      v_item_id,
      'item_name',    v_item_name,
      'skip_note',    NEW.skip_note
    )
  );
  RETURN NEW;
END;
$function$;

revoke all on function public.fn_notify_skip_unclear() from public, anon, authenticated;

drop trigger if exists trg_notify_skip_unclear on public.workout_logs;
create trigger trg_notify_skip_unclear
  after insert or update of status, skip_reason on public.workout_logs
  for each row execute function public.fn_notify_skip_unclear();

drop trigger if exists trg_notify_skip_unclear on public.workout_block_logs;
create trigger trg_notify_skip_unclear
  after insert or update of status, skip_reason on public.workout_block_logs
  for each row execute function public.fn_notify_skip_unclear();
