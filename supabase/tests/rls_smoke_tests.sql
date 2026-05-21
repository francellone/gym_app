-- ============================================================================
-- RLS smoke tests — gym_app
-- ============================================================================
-- Cómo correrlos:
--   1) Vía Supabase Dashboard → SQL Editor: pegar todo y ejecutar.
--   2) Vía psql: `psql "$DATABASE_URL" -f supabase/tests/rls_smoke_tests.sql`.
--   3) Vía MCP de Supabase: enviar como `execute_sql`. (El MCP usa service_role,
--      pero el `SET LOCAL ROLE authenticated` + set_config de JWT cambia el
--      contexto efectivo dentro de la transacción.)
--
-- Forma de pasada:
--   Cada test emite `NOTICE: OK test N: <descripción>` cuando pasa.
--   Si algo falla, RAISE EXCEPTION rompe la transacción con el detalle.
--   El BEGIN/ROLLBACK final garantiza que no se modifica nada en la BD.
--
-- Qué cubren:
--   - Aislamiento entre alumnos en workout_logs, plan_assignments, notifications.
--   - Anon bloqueado en tablas con datos privados.
--   - Coach puede ver logs/asignaciones de sus alumnos (pero no de otros).
--
-- Lo que NO cubren todavía (deuda):
--   - INSERT/UPDATE/DELETE policies.
--   - notes, note_threads, intake_form_*, wellbeing_logs, evaluation_*.
--   - Edge cases de coach con múltiples alumnos en distintos estados.
--
-- Cuándo actualizar:
--   - Cada vez que se cambie una RLS policy (agregar test correspondiente).
--   - Cada vez que el linter de Supabase detecte algo nuevo en SECURITY.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Fixtures: usuarios reales que usamos como actores. NO se modifican (read-only).
--   coach     → anto.au.almanza@gmail.com (4 alumnos asignados al 2026-05-20)
--   student_a → francellone@gmail.com     (alumno de anto, con 283 logs)
--   student_b → annto51099@gmail.com      (alumno de anto, con 39 logs)
-- ----------------------------------------------------------------------------

-- Helper: setear el "usuario actual" como lo hace Supabase Auth.
CREATE OR REPLACE FUNCTION pg_temp._act_as(user_uuid UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', user_uuid::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', user_uuid::text, 'role', 'authenticated')::text,
    true);
  PERFORM set_config('role', 'authenticated', true);
END;
$$;

-- ----------------------------------------------------------------------------
-- Test 1 — student_a sólo ve workout_logs propios (aislamiento por student_id)
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp._act_as('d7a1ceb5-80fa-4cb9-8477-126bb71f8081'::uuid);

DO $$
DECLARE
  v_total int;
  v_own int;
  v_ajenos int;
BEGIN
  SELECT count(*) INTO v_total FROM public.workout_logs;
  SELECT count(*) INTO v_own   FROM public.workout_logs WHERE student_id = 'd7a1ceb5-80fa-4cb9-8477-126bb71f8081'::uuid;
  SELECT count(*) INTO v_ajenos FROM public.workout_logs WHERE student_id <> 'd7a1ceb5-80fa-4cb9-8477-126bb71f8081'::uuid;

  IF v_ajenos > 0 THEN
    RAISE EXCEPTION 'FAIL test 1: student_a ve % logs de otros (debería ser 0). Total visible: %', v_ajenos, v_total;
  END IF;

  IF v_total <> v_own THEN
    RAISE EXCEPTION 'FAIL test 1: total visible (%) <> logs propios (%)', v_total, v_own;
  END IF;

  RAISE NOTICE 'OK test 1: student_a ve sólo sus % workout_logs', v_own;
END $$;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- Test 2 — student_a no ve plan_assignments de otros alumnos
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp._act_as('d7a1ceb5-80fa-4cb9-8477-126bb71f8081'::uuid);

DO $$
DECLARE
  v_total int;
  v_ajenos int;
BEGIN
  SELECT count(*) INTO v_total  FROM public.plan_assignments;
  SELECT count(*) INTO v_ajenos FROM public.plan_assignments WHERE student_id <> 'd7a1ceb5-80fa-4cb9-8477-126bb71f8081'::uuid;

  IF v_ajenos > 0 THEN
    RAISE EXCEPTION 'FAIL test 2: student_a ve % plan_assignments de otros', v_ajenos;
  END IF;

  RAISE NOTICE 'OK test 2: student_a ve sólo sus % plan_assignments', v_total;
END $$;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- Test 3 — student_a no ve notifications de otros usuarios
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp._act_as('d7a1ceb5-80fa-4cb9-8477-126bb71f8081'::uuid);

DO $$
DECLARE
  v_ajenos int;
BEGIN
  SELECT count(*) INTO v_ajenos FROM public.notifications WHERE user_id <> 'd7a1ceb5-80fa-4cb9-8477-126bb71f8081'::uuid;

  IF v_ajenos > 0 THEN
    RAISE EXCEPTION 'FAIL test 3: student_a ve % notifications de otros', v_ajenos;
  END IF;

  RAISE NOTICE 'OK test 3: student_a no ve notifications de otros';
END $$;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- Test 4 — anon (sin sesión) no ve nada en workout_logs ni notifications
-- ----------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims',    '', true);

DO $$
DECLARE
  v_logs int;
  v_notif int;
  v_profiles int;
BEGIN
  SELECT count(*) INTO v_logs     FROM public.workout_logs;
  SELECT count(*) INTO v_notif    FROM public.notifications;
  SELECT count(*) INTO v_profiles FROM public.profiles;

  IF v_logs > 0 THEN
    RAISE EXCEPTION 'FAIL test 4a: anon ve % workout_logs (debería 0)', v_logs;
  END IF;
  IF v_notif > 0 THEN
    RAISE EXCEPTION 'FAIL test 4b: anon ve % notifications (debería 0)', v_notif;
  END IF;
  IF v_profiles > 0 THEN
    RAISE EXCEPTION 'FAIL test 4c: anon ve % profiles (debería 0)', v_profiles;
  END IF;

  RAISE NOTICE 'OK test 4: anon bloqueado en workout_logs, notifications y profiles';
END $$;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- Test 5 — coach ve workout_logs de sus alumnos y SÓLO de sus alumnos
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp._act_as('4d7b89ef-28af-4407-9d91-b5616e806ce3'::uuid);

DO $$
DECLARE
  v_visible int;
  v_de_sus_alumnos int;
  v_ajenos int;
BEGIN
  SELECT count(*) INTO v_visible FROM public.workout_logs;
  SELECT count(*) INTO v_de_sus_alumnos
    FROM public.workout_logs wl
    WHERE wl.student_id IN (
      SELECT id FROM public.profiles WHERE coach_id = '4d7b89ef-28af-4407-9d91-b5616e806ce3'::uuid
    );
  SELECT count(*) INTO v_ajenos
    FROM public.workout_logs wl
    WHERE wl.student_id NOT IN (
      SELECT id FROM public.profiles WHERE coach_id = '4d7b89ef-28af-4407-9d91-b5616e806ce3'::uuid
    );

  IF v_ajenos > 0 THEN
    RAISE EXCEPTION 'FAIL test 5a: coach ve % logs de alumnos que NO son suyos', v_ajenos;
  END IF;
  IF v_visible = 0 THEN
    RAISE EXCEPTION 'FAIL test 5b: coach no ve ningún log (esperado >0 ya que tiene 4 alumnos con logs)';
  END IF;

  RAISE NOTICE 'OK test 5: coach ve % logs (todos de sus alumnos)', v_visible;
END $$;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- Test 6 — student_a no ve workout_sessions de otros alumnos
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp._act_as('d7a1ceb5-80fa-4cb9-8477-126bb71f8081'::uuid);

DO $$
DECLARE
  v_ajenos int;
BEGIN
  SELECT count(*) INTO v_ajenos
    FROM public.workout_sessions
    WHERE student_id <> 'd7a1ceb5-80fa-4cb9-8477-126bb71f8081'::uuid;

  IF v_ajenos > 0 THEN
    RAISE EXCEPTION 'FAIL test 6: student_a ve % workout_sessions de otros', v_ajenos;
  END IF;

  RAISE NOTICE 'OK test 6: student_a no ve sessions de otros';
END $$;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- Cierre: rollback porque BEGIN al inicio. Nada queda persistido.
-- ----------------------------------------------------------------------------
ROLLBACK;
