-- ============================================================
-- GYM APP - SUPABASE SCHEMA
-- ============================================================
-- Ejecutar este script en el SQL Editor de Supabase

-- Habilitar extensiones necesarias
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extiende auth.users de Supabase)
-- ============================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text,
  role text not null default 'student' check (role in ('coach', 'student')),
  dni text,
  birth_date date,
  gender text,
  height_cm numeric,
  weight_kg numeric,
  level text check (level in ('beginner', 'intermediate', 'advanced')),
  weekly_frequency int,
  goal text,
  coach_notes text, -- PRIVADO: solo visible para el coach
  target_weight_kg numeric,
  avatar_url text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger para actualizar updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ============================================================
-- EXERCISES (biblioteca de ejercicios)
-- ============================================================
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  muscle_group text,
  video_url text,
  default_sets int,
  default_reps text,
  default_weight text,
  technique_notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ============================================================
-- PLANS (plantillas de entrenamiento)
-- ============================================================
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  goal text,
  sessions_per_week int default 3,
  duration_weeks int,
  is_template boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger plans_updated_at
  before update on plans
  for each row execute function update_updated_at();

-- ============================================================
-- PLAN ASSIGNMENTS (asignaciones de plan a alumno)
-- ============================================================
create table public.plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  start_date date,
  end_date date,
  active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- PLAN EXERCISES (ejercicios dentro de cada plan)
-- ============================================================
create table public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade,
  exercise_id uuid references exercises(id) on delete cascade,
  section text not null, -- 'activation', 'day_a', 'day_b'
  block_label text,       -- 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'
  order_index int default 0,
  suggested_sets int,
  suggested_reps text,     -- puede ser "8", "[8,10,12]" (JSON array por serie)
  suggested_weight text,   -- legacy: peso único de referencia (retrocompat)
  suggested_weights text,  -- pesos por serie como JSON array. Ej: "[20,22.5,25]"
  rest_time text,          -- "1 min 30 seg"
  suggested_pse text,      -- "DURO (5-6)", "MUY DURO (7-9)"
  extra_notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- WORKOUT LOGS (registros de entrenamiento del alumno)
-- ============================================================
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  plan_id uuid references plans(id),
  plan_exercise_id uuid references plan_exercises(id),
  logged_date date not null default current_date,
  actual_sets int,
  actual_reps text,
  actual_weight numeric,
  perceived_difficulty int check (perceived_difficulty between 1 and 10),
  perceived_difficulty_label text,
  notes text,
  completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger workout_logs_updated_at
  before update on workout_logs
  for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitar RLS en todas las tablas
alter table profiles enable row level security;
alter table exercises enable row level security;
alter table plans enable row level security;
alter table plan_assignments enable row level security;
alter table plan_exercises enable row level security;
alter table workout_logs enable row level security;

-- PROFILES: El coach ve todos, el alumno solo se ve a sí mismo
create policy "Coach can view all profiles"
  on profiles for select
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

create policy "Students can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Coach can update all profiles"
  on profiles for update
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Coach can insert profiles"
  on profiles for insert
  with check (
    auth.uid() in (select id from profiles where role = 'coach')
    or auth.uid() = id
  );

-- EXERCISES: Todos los autenticados pueden ver, solo el coach puede crear/editar
create policy "Authenticated users can view exercises"
  on exercises for select
  using (auth.role() = 'authenticated');

create policy "Coach can manage exercises"
  on exercises for all
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

-- PLANS: El coach puede todo, el alumno ve planes asignados
create policy "Coach can manage plans"
  on plans for all
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

create policy "Students can view assigned plans"
  on plans for select
  using (
    id in (
      select plan_id from plan_assignments
      where student_id = auth.uid() and active = true
    )
  );

-- PLAN ASSIGNMENTS: Coach puede todo, alumno ve las suyas
create policy "Coach can manage assignments"
  on plan_assignments for all
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

create policy "Students can view own assignments"
  on plan_assignments for select
  using (student_id = auth.uid());

-- PLAN EXERCISES: Coach puede todo, alumno ve los de sus planes
create policy "Coach can manage plan exercises"
  on plan_exercises for all
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

create policy "Students can view plan exercises of assigned plans"
  on plan_exercises for select
  using (
    plan_id in (
      select plan_id from plan_assignments
      where student_id = auth.uid() and active = true
    )
  );

-- WORKOUT LOGS: Coach ve todos, alumno solo los suyos
create policy "Coach can view all workout logs"
  on workout_logs for select
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

create policy "Students can manage own workout logs"
  on workout_logs for all
  using (student_id = auth.uid());

create policy "Coach can update all workout logs"
  on workout_logs for update
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

-- ============================================================
-- FUNCIÓN: auto-crear profile al registrar usuario
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ÍNDICES para mejorar performance
-- ============================================================
create index idx_plan_assignments_student on plan_assignments(student_id);
create index idx_plan_assignments_plan on plan_assignments(plan_id);
create index idx_plan_exercises_plan on plan_exercises(plan_id);
create index idx_workout_logs_student on workout_logs(student_id);
create index idx_workout_logs_date on workout_logs(logged_date);
create index idx_workout_logs_plan_exercise on workout_logs(plan_exercise_id);
