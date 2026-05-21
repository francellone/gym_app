-- ============================================================
-- GYM APP v3 - MIGRATION: Sistema de Evaluaciones
-- ============================================================
-- Ejecutar en Supabase SQL Editor DESPUÉS de migration_v2.sql
-- ============================================================

-- 1. Agregar tipo de plan y tipo de evaluación a la tabla plans
alter table public.plans
  add column if not exists plan_type text default 'training'
    check (plan_type in ('training', 'evaluation')),
  add column if not exists eval_type text;
  -- eval_type opciones: 'movement_screen', 'strength_amrap', 'strength_1rm',
  --   'flexibility_rom', 'jump', 'cardio_cooper', 'body_comp', 'custom'

-- 2. Tabla de resultados de evaluación (resultados flexibles en jsonb)
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

create trigger evaluation_results_updated_at
  before update on evaluation_results
  for each row execute function update_updated_at();

-- RLS
alter table evaluation_results enable row level security;

create policy "Coach can manage all evaluation results"
  on evaluation_results for all
  using (auth.uid() in (select id from profiles where role = 'coach'));

create policy "Students can view own evaluation results"
  on evaluation_results for select
  using (student_id = auth.uid());

create policy "Students can insert own evaluation results"
  on evaluation_results for insert
  with check (student_id = auth.uid());

create policy "Students can update own evaluation results"
  on evaluation_results for update
  using (student_id = auth.uid());

-- Índices
create index if not exists idx_eval_results_student on evaluation_results(student_id);
create index if not exists idx_eval_results_plan on evaluation_results(plan_id);
create index if not exists idx_eval_results_date on evaluation_results(eval_date);
