-- ============================================================
-- v81 — Avisos al celular (Web Push) — Franco, 2026-11-14
-- ------------------------------------------------------------
-- Hasta acá los avisos solo se veían en la campana. El push estaba armado
-- pero nadie lo disparaba (la edge function notify-cron nunca se programó y
-- solo miraba los últimos 5 minutos).
--
-- Diseño: UN solo punto de salida. Todo aviso ya pasa por `notifications`,
-- así que el push se cuelga de esa tabla y no de cada tipo de aviso.
--
--   1. BEFORE INSERT en notifications: si el tipo suena para el rol de quien
--      lo recibe (fn_push_policy), la fila nace con push_status = 'pending'.
--   2. pg_cron, cada minuto: fn_dispatch_push(). Si hay pendientes, llama a
--      la edge function `send-push`, que reclama las filas (pending → sent)
--      y manda el push a los dispositivos de la persona.
--
-- Por qué cron + `http` y no un trigger con pg_net: la instancia vive en
-- swap (ver v80) y pg_net suma un proceso permanente. El costo es una demora
-- de hasta un minuto, que para estos avisos no importa. Si algún día se
-- sube el cómputo, se puede pasar a pg_net sin tocar el resto.
--
-- El insert del aviso nunca depende del push: el trigger solo marca una
-- columna y se traga cualquier error.
--
-- QUÉ SUENA (decisión de Franco, 2026-11-14). Etapa coach:
--   suena        → student_note, form_submitted, evaluation_completed,
--                  coach_link_request, exercise_unclear
--   solo campana → session_completed y todo lo demás
-- La etapa del alumno se enciende sumando sus tipos en fn_push_policy.
--
-- Estados de push_status:
--   null        no le corresponde push (queda en la campana)
--   pending     espera el próximo despacho
--   sent        al menos un dispositivo lo aceptó
--   no_devices  la persona no tiene ningún dispositivo con avisos activados
--   failed      tenía dispositivos y ninguno lo aceptó
--   expired     pasaron 30 minutos sin poder enviarlo: ya no sirve
--
-- PARA APAGARLO sin desinstalar nada:
--   select cron.unschedule('dispatch_push');
-- ============================================================

alter table public.notifications
  add column if not exists push_status text,
  add column if not exists push_sent_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_push_status_check;
alter table public.notifications
  add constraint notifications_push_status_check
  check (push_status is null
         or push_status in ('pending', 'sent', 'no_devices', 'failed', 'expired'));

comment on column public.notifications.push_status is
  'v81: estado del aviso al celular. null = no le corresponde push. Ver fn_push_policy / fn_dispatch_push.';
comment on column public.notifications.push_sent_at is
  'v81: cuándo lo reclamó la edge function send-push para enviarlo.';

create index if not exists notifications_push_pending_idx
  on public.notifications (created_at)
  where push_status = 'pending';

-- ── Qué tipo suena para qué rol ──────────────────────────────
create or replace function public.fn_push_policy(p_type text, p_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'coach' then p_type in (
      'student_note',
      'form_submitted',
      'evaluation_completed',
      'coach_link_request',
      'exercise_unclear'
    )
    else false
  end
$$;

comment on function public.fn_push_policy(text, text) is
  'v81: única fuente de qué avisos van al celular, por rol de quien los recibe.';

-- ── Marcar al nacer ──────────────────────────────────────────
create or replace function public.fn_notifications_mark_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if new.push_status is null then
    select p.role into v_role from public.profiles p where p.id = new.user_id;
    if public.fn_push_policy(new.type, v_role) then
      new.push_status := 'pending';
    end if;
  end if;
  return new;
exception when others then
  return new; -- el aviso de la campana nunca se pierde por culpa del push
end;
$$;

drop trigger if exists trg_notifications_mark_push on public.notifications;
create trigger trg_notifications_mark_push
  before insert on public.notifications
  for each row execute function public.fn_notifications_mark_push();

-- ── Despacho (lo corre pg_cron cada minuto) ──────────────────
create or replace function public.fn_dispatch_push()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
begin
  -- Lo que no salió en 30 minutos ya no sirve como aviso.
  update public.notifications
     set push_status = 'expired'
   where push_status = 'pending'
     and created_at < now() - interval '30 minutes';

  -- Sin dispositivos no hay nada que enviar: no despertar a la función.
  update public.notifications n
     set push_status = 'no_devices'
   where n.push_status = 'pending'
     and not exists (
       select 1 from public.push_subscriptions s where s.user_id = n.user_id
     );

  select count(*) into v_pending
    from public.notifications
   where push_status = 'pending';

  if v_pending = 0 then
    return 0;
  end if;

  begin
    perform set_config('http.timeout_msec', '15000', true);
    perform extensions.http((
      'POST',
      'https://bvexjanqmfypmtgoapbt.supabase.co/functions/v1/send-push',
      array[]::extensions.http_header[],
      'application/json',
      '{}'
    )::extensions.http_request);
  exception when others then
    null; -- si falla, las filas siguen pendientes y sale en el próximo minuto
  end;

  return v_pending;
end;
$$;

comment on function public.fn_dispatch_push() is
  'v81: si hay avisos con push pendiente, llama a la edge function send-push. Devuelve cuántos había.';

revoke all on function public.fn_dispatch_push() from public, anon, authenticated;
revoke all on function public.fn_notifications_mark_push() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'dispatch_push';
select cron.schedule('dispatch_push', '* * * * *', $$select public.fn_dispatch_push()$$);
