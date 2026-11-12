-- ============================================================
-- v80 — Ping que mantiene despierta la API (Franco, 2026-11-12) — PRUEBA
-- ------------------------------------------------------------
-- Diagnóstico: la instancia (plan Free, cómputo Nano, 0,5 GB) vive en swap.
-- Tras un rato sin tráfico los procesos de la API quedan en disco y la
-- primera tanda de consultas tarda de 3 a 30 s (medido en edge_logs); las
-- siguientes, 0,1 a 1 s. Ver memoria lentitud-dashboard-calendario-infra.
--
-- Prueba gratis antes de pagar más cómputo: una consulta mínima por minuto
-- a la propia API REST, para que no llegue a dormirse.
--   - Extensión `http` (síncrona, sin proceso permanente; pg_net sumaría un
--     worker fijo a una instancia que ya no tiene memoria).
--   - La clave es la publicable (la misma que viaja en el front): no da
--     acceso a nada que RLS no permita a un visitante anónimo.
--   - El ping nunca falla el job: cualquier error se traga.
--   - cron.job_run_details crece 1440 filas por día: se limpia a diario.
--
-- PARA SACARLO (si la medición dice que no sirve):
--   select cron.unschedule('keep_api_warm');
--   select cron.unschedule('cleanup_cron_run_details_daily');
--   drop function if exists public.fn_keep_api_warm();
--   drop extension if exists http;
-- ============================================================

create extension if not exists http with schema extensions;

create or replace function public.fn_keep_api_warm()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('http.timeout_msec', '8000', true);
  perform extensions.http((
    'GET',
    'https://bvexjanqmfypmtgoapbt.supabase.co/rest/v1/exercises?select=id&limit=1',
    array[extensions.http_header('apikey', 'sb_publishable_eQ91JQMLcfax7tcCUpWphw_XMl6E6aS')],
    null,
    null
  )::extensions.http_request);
exception when others then
  null; -- un ping que falla no es un problema: el siguiente sale en un minuto
end;
$$;

comment on function public.fn_keep_api_warm() is
  'v80 (prueba): consulta mínima a la API REST para que no quede en swap. La corre pg_cron cada minuto.';

revoke all on function public.fn_keep_api_warm() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('keep_api_warm', 'cleanup_cron_run_details_daily');

select cron.schedule('keep_api_warm', '* * * * *', $$select public.fn_keep_api_warm()$$);

select cron.schedule(
  'cleanup_cron_run_details_daily',
  '30 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$
);
