-- v41 — El registro de entrenamiento guarda su propio ejercicio del catálogo.
--
-- Antes, workout_logs solo apuntaba a plan_exercises (el "casillero" del plan) y el
-- ejercicio del catálogo se resolvía en dos saltos. Al borrar un ejercicio del plan
-- (edición del plan o re-asignación de la plantilla), la FK ON DELETE SET NULL dejaba
-- el registro sin casillero y, de rebote, sin ejercicio: 201 filas históricas quedaron
-- invisibles en toda la app (tabla de Progreso, gráficos e informe cuelgan de ahí).
--
-- APLICADA EN PRODUCCIÓN el 2026-09-06 (backfill: 3135 de 3336 filas; las 201 restantes
-- son las que ya habían perdido el casillero y no tienen de dónde recuperar el ejercicio).

alter table public.workout_logs
  add column if not exists exercise_id uuid;

-- RESTRICT: un ejercicio del catálogo con entrenamientos registrados no se borra.
-- (plan_exercises.exercise_id es ON DELETE CASCADE, así que sin este freno borrar un
--  ejercicio del catálogo arrastraba los casilleros y huerfanaba todos sus registros.)
alter table public.workout_logs
  drop constraint if exists workout_logs_exercise_id_fkey;
alter table public.workout_logs
  add constraint workout_logs_exercise_id_fkey
  foreign key (exercise_id) references public.exercises(id) on delete restrict;

-- Backfill: todo registro que todavía tiene casillero hereda su ejercicio.
update public.workout_logs wl
   set exercise_id = pe.exercise_id
  from public.plan_exercises pe
 where pe.id = wl.plan_exercise_id
   and wl.exercise_id is null;

create index if not exists idx_workout_logs_exercise_id
  on public.workout_logs (exercise_id);
create index if not exists idx_workout_logs_student_exercise_date
  on public.workout_logs (student_id, exercise_id, logged_date);

-- Garantía para toda escritura futura, venga de la RPC save_workout_log o de donde venga.
create or replace function public.workout_logs_sync_exercise_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.plan_exercise_id is not null and new.exercise_id is null then
      select pe.exercise_id into new.exercise_id
        from public.plan_exercises pe
       where pe.id = new.plan_exercise_id;
    end if;
  else
    -- No se pisa un exercise_id ya guardado cuando la FK anula el casillero.
    if new.plan_exercise_id is not null
       and (new.exercise_id is null
            or new.plan_exercise_id is distinct from old.plan_exercise_id) then
      select pe.exercise_id into new.exercise_id
        from public.plan_exercises pe
       where pe.id = new.plan_exercise_id;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_workout_logs_sync_exercise_id on public.workout_logs;
create trigger trg_workout_logs_sync_exercise_id
  before insert or update on public.workout_logs
  for each row execute function public.workout_logs_sync_exercise_id();

comment on column public.workout_logs.exercise_id is
  'Ejercicio del catálogo, guardado en el propio registro (v41). Sobrevive al borrado del plan_exercise. Lo completa el trigger trg_workout_logs_sync_exercise_id.';
