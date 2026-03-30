-- ============================================================
-- GYM APP v2 - MIGRATION
-- ============================================================
-- Ejecutar este script en el SQL Editor de Supabase
-- DESPUÉS de haber corrido schema.sql (v1)
-- ============================================================

-- ============================================================
-- 1. ETIQUETAS PERSONALIZADAS POR COACH
--    Reemplaza el campo estático muscle_group con tags flexibles
-- ============================================================
create table if not exists public.exercise_tags (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references profiles(id) on delete cascade,
  name text not null,
  color text default '#6366f1',
  created_at timestamptz default now(),
  unique(coach_id, name)
);

create table if not exists public.exercise_tag_assignments (
  exercise_id uuid references exercises(id) on delete cascade,
  tag_id uuid references exercise_tags(id) on delete cascade,
  primary key (exercise_id, tag_id)
);

-- RLS para exercise_tags
alter table exercise_tags enable row level security;
alter table exercise_tag_assignments enable row level security;

create policy "Coach can manage own tags"
  on exercise_tags for all
  using (coach_id = auth.uid());

create policy "Authenticated users can view tags"
  on exercise_tags for select
  using (auth.role() = 'authenticated');

create policy "Coach can manage tag assignments"
  on exercise_tag_assignments for all
  using (
    tag_id in (select id from exercise_tags where coach_id = auth.uid())
    or auth.uid() in (select id from profiles where role = 'coach')
  );

create policy "Authenticated users can view tag assignments"
  on exercise_tag_assignments for select
  using (auth.role() = 'authenticated');

-- ============================================================
-- 2. SESIONES DE ENTRENAMIENTO
--    Timestamps de inicio/fin + Borg al final del entrenamiento
-- ============================================================
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  plan_id uuid references plans(id),
  logged_date date not null,
  started_at timestamptz,
  finished_at timestamptz,
  borg_scale int check (borg_scale between 0 and 10),
  borg_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, plan_id, logged_date)
);

create trigger workout_sessions_updated_at
  before update on workout_sessions
  for each row execute function update_updated_at();

-- RLS para workout_sessions
alter table workout_sessions enable row level security;

create policy "Coach can view all workout sessions"
  on workout_sessions for select
  using (
    auth.uid() in (select id from profiles where role = 'coach')
  );

create policy "Students can manage own workout sessions"
  on workout_sessions for all
  using (student_id = auth.uid());

create index if not exists idx_workout_sessions_student on workout_sessions(student_id);
create index if not exists idx_workout_sessions_date on workout_sessions(logged_date);

-- ============================================================
-- 3. OBSERVACIONES DE ALUMNO (visibles para ambos)
--    A diferencia de coach_notes que es privado
-- ============================================================
alter table profiles add column if not exists observations text;

-- ============================================================
-- 4. BLOQUES: separar letter y number (back-compat con block_label)
--    block_label sigue siendo el campo de referencia (ej: "A1")
--    pero ahora se deriva de dos dropdowns en la UI
-- ============================================================
-- No se necesita cambio de schema, block_label ya existe.
-- La UI generará "A1" de letter="A" + number="1"

-- ============================================================
-- 5. REPS POR SERIE
--    suggested_reps y actual_reps ahora pueden ser JSON arrays
--    Ej: '["12","10","8","6"]' cuando cada serie tiene reps distintas
--    Ej: '10' o '10cl' cuando todas las series tienen las mismas reps
--    Back-compatible: el texto sigue siendo text, parseado en la UI
-- ============================================================
-- No se necesita cambio de schema, los campos ya son text.

-- ============================================================
-- 6. ÍNDICES ADICIONALES
-- ============================================================
create index if not exists idx_exercise_tags_coach on exercise_tags(coach_id);
create index if not exists idx_exercise_tag_assignments_exercise on exercise_tag_assignments(exercise_id);
create index if not exists idx_exercise_tag_assignments_tag on exercise_tag_assignments(tag_id);
