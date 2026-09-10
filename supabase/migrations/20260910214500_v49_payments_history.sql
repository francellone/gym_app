-- ============================================================
-- v49 · Etapa B: historial de pagos
-- ------------------------------------------------------------
-- Decisiones D3, D8 y D9 en docs/decisiones-vencimiento-plan-vs-pago.md
--
-- Antes: el pago vivía en 3 columnas de `profiles`
-- (last_payment_date, next_payment_due, payment_notes). Cada cobro
-- pisaba al anterior, no había monto ni período cubierto, y las notas
-- "privadas" las podía leer el propio alumno por la política
-- `select_own_profile`.
--
-- Ahora: tabla `payments` con claves propias y RLS de coach. Las dos
-- fechas del perfil quedan como CACHÉ derivado mantenido por trigger,
-- así nada de lo que ya las lee (getPaymentStatus, chips y filtros de
-- la lista, alerta del dashboard, evento payment_due del calendario)
-- necesita cambiar.
--
-- `profiles.payment_notes` se vacía acá (el texto se muda a
-- payments.notes) y se ELIMINA en la v50, junto con `end_date`, cuando
-- el deploy nuevo esté verificado: borrarla ahora rompería el bundle
-- viejo, que todavía la manda en el update.
-- ============================================================

begin;

create extension if not exists btree_gist;

-- ── 1. Tabla ────────────────────────────────────────────────
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  -- Claves propias: el pago guarda SU coach, no lo deduce de
  -- profiles.coach_id, que puede cambiar y reescribiría la historia.
  student_id    uuid not null references public.profiles(id) on delete restrict,
  coach_id      uuid not null references public.profiles(id) on delete restrict,
  paid_on       date not null default current_date,
  period_start  date not null,
  period_end    date not null,
  amount        numeric(12,2),
  currency      text not null default 'ARS',
  method        text,
  notes         text,
  source        text not null default 'coach'
                  check (source in ('coach', 'backfill')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint payments_period_ok check (period_end >= period_start),
  constraint payments_amount_ok check (amount is null or amount >= 0)
);

comment on table public.payments is
  'Historial de cobros. Un pago cubre un período (period_start..period_end); '
  'profiles.next_payment_due y last_payment_date son caché derivado de esta tabla.';
comment on column public.payments.coach_id is
  'Coach que cobró. Clave propia a propósito: si el alumno cambia de coach, la '
  'historia no se reescribe.';
comment on column public.payments.period_end is
  'Último día cubierto, inclusive. next_payment_due = max(period_end) + 1.';

-- D8: dos pagos del mismo alumno no pueden cubrir días en común.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_no_overlap') then
    alter table public.payments
      add constraint payments_no_overlap
      exclude using gist (
        student_id with =,
        daterange(period_start, period_end, '[]') with &&
      );
  end if;
end $$;

create index if not exists idx_payments_student_paid_on
  on public.payments (student_id, paid_on desc);
create index if not exists idx_payments_coach
  on public.payments (coach_id);

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.update_updated_at();

-- ── 2. Ciclo de cobro del alumno (para proponer el período) ──
alter table public.profiles
  add column if not exists payment_cycle_days integer;

comment on column public.profiles.payment_cycle_days is
  'Duración habitual del período de cobro en días (30, 90, ...). NULL = sin ciclo '
  'fijo; la UI propone el mismo largo que el último período.';
comment on column public.profiles.next_payment_due is
  'CACHÉ (v49): max(payments.period_end) + 1. Lo mantiene trg_payments_sync_profile.';
comment on column public.profiles.last_payment_date is
  'CACHÉ (v49): max(payments.paid_on). Lo mantiene trg_payments_sync_profile.';
comment on column public.profiles.payment_notes is
  'OBSOLETA (v49): las notas de cobro viven en payments.notes, fuera del alcance '
  'del alumno. Se elimina en la v50.';

-- ── 3. Caché en profiles ────────────────────────────────────
create or replace function public.payments_sync_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_student uuid := coalesce(new.student_id, old.student_id);
begin
  update public.profiles p
     set last_payment_date = agg.max_paid,
         next_payment_due  = case when agg.max_end is null then null
                                  else agg.max_end + 1 end
    from (
      select max(paid_on) as max_paid, max(period_end) as max_end
        from public.payments where student_id = v_student
    ) agg
   where p.id = v_student;
  return null;
end;
$$;

comment on function public.payments_sync_profile() is
  'v49: recalcula el caché de pago del perfil ante cualquier escritura en payments.';

drop trigger if exists trg_payments_sync_profile on public.payments;
create trigger trg_payments_sync_profile
  after insert or update or delete on public.payments
  for each row execute function public.payments_sync_profile();

-- ── 4. RLS: solo el coach dueño. El alumno no ve nada. ──────
alter table public.payments enable row level security;

drop policy if exists coach_manage_own_payments on public.payments;
create policy coach_manage_own_payments on public.payments
  for all
  using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

-- ── 5. Backfill de las filas que hoy viven en profiles ──────
set local app.bulk_maintenance = 'on';

insert into public.payments (
  student_id, coach_id, paid_on, period_start, period_end,
  notes, source, created_by
)
select
  p.id,
  p.coach_id,
  p.last_payment_date,
  p.last_payment_date,
  -- Un perfil con last = next (carga vieja incompleta) queda como un
  -- período de un día, para que el caché siga siendo coherente.
  greatest(p.next_payment_due - 1, p.last_payment_date),
  p.payment_notes,
  'backfill',
  null
from public.profiles p
where p.last_payment_date is not null
  and p.next_payment_due is not null
  -- v50b: sin coach no hay a quién atribuirle el cobro, y los perfiles de
  -- prueba no dejan rastro.
  and p.coach_id is not null
  and coalesce(p.is_test, false) = false
  and not exists (select 1 from public.payments x where x.student_id = p.id);

-- D9: el texto ya está en payments.notes; sacarlo del alcance del alumno.
update public.profiles
   set payment_notes = null
 where payment_notes is not null;

set local app.bulk_maintenance = 'off';

commit;
