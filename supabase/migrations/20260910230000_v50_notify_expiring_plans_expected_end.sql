-- ============================================================
-- v50 · Etapa D: el aviso de "plan por vencer", sobre el vencimiento real
-- ------------------------------------------------------------
-- Decisión D5 en docs/decisiones-vencimiento-plan-vs-pago.md
--
-- Antes: `WHERE pa.active = true AND pa.end_date = CURRENT_DATE + 7`.
-- `end_date` es la fecha de CIERRE y en un plan vivo siempre es NULL, así
-- que este cron (job 2, diario 10:00 UTC) corrió meses sin generar una
-- sola fila.
--
-- Cambios:
--   * lee `expected_end_date`;
--   * VENTANA de 0 a 7 días en vez del día exacto: si el cron falla un
--     día, el aviso igual sale al siguiente;
--   * dedupe por (asignación, fecha de vencimiento): un aviso por plan, y
--     uno nuevo si la coach corre la fecha;
--   * SOLO al coach. El texto del alumno queda detrás de
--     p_notify_student, apagado hasta que Anto lo revise;
--   * excluye alumnos inactivos y perfiles de prueba;
--   * devuelve cuántos avisos generó, para auditar la corrida.
--
-- El cron sigue llamando `select public.fn_notify_expiring_plans()`: el
-- parámetro tiene default. La versión sin argumentos se elimina para que
-- esa llamada no quede ambigua.
-- ============================================================

drop function if exists public.fn_notify_expiring_plans();

create or replace function public.fn_notify_expiring_plans(p_notify_student boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rec RECORD;
  v_sent integer := 0;
  v_estimado text;
begin
  for rec in
    select pa.id as assignment_id, pa.student_id, pa.plan_id,
           pa.expected_end_date, pa.expected_end_source,
           p.title as plan_title, s.name as student_name, s.coach_id
      from public.plan_assignments pa
      join public.plans    p on p.id = pa.plan_id
      join public.profiles s on s.id = pa.student_id
     where pa.status = 'active'
       and pa.plan_type = 'training'
       and pa.expected_end_date is not null
       and pa.expected_end_date between current_date and current_date + 7
       and coalesce(s.active, true) = true
       and coalesce(s.is_test, false) = false
       and s.coach_id is not null
  loop
    if exists (
      select 1 from public.notifications n
       where n.user_id = rec.coach_id
         and n.type = 'plan_expiring'
         and n.data->>'assignment_id' = rec.assignment_id::text
         and n.data->>'expected_end_date' = rec.expected_end_date::text
    ) then
      continue;
    end if;

    v_estimado := case when rec.expected_end_source = 'backfill'
                       then ' (fecha estimada)' else '' end;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      rec.coach_id,
      'plan_expiring',
      'El plan de ' || coalesce(rec.student_name, 'una persona') || ' está por vencer',
      '"' || rec.plan_title || '" vence el ' ||
        to_char(rec.expected_end_date, 'DD/MM/YYYY') || '.' || v_estimado,
      jsonb_build_object(
        'student_id',        rec.student_id,
        'student_name',      rec.student_name,
        'plan_id',           rec.plan_id,
        'assignment_id',     rec.assignment_id,
        'expected_end_date', rec.expected_end_date,
        -- clave vieja, para que el front anterior siga resolviendo el texto
        'end_date',          rec.expected_end_date,
        'estimated',         rec.expected_end_source = 'backfill'
      )
    );
    v_sent := v_sent + 1;

    -- Apagado por D5: el alumno nunca recibió este aviso y el texto no
    -- pasó por Anto. Encenderlo = cambiar el default o la llamada del cron.
    if p_notify_student then
      insert into public.notifications (user_id, type, title, body, data)
      values (
        rec.student_id,
        'plan_expiring',
        'Tu plan vence pronto',
        'El plan "' || rec.plan_title || '" vence el ' ||
          to_char(rec.expected_end_date, 'DD/MM/YYYY') || '.',
        jsonb_build_object(
          'plan_id',           rec.plan_id,
          'assignment_id',     rec.assignment_id,
          'expected_end_date', rec.expected_end_date,
          'end_date',          rec.expected_end_date,
          'plan_title',        rec.plan_title
        )
      );
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

comment on function public.fn_notify_expiring_plans(boolean) is
  'v50: avisa al coach que un plan activo vence dentro de los próximos 7 días. '
  'Ventana + dedupe por (asignación, expected_end_date). p_notify_student = false '
  'mantiene apagado el aviso al alumno (D5).';
