-- ============================================================
-- v73 — Reglas de acceso (RLS): auth.uid() e is_coach() una vez por consulta
-- ------------------------------------------------------------
-- 2026-10-14. El revisor de rendimiento de Supabase marcaba 35 policies con
-- auth.uid() "sin envolver" (auth_rls_initplan). Además is_coach() es
-- SECURITY DEFINER con SET search_path, así que Postgres no la inlinea y la
-- ejecuta UNA VEZ POR FILA (una consulta a profiles por cada fila leída).
-- Envolverlas en (select ...) las convierte en un InitPlan: se calculan una
-- sola vez por consulta. El resultado es idéntico (son funciones STABLE sin
-- argumentos de fila); solo cambia cuántas veces se ejecutan.
--
-- Medido en una transacción con rollback, como Anto (coach) y como una
-- persona real, 10 repeticiones por tabla, MISMA cantidad de filas visibles
-- antes y después en todas:
--   coach   workout_logs 25,1 → 5,7 ms · plan_assignments 8,5 → 1,1
--           exercise_tags 16,0 → 2,9 · exercise_tag_assignments 10,2 → 1,9
--           plan_exercises 7,1 → 1,3 · notes 6,0 → 1,4 · profiles 8,1 → 0,4
--   persona exercise_tags 11,1 → 3,0 · exercise_tag_assignments 8,7 → 1,8
--           plan_assignments 2,5 → 0,8 · student_edit_history 2,8 → 0,6
--
-- Se hace con un reemplazo de texto sobre la definición VIGENTE de cada
-- policy (pg_policies), igual que se probó. Es idempotente: la condición
-- (?<!select ) evita envolver dos veces. Cambia 36 policies (las 35 del
-- revisor + select_visible_exercises, que tenía un auth.uid() suelto como
-- argumento de catalog_reader).
-- ============================================================
do $$
declare
  r record;
  nq text;
  nc text;
  changed int := 0;
begin
  for r in select * from pg_policies where schemaname = 'public' loop
    nq := regexp_replace(regexp_replace(r.qual,
            '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi'),
            '(?<!select )is_coach\(\)', '(select is_coach())', 'gi');
    nc := regexp_replace(regexp_replace(r.with_check,
            '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi'),
            '(?<!select )is_coach\(\)', '(select is_coach())', 'gi');
    if nq is distinct from r.qual or nc is distinct from r.with_check then
      execute format('alter policy %I on public.%I', r.policyname, r.tablename)
        || case when r.qual is not null then format(' using (%s)', nq) else '' end
        || case when r.with_check is not null then format(' with check (%s)', nc) else '' end;
      changed := changed + 1;
    end if;
  end loop;
  raise notice 'v73: % policies actualizadas', changed;
end $$;
