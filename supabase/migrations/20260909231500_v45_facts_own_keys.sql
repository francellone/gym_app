-- v45 — Toda tabla de hechos guarda sus propias claves (cierre de la familia de v41).
--
-- Auditoría del 2026-09-09 sobre las 67 FKs del esquema: seis huecos de la misma
-- enfermedad que huerfanó 201 registros de entrenamiento. En todos, un hecho que registró
-- una alumna (o la coach) dependía de que sobreviviera una fila de configuración del plan
-- para saber qué era, y la FK lo borraba (CASCADE) o lo enmudecía (SET NULL) al editar
-- o borrar el plan. La receta es la de v41: la FK deja de destruir, el hecho recibe su
-- propia copia de lo que lo describe, y un trigger la completa en toda escritura futura.
--
--   1. evaluation_test_responses      CASCADE por casillero y por test → SET NULL
--                                     + exercise_id / exercise_name / test_snapshot propios
--   3. plan_exercise_prescription_history  CASCADE por casillero y por plan → SET NULL
--                                     + exercise_id / exercise_name propios
--   4. workout_block_logs.plan_block_id    NOT NULL con SET NULL (contradicción: borrar un
--                                     bloque con registros fallaba con 23502) → nullable
--                                     + section / block_type / block_title propios
--   5. evaluation_tests.exercise_id   SET NULL → RESTRICT + trigger que completa exercise_name
--   6. intake_form_submissions.assignment_id  CASCADE → SET NULL (la submission ya es
--                                     autocontenida: form_snapshot + responses)
--   7. notes.author_id                NOT NULL con SET NULL (misma contradicción que 4)
--
-- Regla: un borrado que se lleva puesto el historial es un bug de diseño, no un dato menos.
-- Un ejercicio del catálogo referenciado por un hecho no se puede borrar (RESTRICT): en la
-- siguiente tanda se archiva o se fusiona, nunca se borra.


-- ============================================================================
-- 1. evaluation_test_responses — el resultado de la evaluación de la alumna
-- ============================================================================

alter table public.evaluation_test_responses
  add column if not exists exercise_id   uuid,
  add column if not exists exercise_name text,
  add column if not exists test_snapshot jsonb;

-- Las dos FKs que borraban la respuesta entera al editar el plan.
alter table public.evaluation_test_responses
  drop constraint if exists evaluation_test_responses_plan_exercise_id_fkey;
alter table public.evaluation_test_responses
  add constraint evaluation_test_responses_plan_exercise_id_fkey
  foreign key (plan_exercise_id) references public.plan_exercises(id) on delete set null;

alter table public.evaluation_test_responses
  drop constraint if exists evaluation_test_responses_test_id_fkey;
alter table public.evaluation_test_responses
  add constraint evaluation_test_responses_test_id_fkey
  foreign key (test_id) references public.evaluation_tests(id) on delete set null;

-- El ejercicio propio: RESTRICT, como en workout_logs.
alter table public.evaluation_test_responses
  drop constraint if exists evaluation_test_responses_exercise_id_fkey;
alter table public.evaluation_test_responses
  add constraint evaluation_test_responses_exercise_id_fkey
  foreign key (exercise_id) references public.exercises(id) on delete restrict;

-- Backfill post-cutover (respuestas que cuelgan de un casillero de plan_exercises).
update public.evaluation_test_responses r
   set exercise_id   = pe.exercise_id,
       exercise_name = e.name,
       test_snapshot = jsonb_strip_nulls(jsonb_build_object(
         'source',         'plan_exercise',
         'eval_type',      pe.eval_type,
         'eval_method',    pe.eval_method,
         'expected_value', pe.expected_value,
         'expected_unit',  pe.expected_unit,
         'section',        pe.section,
         'order_index',    pe.order_index))
  from public.plan_exercises pe
  join public.exercises e on e.id = pe.exercise_id
 where pe.id = r.plan_exercise_id
   and r.exercise_id is null;

-- Backfill pre-cutover (respuestas que cuelgan de evaluation_tests).
update public.evaluation_test_responses r
   set exercise_id   = t.exercise_id,
       exercise_name = coalesce(t.exercise_name, e.name),
       test_snapshot = jsonb_strip_nulls(jsonb_build_object(
         'source',         'evaluation_test',
         'test_type',      t.test_type,
         'expected_value', t.expected_value,
         'expected_unit',  t.expected_unit,
         'order_index',    t.order_index))
  from public.evaluation_tests t
  left join public.exercises e on e.id = t.exercise_id
 where t.id = r.test_id
   and r.exercise_id is null;

create index if not exists idx_evaluation_test_responses_exercise_id
  on public.evaluation_test_responses (exercise_id);

create or replace function public.evaluation_test_responses_sync_exercise()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_changed_pe   boolean := tg_op = 'INSERT' or new.plan_exercise_id is distinct from old.plan_exercise_id;
  v_changed_test boolean := tg_op = 'INSERT' or new.test_id is distinct from old.test_id;
begin
  -- Se completa desde el casillero cuando hay casillero y falta el dato, o cuando el
  -- casillero cambió. Nunca se pisa lo guardado cuando la FK anula el padre.
  if new.plan_exercise_id is not null and (new.exercise_id is null or v_changed_pe) then
    select pe.exercise_id, e.name,
           jsonb_strip_nulls(jsonb_build_object(
             'source',         'plan_exercise',
             'eval_type',      pe.eval_type,
             'eval_method',    pe.eval_method,
             'expected_value', pe.expected_value,
             'expected_unit',  pe.expected_unit,
             'section',        pe.section,
             'order_index',    pe.order_index))
      into new.exercise_id, new.exercise_name, new.test_snapshot
      from public.plan_exercises pe
      join public.exercises e on e.id = pe.exercise_id
     where pe.id = new.plan_exercise_id;
  elsif new.test_id is not null and (new.exercise_id is null or v_changed_test) then
    select t.exercise_id, coalesce(t.exercise_name, e.name),
           jsonb_strip_nulls(jsonb_build_object(
             'source',         'evaluation_test',
             'test_type',      t.test_type,
             'expected_value', t.expected_value,
             'expected_unit',  t.expected_unit,
             'order_index',    t.order_index))
      into new.exercise_id, new.exercise_name, new.test_snapshot
      from public.evaluation_tests t
      left join public.exercises e on e.id = t.exercise_id
     where t.id = new.test_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_evaluation_test_responses_sync_exercise on public.evaluation_test_responses;
create trigger trg_evaluation_test_responses_sync_exercise
  before insert or update on public.evaluation_test_responses
  for each row execute function public.evaluation_test_responses_sync_exercise();

comment on column public.evaluation_test_responses.exercise_id is
  'Ejercicio del catálogo, guardado en la propia respuesta (v45). Sobrevive al borrado del casillero o del test. Lo completa trg_evaluation_test_responses_sync_exercise.';
comment on column public.evaluation_test_responses.test_snapshot is
  'Copia de la prescripción de la prueba al momento de responder (v45): eval_type, eval_method, expected_value, expected_unit, section, order_index.';


-- ============================================================================
-- 3. plan_exercise_prescription_history — el "por qué cambié la carga" de la coach
-- ============================================================================

alter table public.plan_exercise_prescription_history
  add column if not exists exercise_id   uuid,
  add column if not exists exercise_name text;

alter table public.plan_exercise_prescription_history
  alter column plan_exercise_id drop not null,
  alter column plan_id          drop not null;

alter table public.plan_exercise_prescription_history
  drop constraint if exists plan_exercise_prescription_history_plan_exercise_id_fkey;
alter table public.plan_exercise_prescription_history
  add constraint plan_exercise_prescription_history_plan_exercise_id_fkey
  foreign key (plan_exercise_id) references public.plan_exercises(id) on delete set null;

alter table public.plan_exercise_prescription_history
  drop constraint if exists plan_exercise_prescription_history_plan_id_fkey;
alter table public.plan_exercise_prescription_history
  add constraint plan_exercise_prescription_history_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete set null;

alter table public.plan_exercise_prescription_history
  drop constraint if exists plan_exercise_prescription_history_exercise_id_fkey;
alter table public.plan_exercise_prescription_history
  add constraint plan_exercise_prescription_history_exercise_id_fkey
  foreign key (exercise_id) references public.exercises(id) on delete restrict;

update public.plan_exercise_prescription_history h
   set exercise_id   = pe.exercise_id,
       exercise_name = e.name
  from public.plan_exercises pe
  join public.exercises e on e.id = pe.exercise_id
 where pe.id = h.plan_exercise_id
   and h.exercise_id is null;

create index if not exists idx_plan_exercise_prescription_history_exercise_id
  on public.plan_exercise_prescription_history (exercise_id);

create or replace function public.prescription_history_sync_exercise()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.plan_exercise_id is not null
     and (new.exercise_id is null
          or tg_op = 'INSERT'
          or new.plan_exercise_id is distinct from old.plan_exercise_id) then
    select pe.exercise_id, e.name
      into new.exercise_id, new.exercise_name
      from public.plan_exercises pe
      join public.exercises e on e.id = pe.exercise_id
     where pe.id = new.plan_exercise_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_prescription_history_sync_exercise on public.plan_exercise_prescription_history;
create trigger trg_prescription_history_sync_exercise
  before insert or update on public.plan_exercise_prescription_history
  for each row execute function public.prescription_history_sync_exercise();


-- ============================================================================
-- 4. workout_block_logs — el registro de un bloque (aeróbico / circuito)
-- ============================================================================

alter table public.workout_block_logs
  add column if not exists section     text,
  add column if not exists block_type  text,
  add column if not exists block_title text;

-- NOT NULL + ON DELETE SET NULL era una contradicción: el borrado del bloque fallaba.
alter table public.workout_block_logs
  alter column plan_block_id drop not null;

update public.workout_block_logs l
   set section     = b.section,
       block_type  = b.block_type,
       block_title = b.title
  from public.plan_blocks b
 where b.id = l.plan_block_id
   and l.section is null;

create or replace function public.workout_block_logs_sync_block()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.plan_block_id is not null
     and (new.section is null
          or tg_op = 'INSERT'
          or new.plan_block_id is distinct from old.plan_block_id) then
    select b.section, b.block_type, b.title
      into new.section, new.block_type, new.block_title
      from public.plan_blocks b
     where b.id = new.plan_block_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_workout_block_logs_sync_block on public.workout_block_logs;
create trigger trg_workout_block_logs_sync_block
  before insert or update on public.workout_block_logs
  for each row execute function public.workout_block_logs_sync_block();

comment on column public.workout_block_logs.section is
  'Sección del plan (day_a, day_b...) copiada del bloque al registrar (v45). Sobrevive al borrado del bloque.';


-- ============================================================================
-- 5. evaluation_tests — configuración pre-cutover, pero con respuestas colgando
-- ============================================================================

alter table public.evaluation_tests
  drop constraint if exists evaluation_tests_exercise_id_fkey;
alter table public.evaluation_tests
  add constraint evaluation_tests_exercise_id_fkey
  foreign key (exercise_id) references public.exercises(id) on delete restrict;

update public.evaluation_tests t
   set exercise_name = e.name
  from public.exercises e
 where e.id = t.exercise_id
   and t.exercise_name is null;

create or replace function public.evaluation_tests_sync_exercise_name()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.exercise_id is not null
     and (new.exercise_name is null
          or tg_op = 'INSERT'
          or new.exercise_id is distinct from old.exercise_id) then
    select e.name into new.exercise_name
      from public.exercises e
     where e.id = new.exercise_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_evaluation_tests_sync_exercise_name on public.evaluation_tests;
create trigger trg_evaluation_tests_sync_exercise_name
  before insert or update on public.evaluation_tests
  for each row execute function public.evaluation_tests_sync_exercise_name();


-- ============================================================================
-- 6. intake_form_submissions — la respuesta al formulario ya es autocontenida
-- ============================================================================

alter table public.intake_form_submissions
  alter column assignment_id drop not null;

alter table public.intake_form_submissions
  drop constraint if exists intake_form_submissions_assignment_id_fkey;
alter table public.intake_form_submissions
  add constraint intake_form_submissions_assignment_id_fkey
  foreign key (assignment_id) references public.intake_form_assignments(id) on delete set null;


-- ============================================================================
-- 7. notes.author_id — NOT NULL con ON DELETE SET NULL
-- ============================================================================

alter table public.notes
  alter column author_id drop not null;


-- ============================================================================
-- Uso de un ejercicio del catálogo — para la biblioteca (aviso antes de borrar) y para
-- el preview de la fusión de duplicados (tanda 2). Cuenta bajo la RLS del que llama.
-- ============================================================================

create or replace function public.exercise_usage(p_exercise_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'workout_logs',        (select count(*) from public.workout_logs                       where exercise_id = p_exercise_id),
    'eval_responses',      (select count(*) from public.evaluation_test_responses          where exercise_id = p_exercise_id),
    'eval_tests',          (select count(*) from public.evaluation_tests                   where exercise_id = p_exercise_id),
    'prescription_history',(select count(*) from public.plan_exercise_prescription_history where exercise_id = p_exercise_id),
    'plan_exercises',      (select count(*) from public.plan_exercises                     where exercise_id = p_exercise_id),
    'plans',               (select count(distinct plan_id) from public.plan_exercises      where exercise_id = p_exercise_id),
    'notes',               (select count(*) from public.notes                              where exercise_id = p_exercise_id)
  );
$function$;

grant execute on function public.exercise_usage(uuid) to authenticated;

comment on function public.exercise_usage(uuid) is
  'Cuántas filas referencian a un ejercicio del catálogo, por tabla (v45). workout_logs, eval_responses, eval_tests y prescription_history son RESTRICT: con cualquiera > 0 el ejercicio no se puede borrar.';
