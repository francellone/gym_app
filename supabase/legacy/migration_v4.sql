-- ============================================================
-- GYM APP v4 - MIGRATION
-- Fixes de esquema + nuevas funcionalidades
-- Ejecutar DESPUÉS de migration_v2.sql y migration_v3.sql
-- ============================================================

-- ============================================================
-- 1. COLUMNAS FALTANTES EN plan_exercises
--    El esquema original solo tenía day_label, order, activation.
--    La UI v2 usa section, block_label, order_index,
--    suggested_sets/reps/weight, rest_time, suggested_pse, extra_notes
-- ============================================================
alter table public.plan_exercises
  add column if not exists section text,
  add column if not exists block_label text,
  add column if not exists order_index int default 0,
  add column if not exists suggested_sets int,
  add column if not exists suggested_reps text,
  add column if not exists suggested_weight text,
  add column if not exists rest_time text,
  add column if not exists suggested_pse text,
  add column if not exists extra_notes text;

-- Migrar datos existentes:
-- activation(boolean) → section('activation'|'day_a')
-- day_label           → block_label
-- order               → order_index
update public.plan_exercises
  set section = case
    when activation = true then 'activation'
    else 'day_a'
  end
where section is null;

update public.plan_exercises
  set block_label = day_label
where block_label is null and day_label is not null;

-- ============================================================
-- 2. COLUMNAS FALTANTES EN plans
--    plan_type y eval_type (estaban en v3, por si no se corrió)
-- ============================================================
alter table public.plans
  add column if not exists plan_type text default 'training'
    check (plan_type in ('training', 'evaluation')),
  add column if not exists eval_type text;

-- ============================================================
-- 3. LOGGED_LATE EN workout_logs Y workout_sessions
--    Marca cuando el alumno registra un entrenamiento con retraso
-- ============================================================
alter table public.workout_logs
  add column if not exists logged_late boolean default false;

alter table public.workout_sessions
  add column if not exists logged_late boolean default false;

-- ============================================================
-- 4. HISTORIAL DE MODIFICACIONES DE ALUMNO
--    Registra cada vez que el coach edita datos del perfil
-- ============================================================
create table if not exists public.student_edit_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade not null,
  changed_by uuid references profiles(id) not null,
  changed_at timestamptz default now(),
  field_name text not null,
  old_value text,
  new_value text
);

alter table student_edit_history enable row level security;

create policy "Coach can manage student edit history"
  on student_edit_history for all
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

create index if not exists idx_student_edit_history_student
  on student_edit_history(student_id, changed_at desc);

-- ============================================================
-- 5. COLUMNAS FALTANTES EN profiles
--    Datos de alumno agregados en v2 UI
-- ============================================================
alter table public.profiles
  add column if not exists gender text,
  add column if not exists birth_date date,
  add column if not exists height_cm numeric(5,1),
  add column if not exists weight_kg numeric(5,2),
  add column if not exists target_weight_kg numeric(5,2),
  add column if not exists dni text,
  add column if not exists weekly_frequency int,
  add column if not exists coach_notes text,
  add column if not exists level text,
  add column if not exists goal text,
  add column if not exists observations text;

-- ============================================================
-- 6. EVALUATION_RESULTS (en caso de que v3 no se haya corrido)
-- ============================================================
create table if not exists public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  plan_id uuid references plans(id) on delete cascade,
  eval_date date not null default current_date,
  eval_type text not null,
  results jsonb not null default '{}',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, plan_id, eval_date)
);

-- RLS para evaluation_results (en caso de que no exista)
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'evaluation_results'
  ) then
    alter table evaluation_results enable row level security;

    execute 'create policy "Coach can view all evaluation results"
      on evaluation_results for all
      using (auth.uid() in (select id from profiles where role = ''coach''))';

    execute 'create policy "Students can manage own evaluation results"
      on evaluation_results for all
      using (student_id = auth.uid())';
  end if;
end$$;
