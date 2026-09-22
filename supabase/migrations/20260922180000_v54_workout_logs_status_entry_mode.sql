-- ============================================================
-- v54 — registro por confirmación + omitir ejercicio (fundamento en DB)
-- ------------------------------------------------------------
-- CONTEXTO (Franco + Anto, 2026-09-15 → 2026-09-22): la pantalla de
-- registro pasa a mostrar lo prescripto en modo lectura con tres salidas:
-- CONFIRMAR (lo hice tal cual), AJUSTAR (lo hice distinto, recién ahí se
-- abren los campos) y NO LO HICE (con motivo). Hoy la única forma de
-- "cerrar" un día con un ejercicio omitido es inventar un registro en
-- cero: hay 31 workout_logs así en producción.
--
-- Esta migración agrega tres columnas a las DOS tablas de hechos de
-- entrenamiento (workout_logs por ejercicio, workout_block_logs por
-- bloque de circuito/aeróbico):
--
--   status      'done' | 'skipped'          — hecho u omitido
--   skip_reason 'choice' | 'time' | 'discomfort' — motivo de la omisión
--   entry_mode  'confirmed' | 'edited'      — confirmó lo prescripto o ajustó
--
-- DECISIÓN DE MODELADO: el registro omitido va con completed = false.
-- Hay ~20 lectores de `completed` en el front que miden entrenamiento
-- real (volumen, progresión, "última vez", tabla de progreso, informe).
-- Con completed=false todos quedan correctos sin tocarlos, y un olvido
-- falla hacia el lado que NO inventa datos. Lo que cambia es solo la
-- lógica de cierre del día (front, Etapa 2), que pasa a considerar
-- "resuelto" = completed OR status='skipped'.
--
-- La omisión se modela con reps/pesos/minutos en NULL, nunca en 0:
-- calculate_log_volume devuelve NULL con reps NULL, así que la omisión
-- sale del volumen sola.
--
-- Además:
--   3) save_workout_log recibe los tres campos (params nuevos al final,
--      con default → compatible con el front actual). Se DROPea la firma
--      vieja antes de crear la nueva: CREATE OR REPLACE con otra lista de
--      argumentos crea un OVERLOAD, y PostgREST no podría elegir entre
--      las dos al llamar con argumentos nombrados.
--   4) fn_notify_workout_activity ignora las filas omitidas: si lo
--      primero que hace la persona en el día es declarar una omisión,
--      hoy la coach recibiría "X registró actividad hoy".
--
-- No hay RPC para workout_block_logs (el front escribe directo por
-- PostgREST con RLS): ahí alcanza con las columnas.
-- ============================================================

-- ------------------------------------------------------------
-- 1) workout_logs
-- ------------------------------------------------------------
alter table public.workout_logs
  add column if not exists status text not null default 'done',
  add column if not exists skip_reason text,
  add column if not exists entry_mode text;

alter table public.workout_logs
  drop constraint if exists workout_logs_status_check,
  add constraint workout_logs_status_check
    check (status in ('done', 'skipped'));

alter table public.workout_logs
  drop constraint if exists workout_logs_skip_reason_check,
  add constraint workout_logs_skip_reason_check
    check (skip_reason is null or skip_reason in ('choice', 'time', 'discomfort'));

alter table public.workout_logs
  drop constraint if exists workout_logs_entry_mode_check,
  add constraint workout_logs_entry_mode_check
    check (entry_mode is null or entry_mode in ('confirmed', 'edited'));

-- Coherencia: hecho ⇒ sin motivo. Omitido ⇒ no completado, sin modo de
-- carga y sin ningún dato de ejecución (NULL, nunca 0).
alter table public.workout_logs
  drop constraint if exists workout_logs_status_coherence,
  add constraint workout_logs_status_coherence check (
    (status = 'done' and skip_reason is null)
    or
    (status = 'skipped'
      and completed is not true
      and entry_mode is null
      and actual_reps_jsonb is null
      and actual_weights_jsonb is null
      and actual_reps is null
      and actual_weights is null
      and actual_weight is null
      and coalesce(actual_sets, 0) = 0
      and perceived_difficulty is null)
  );

create index if not exists workout_logs_skipped_idx
  on public.workout_logs (student_id, logged_date)
  where status = 'skipped';

comment on column public.workout_logs.status is
  'v54. done = lo hizo (con o sin ajustes). skipped = declaró que no lo hizo; va con completed=false y sin datos de ejecución.';
comment on column public.workout_logs.skip_reason is
  'v54. Motivo de la omisión: choice (eligió no hacerlo), time (no llegó), discomfort (le molestaba algo). Solo con status=skipped.';
comment on column public.workout_logs.entry_mode is
  'v54. confirmed = confirmó lo prescripto de un toque; edited = abrió los campos y ajustó. NULL en registros anteriores a v54 y en omitidos.';

-- ------------------------------------------------------------
-- 2) workout_block_logs (circuito y aeróbico, registro por bloque)
-- ------------------------------------------------------------
alter table public.workout_block_logs
  add column if not exists status text not null default 'done',
  add column if not exists skip_reason text,
  add column if not exists entry_mode text;

alter table public.workout_block_logs
  drop constraint if exists workout_block_logs_status_check,
  add constraint workout_block_logs_status_check
    check (status in ('done', 'skipped'));

alter table public.workout_block_logs
  drop constraint if exists workout_block_logs_skip_reason_check,
  add constraint workout_block_logs_skip_reason_check
    check (skip_reason is null or skip_reason in ('choice', 'time', 'discomfort'));

alter table public.workout_block_logs
  drop constraint if exists workout_block_logs_entry_mode_check,
  add constraint workout_block_logs_entry_mode_check
    check (entry_mode is null or entry_mode in ('confirmed', 'edited'));

alter table public.workout_block_logs
  drop constraint if exists workout_block_logs_status_coherence,
  add constraint workout_block_logs_status_coherence check (
    (status = 'done' and skip_reason is null)
    or
    (status = 'skipped'
      and completed is not true
      and entry_mode is null
      and actual_minutes is null
      and actual_rounds is null
      and perceived_difficulty is null)
  );

create index if not exists workout_block_logs_skipped_idx
  on public.workout_block_logs (student_id, logged_date)
  where status = 'skipped';

comment on column public.workout_block_logs.status is
  'v54. done = lo hizo. skipped = declaró que no hizo el bloque; va con completed=false y sin minutos/rondas/PSE.';
comment on column public.workout_block_logs.skip_reason is
  'v54. Motivo de la omisión: choice / time / discomfort. Solo con status=skipped.';
comment on column public.workout_block_logs.entry_mode is
  'v54. confirmed = confirmó lo prescripto; edited = ajustó. NULL en registros anteriores a v54 y en omitidos.';

-- ------------------------------------------------------------
-- 3) save_workout_log — tres parámetros nuevos, al final y con default
-- ------------------------------------------------------------
-- DROP explícito de la firma de 16 params (v33). Sin esto quedarían dos
-- funciones y PostgREST fallaría con "could not choose best candidate".
drop function if exists public.save_workout_log(
  uuid, uuid, uuid, date, text, jsonb, uuid, jsonb, boolean, text,
  integer, integer, text, text, boolean, boolean
);

create or replace function public.save_workout_log(
  p_student_id uuid,
  p_plan_id uuid,
  p_plan_exercise_id uuid,
  p_logged_date date,
  p_weight_mode text,
  p_reps jsonb,
  p_log_id uuid default null,
  p_weights jsonb default null,
  p_unilateral boolean default false,
  p_reps_unit text default null,
  p_actual_sets integer default null,
  p_perceived_difficulty integer default null,
  p_perceived_difficulty_label text default null,
  p_notes text default null,
  p_completed boolean default true,
  p_logged_late boolean default false,
  p_status text default 'done',
  p_skip_reason text default null,
  p_entry_mode text default null
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
BEGIN
  -- Autorización (v33): caller debe ser el alumno o su coach asignado.
  -- `source` se deriva del rol; NUNCA es parámetro (no spoofeable).
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

  -- v54: estado, motivo y modo de carga
  IF p_status IS NULL OR p_status NOT IN ('done', 'skipped') THEN
    RAISE EXCEPTION 'status inválido: %', p_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_skip_reason IS NOT NULL AND p_skip_reason NOT IN ('choice', 'time', 'discomfort') THEN
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
  -- Un omitido no lleva datos de ejecución. Se rechaza en vez de limpiar en
  -- silencio: si el front manda reps con status=skipped, algo está mal ahí.
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

  -- Omitido ⇒ completed=false siempre, decida lo que decida el caller.
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

  -- Omitido: la RPC normaliza a NULL (y no a '[]') para que el CHECK de
  -- coherencia y calculate_log_volume lo lean como "sin datos".
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
      status, skip_reason, entry_mode
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
      p_status, p_skip_reason, p_entry_mode
    )
    RETURNING id INTO v_log_id;
  ELSE
    -- El log a actualizar debe pertenecer al alumno declarado
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
      logged_by = v_caller,   -- último que escribió
      source = v_source,
      status = p_status,
      skip_reason = p_skip_reason,
      entry_mode = p_entry_mode
    WHERE id = p_log_id
    RETURNING id INTO v_log_id;
  END IF;

  -- p_notes ignorado intencionalmente (v26d). Si el caller necesita
  -- guardar una nota, debe llamar a notes.postWorkoutLogNote después.
  RETURN v_log_id;
END;
$function$;

-- Mismos permisos que la firma anterior (v33): nunca anon ni PUBLIC.
revoke execute on function public.save_workout_log(
  uuid, uuid, uuid, date, text, jsonb, uuid, jsonb, boolean, text,
  integer, integer, text, text, boolean, boolean, text, text, text
) from anon, public;
grant execute on function public.save_workout_log(
  uuid, uuid, uuid, date, text, jsonb, uuid, jsonb, boolean, text,
  integer, integer, text, text, boolean, boolean, text, text, text
) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4) fn_notify_workout_activity — una omisión no es actividad
-- ------------------------------------------------------------
create or replace function public.fn_notify_workout_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_coach_id     uuid;
  v_student_name text;
  v_log_count    int;
BEGIN
  -- v33: si el registro lo cargó el coach, no notificarlo (se auto-notificaría)
  IF NEW.source = 'coach' THEN RETURN NEW; END IF;
  -- v54: declarar "no lo hice" no es actividad
  IF NEW.status = 'skipped' THEN RETURN NEW; END IF;

  SELECT coach_id INTO v_coach_id
    FROM public.profiles
   WHERE id = NEW.student_id;

  IF v_coach_id IS NULL THEN RETURN NEW; END IF;

  -- Primer registro HECHO del día (las omisiones no cuentan)
  SELECT COUNT(*) INTO v_log_count
    FROM public.workout_logs
   WHERE student_id  = NEW.student_id
     AND logged_date = NEW.logged_date
     AND status <> 'skipped';

  IF v_log_count = 1 THEN
    SELECT name INTO v_student_name
      FROM public.profiles WHERE id = NEW.student_id;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_coach_id,
      'activity_update',
      v_student_name || ' registró actividad hoy',
      'Tiene registros del ' || to_char(NEW.logged_date, 'DD/MM/YYYY') || ' para revisar.',
      jsonb_build_object(
        'student_id',   NEW.student_id,
        'student_name', v_student_name,
        'date',         NEW.logged_date
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;
