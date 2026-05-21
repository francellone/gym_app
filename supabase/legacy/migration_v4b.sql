-- ============================================================
-- GYM APP v4b - CORRECCIÓN FINAL
-- Ejecutar en el SQL Editor de Supabase
-- Resuelve: evaluation_results con esquema incorrecto + partes pendientes
-- ============================================================

-- ============================================================
-- 1. WORKOUT_LOGS Y WORKOUT_SESSIONS - logged_late (idempotente)
-- ============================================================
alter table public.workout_logs
  add column if not exists logged_late boolean default false;

alter table public.workout_sessions
  add column if not exists logged_late boolean default false;

-- ============================================================
-- 2. COLUMNAS FALTANTES EN profiles (idempotente)
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
-- 3. HISTORIAL DE MODIFICACIONES DE ALUMNO
-- ============================================================
create table if not exists public.student_edit_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade not null,
  changed_by uuid references public.profiles(id) not null,
  changed_at timestamptz default now(),
  field_name text not null,
  old_value text,
  new_value text
);

alter table public.student_edit_history enable row level security;

drop policy if exists "Coach can manage student edit history" on public.student_edit_history;
create policy "Coach can manage student edit history"
  on public.student_edit_history for all
  using (auth.uid() in (select id from public.profiles where role = 'coach'));

drop policy if exists "Students can view own edit history" on public.student_edit_history;
create policy "Students can view own edit history"
  on public.student_edit_history for select
  using (student_id = auth.uid());

create index if not exists idx_student_edit_history_student
  on public.student_edit_history(student_id, changed_at desc);

-- ============================================================
-- 4. EVALUATION_RESULTS - DROP y recrear con esquema correcto
--    (la tabla existente usa user_id/result_id/raw_inputs que
--     no coincide con el código nuevo)
-- ============================================================
drop table if exists public.evaluation_results cascade;

create table public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade not null,
  plan_id uuid references public.plans(id) on delete cascade not null,
  eval_date date not null default current_date,
  eval_type text not null,
  results jsonb not null default '{}',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, plan_id, eval_date)
);

alter table public.evaluation_results enable row level security;

create policy "Coach can manage all evaluation results"
  on public.evaluation_results for all
  using (auth.uid() in (select id from public.profiles where role = 'coach'));

create policy "Students can manage own evaluation results"
  on public.evaluation_results for all
  using (student_id = auth.uid());

create index idx_evaluation_results_student
  on public.evaluation_results(student_id, eval_date desc);

create index idx_evaluation_results_plan
  on public.evaluation_results(plan_id);
