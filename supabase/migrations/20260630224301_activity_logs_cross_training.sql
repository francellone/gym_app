-- Actividades extra por día (cross-training): fútbol, yoga, etc.
-- Doc 55. Registro por (alumno, fecha), N por día, independiente del plan.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'activity_type') then
    create type public.activity_type as enum (
      'football','yoga','running','swimming','cycling',
      'pilates','hiking','sport_other','other'
    );
  end if;
end $$;

create table if not exists public.activity_logs (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  date          date not null default current_date,
  activity_type public.activity_type not null,
  label         text,
  duration_min  int  check (duration_min is null or duration_min between 1 and 1440),
  intensity     int  check (intensity is null or intensity between 1 and 10),
  notes         text,
  source        text not null default 'student' check (source in ('student','coach')),
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint activity_logs_label_required
    check (activity_type not in ('sport_other','other')
           or (label is not null and length(trim(label)) > 0))
);

create index if not exists activity_logs_student_date_idx
  on public.activity_logs (student_id, date desc);

drop trigger if exists trg_activity_logs_updated_at on public.activity_logs;
create trigger trg_activity_logs_updated_at
  before update on public.activity_logs
  for each row execute function public.update_updated_at();

alter table public.activity_logs enable row level security;

drop policy if exists activity_student_select on public.activity_logs;
create policy activity_student_select on public.activity_logs
  for select using (student_id = auth.uid());

drop policy if exists activity_student_insert on public.activity_logs;
create policy activity_student_insert on public.activity_logs
  for insert with check (student_id = auth.uid() and created_by = auth.uid());

drop policy if exists activity_student_update on public.activity_logs;
create policy activity_student_update on public.activity_logs
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists activity_student_delete on public.activity_logs;
create policy activity_student_delete on public.activity_logs
  for delete using (student_id = auth.uid());

drop policy if exists activity_coach_all on public.activity_logs;
create policy activity_coach_all on public.activity_logs
  for all using (public.is_coach()) with check (public.is_coach());
