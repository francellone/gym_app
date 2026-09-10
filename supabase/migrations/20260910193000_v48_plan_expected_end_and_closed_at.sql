-- ============================================================
-- v48 · Etapa A: vigencia del plan (vencimiento) separada del cierre
-- ------------------------------------------------------------
-- Contexto y decisiones: docs/decisiones-vencimiento-plan-vs-pago.md
--
-- Problema: `plan_assignments.end_date` nunca fue una fecha de
-- vencimiento. Se escribe = hoy al reemplazar o completar la
-- asignación, o sea que es la fecha de CIERRE y siempre está en el
-- pasado (0 de 28 asignaciones activas la tenían al 10/09/2026).
-- Por eso la alerta `computePlanExpiringSoon`, el evento `plan_end`
-- del calendario y el cron `fn_notify_expiring_plans` nunca
-- dispararon una sola vez.
--
-- Esta migración:
--   1. agrega `expected_end_date` (vencimiento) derivada de
--      plans.duration_weeks, con `expected_end_source` para saber si
--      la calculó el sistema o la fijó la coach (D1);
--   2. agrega `closed_at` como nombre correcto del cierre y la deja
--      SINCRONIZADA en los dos sentidos con `end_date`, que se borra
--      recién en la v49, cuando el deploy nuevo esté verificado (D7);
--   3. backfillea las asignaciones vivas marcándolas como estimadas
--      para no pintar el dashboard de rojo (D6).
--
-- `end_date` / `closed_at` NO cambia de significado: el motor de
-- informes sigue midiendo con el cierre real, porque un plan que se
-- estira más allá de su vencimiento igual se entrenó (D2).
-- ============================================================

begin;

-- ── 1. Columnas ─────────────────────────────────────────────
alter table public.plan_assignments
  add column if not exists expected_end_date date,
  add column if not exists expected_end_source text not null default 'derived',
  add column if not exists closed_at date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'plan_assignments_expected_end_source_check'
  ) then
    alter table public.plan_assignments
      add constraint plan_assignments_expected_end_source_check
      check (expected_end_source in ('derived', 'manual', 'backfill'));
  end if;
end $$;

comment on column public.plan_assignments.expected_end_date is
  'Vencimiento del plan: hasta cuándo se espera que la persona lo entrene. '
  'Derivada de plans.duration_weeks salvo que la coach la fije a mano. '
  'NULL = plan abierto (el plan no declara duración). No confundir con closed_at.';
comment on column public.plan_assignments.expected_end_source is
  'derived = la calcula el trigger | manual = la fijó la coach y el trigger no la toca | '
  'backfill = la puso la migración v48, la UI la muestra como estimada.';
comment on column public.plan_assignments.closed_at is
  'Cierre REAL de la asignación: cuándo dejó de estar vigente (reemplazo, '
  'finalización). Siempre pasado o NULL. Es la columna que usa el motor de '
  'informes. Reemplaza a end_date, que se elimina en la v49.';
comment on column public.plan_assignments.end_date is
  'OBSOLETA (v48): sinónimo sincronizado de closed_at para que el bundle viejo '
  'siga funcionando durante el deploy. Se elimina en la v49.';

-- ── 2. Sincronización closed_at <-> end_date (transitoria, D7) ──
create or replace function public.plan_assignments_sync_closed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.closed_at := coalesce(new.closed_at, new.end_date);
    new.end_date  := new.closed_at;
    return new;
  end if;

  -- Gana el que cambió en esta escritura. Si cambian los dos (nadie
  -- debería), gana closed_at, que es el nombre nuevo.
  if new.closed_at is distinct from old.closed_at then
    new.end_date := new.closed_at;
  elsif new.end_date is distinct from old.end_date then
    new.closed_at := new.end_date;
  end if;

  return new;
end;
$$;

comment on function public.plan_assignments_sync_closed_at() is
  'v48 (transitoria): mantiene end_date y closed_at con el mismo valor mientras '
  'conviven bundles viejos y nuevos. Se elimina junto con end_date en la v49.';

drop trigger if exists trg_pa_sync_closed_at on public.plan_assignments;
create trigger trg_pa_sync_closed_at
  before insert or update on public.plan_assignments
  for each row execute function public.plan_assignments_sync_closed_at();

-- ── 3. Derivación del vencimiento ───────────────────────────
create or replace function public.plan_assignments_sync_expected_end()
returns trigger
language plpgsql
as $$
declare
  v_weeks   integer;
  v_derived date;
begin
  -- Repuntes masivos (backfill): no tocar nada.
  if coalesce(current_setting('app.bulk_maintenance', true), '') = 'on' then
    return new;
  end if;

  select p.duration_weeks into v_weeks
    from public.plans p where p.id = new.plan_id;

  if new.start_date is not null and v_weeks is not null and v_weeks > 0 then
    v_derived := new.start_date + (v_weeks * 7 - 1);
  else
    v_derived := null;  -- plan abierto
  end if;

  if tg_op = 'INSERT' then
    if new.expected_end_date is not null
       and new.expected_end_date is distinct from v_derived then
      new.expected_end_source := 'manual';
    else
      new.expected_end_date   := v_derived;
      new.expected_end_source := 'derived';
    end if;
    return new;
  end if;

  -- "Volver a la fecha calculada": la UI manda source='derived' sobre
  -- una fila manual y el trigger recalcula.
  if new.expected_end_source = 'derived' and old.expected_end_source = 'manual'
     and new.expected_end_date is not distinct from old.expected_end_date then
    new.expected_end_date := v_derived;
    return new;
  end if;

  -- La coach escribió una fecha: manual, salvo que coincida con la derivada.
  if new.expected_end_date is distinct from old.expected_end_date then
    new.expected_end_source := case
      when new.expected_end_date is not distinct from v_derived then 'derived'
      else 'manual'
    end;
    return new;
  end if;

  -- Cambió el arranque o el plan: recalcular, salvo fecha manual.
  if new.expected_end_source <> 'manual'
     and (new.start_date is distinct from old.start_date
          or new.plan_id is distinct from old.plan_id) then
    new.expected_end_date   := v_derived;
    new.expected_end_source := 'derived';
  end if;

  return new;
end;
$$;

comment on function public.plan_assignments_sync_expected_end() is
  'v48: mantiene expected_end_date = start_date + duration_weeks*7 - 1 salvo que '
  'expected_end_source = manual. Respeta el GUC app.bulk_maintenance.';

drop trigger if exists trg_pa_sync_expected_end on public.plan_assignments;
create trigger trg_pa_sync_expected_end
  before insert or update on public.plan_assignments
  for each row execute function public.plan_assignments_sync_expected_end();

-- ── 4. Backfill ─────────────────────────────────────────────
set local app.bulk_maintenance = 'on';

update public.plan_assignments
   set closed_at = end_date
 where end_date is not null
   and closed_at is distinct from end_date;

update public.plan_assignments pa
   set expected_end_date   = (pa.start_date + (p.duration_weeks * 7 - 1)),
       expected_end_source = 'backfill'
  from public.plans p
 where p.id = pa.plan_id
   and pa.status in ('active', 'paused')
   and pa.start_date is not null
   and p.duration_weeks is not null
   and p.duration_weeks > 0
   and pa.expected_end_date is null;

set local app.bulk_maintenance = 'off';

-- ── 5. Índice para las alertas ──────────────────────────────
create index if not exists idx_pa_expected_end_active
  on public.plan_assignments (expected_end_date)
  where status = 'active';

commit;
