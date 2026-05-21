-- =============================================================================
-- FIX 2.1 (templates como plan_assignments) + raíces 2.1 y 2.3
-- Proyecto: bvexjanqmfypmtgoapbt
-- Autor: Claude (agente) + Franco
-- Fecha: 2026-05-15
--
-- PRINCIPIOS:
--   • No eliminar información. Toda fila histórica se preserva, solo se re-apunta.
--   • Una sola regla para los 8 assignments problemáticos: clonar + re-apuntar.
--     (El #9 'archived' se deja como está, no afecta nada.)
--   • Trazabilidad: title del clon = '<plantilla> — <alumno>'; description del
--     clon agrega una nota con template_id de origen y fecha.
--   • Las plantillas quedan intactas, listas para reutilizar.
--   • Triggers de raíz instalados DESPUÉS del backfill, para que no entorpezcan.
-- =============================================================================

-- =============================================================================
-- HEALTH CHECKS PRE-EJECUCIÓN (correr antes del bloque transaccional)
-- =============================================================================
-- HC-pre-1: cuántos assignments apuntan a templates (esperado: 9, todos los actuales)
-- select count(*) as pre_assignments_to_templates
-- from public.plan_assignments pa
-- join public.plans p on p.id = pa.plan_id
-- where p.is_template = true;

-- HC-pre-2: evals con status='active' y results ya cargados (esperado: 5)
-- select count(*) as pre_evals_open_with_results
-- from public.plan_assignments pa
-- where pa.status='active' and pa.plan_type='evaluation'
--   and exists (select 1 from public.evaluation_results er
--               where er.student_id=pa.student_id and er.plan_id=pa.plan_id);

-- HC-pre-3: contador de filas que se van a tocar por assignment
-- select pa.id, pa.student_id, pa.plan_id, p.title,
--   (select count(*) from public.workout_logs wl
--    where wl.student_id=pa.student_id and wl.plan_id=pa.plan_id) as wl,
--   (select count(*) from public.workout_sessions ws
--    where ws.student_id=pa.student_id and ws.plan_id=pa.plan_id) as ws,
--   (select count(*) from public.workout_block_logs wbl
--    where wbl.student_id=pa.student_id and wbl.plan_id=pa.plan_id) as wbl,
--   (select count(*) from public.evaluation_results er
--    where er.student_id=pa.student_id and er.plan_id=pa.plan_id) as er
-- from public.plan_assignments pa
-- join public.plans p on p.id=pa.plan_id
-- where p.is_template = true and pa.status <> 'archived';

-- =============================================================================
-- BLOQUE TRANSACCIONAL (todo o nada)
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- FASE 1 — Helper: migrate_assignment_off_template(assignment_id)
-- Clona la plantilla referida por el assignment a una instancia personal
-- y re-apunta TODO al clon: assignment, workout_logs (con plan_exercise_id),
-- workout_sessions, workout_block_logs (con plan_block_id), evaluation_results.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.migrate_assignment_off_template(p_assignment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_plan_id  uuid;
  v_new_plan_id  uuid := gen_random_uuid();
  v_student_id   uuid;
  v_student_name text;
  v_block_map    jsonb;
  v_ex_map       jsonb;
BEGIN
  -- (a) Validar y obtener datos
  SELECT pa.plan_id, pa.student_id
    INTO v_old_plan_id, v_student_id
    FROM public.plan_assignments pa
    JOIN public.plans p ON p.id = pa.plan_id
   WHERE pa.id = p_assignment_id
     AND p.is_template = true;

  IF v_old_plan_id IS NULL THEN
    RAISE EXCEPTION
      'Assignment % no existe o no apunta a una plantilla', p_assignment_id;
  END IF;

  SELECT COALESCE(NULLIF(trim(name), ''), email)
    INTO v_student_name
    FROM public.profiles WHERE id = v_student_id;

  -- (b) Clonar el plan (title + description aumentadas)
  INSERT INTO public.plans (
    id, title, description, goal, sessions_per_week, duration_weeks,
    is_template, created_by, plan_type, eval_type, eval_method,
    has_activation, eval_tags
  )
  SELECT
    v_new_plan_id,
    trim(both ' ' from COALESCE(p.title, 'Sin nombre')) || ' — ' || v_student_name,
    COALESCE(NULLIF(p.description, ''), '') ||
      CASE WHEN COALESCE(NULLIF(p.description, ''), '') = '' THEN '' ELSE E'\n\n' END ||
      '[Clonado de "' || trim(both ' ' from COALESCE(p.title, '')) ||
      '" (template_id=' || p.id::text ||
      ') el ' || current_date::text ||
      ' — instancia personal del alumno]',
    p.goal, p.sessions_per_week, p.duration_weeks,
    false,  -- is_template = false (es una instancia)
    p.created_by, p.plan_type, p.eval_type, p.eval_method,
    p.has_activation, p.eval_tags
  FROM public.plans p
  WHERE p.id = v_old_plan_id;

  -- (c) Mapeo block_id viejo → nuevo
  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_block_map
    FROM public.plan_blocks
   WHERE plan_id = v_old_plan_id;

  -- (d) Clonar plan_blocks
  INSERT INTO public.plan_blocks (
    id, plan_id, section, block_type, order_index, title, notes,
    aerobic_format, aerobic_total_minutes, aerobic_intensity,
    aerobic_work_seconds, aerobic_rest_seconds, aerobic_rounds,
    aerobic_expected_sensation, circuit_type, circuit_work_seconds,
    circuit_rest_seconds, circuit_rounds, circuit_total_minutes,
    circuit_intensity, aerobic_zone
  )
  SELECT
    (v_block_map->>(pb.id::text))::uuid,
    v_new_plan_id,
    pb.section, pb.block_type, pb.order_index, pb.title, pb.notes,
    pb.aerobic_format, pb.aerobic_total_minutes, pb.aerobic_intensity,
    pb.aerobic_work_seconds, pb.aerobic_rest_seconds, pb.aerobic_rounds,
    pb.aerobic_expected_sensation, pb.circuit_type, pb.circuit_work_seconds,
    pb.circuit_rest_seconds, pb.circuit_rounds, pb.circuit_total_minutes,
    pb.circuit_intensity, pb.aerobic_zone
  FROM public.plan_blocks pb
  WHERE pb.plan_id = v_old_plan_id;

  -- (e) Mapeo plan_exercise_id viejo → nuevo
  SELECT COALESCE(jsonb_object_agg(id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_ex_map
    FROM public.plan_exercises
   WHERE plan_id = v_old_plan_id;

  -- (f) Clonar plan_exercises (remapeando block_id)
  INSERT INTO public.plan_exercises (
    id, plan_id, exercise_id, section, block_label, order_index,
    suggested_sets, suggested_reps, suggested_weight, rest_time,
    suggested_pse, extra_notes, suggested_weights, block_id,
    exercise_mode, duration_seconds
  )
  SELECT
    (v_ex_map->>(pe.id::text))::uuid,
    v_new_plan_id,
    pe.exercise_id, pe.section, pe.block_label, pe.order_index,
    pe.suggested_sets, pe.suggested_reps, pe.suggested_weight, pe.rest_time,
    pe.suggested_pse, pe.extra_notes, pe.suggested_weights,
    CASE
      WHEN pe.block_id IS NOT NULL AND v_block_map ? pe.block_id::text
        THEN (v_block_map->>(pe.block_id::text))::uuid
      ELSE NULL
    END,
    pe.exercise_mode, pe.duration_seconds
  FROM public.plan_exercises pe
  WHERE pe.plan_id = v_old_plan_id;

  -- (g) Re-apuntar workout_logs (con remapeo de plan_exercise_id si matchea)
  UPDATE public.workout_logs wl
     SET plan_id = v_new_plan_id,
         plan_exercise_id = CASE
           WHEN wl.plan_exercise_id IS NOT NULL AND v_ex_map ? wl.plan_exercise_id::text
             THEN (v_ex_map->>(wl.plan_exercise_id::text))::uuid
           ELSE wl.plan_exercise_id
         END
   WHERE wl.student_id = v_student_id
     AND wl.plan_id = v_old_plan_id;

  -- (h) Re-apuntar workout_sessions
  UPDATE public.workout_sessions
     SET plan_id = v_new_plan_id
   WHERE student_id = v_student_id
     AND plan_id = v_old_plan_id;

  -- (i) Re-apuntar workout_block_logs (con remapeo de plan_block_id)
  UPDATE public.workout_block_logs wbl
     SET plan_id = v_new_plan_id,
         plan_block_id = CASE
           WHEN wbl.plan_block_id IS NOT NULL AND v_block_map ? wbl.plan_block_id::text
             THEN (v_block_map->>(wbl.plan_block_id::text))::uuid
           ELSE wbl.plan_block_id
         END
   WHERE wbl.student_id = v_student_id
     AND wbl.plan_id = v_old_plan_id;

  -- (j) Re-apuntar evaluation_results
  --     evaluation_test_responses se mueve sola (FK por evaluation_result_id)
  UPDATE public.evaluation_results
     SET plan_id = v_new_plan_id
   WHERE student_id = v_student_id
     AND plan_id = v_old_plan_id;

  -- (k) Re-apuntar el assignment al clon
  UPDATE public.plan_assignments
     SET plan_id = v_new_plan_id
   WHERE id = p_assignment_id;

  RETURN v_new_plan_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- FASE 2 — Ejecutar la migración por cada uno de los 8 assignments
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_id          uuid;
  v_new_plan_id uuid;
  v_assignments uuid[] := ARRAY[
    '35a1edc0-5715-4230-8db7-803dcbe8a809'::uuid,  -- alumno_prueba (test), eval pendiente
    '4a667d9c-91be-4320-9b59-b20dc8ebbe8d'::uuid,  -- student1 (test), eval+2 results+113 logs
    '235e15ea-61cd-478b-988c-566def8644ea'::uuid,  -- student1 (test), eval con 1 result
    'ad8fe903-54b5-425b-b1b8-0ff7952e71e6'::uuid,  -- student1 (test), training con 1/1
    '35df6a67-f9bc-4334-9eae-52ea497e8428'::uuid,  -- anabmoran, eval pendiente
    '4e94b575-7aba-4da9-b849-04066a8a6724'::uuid,  -- anabmoran, training EN USO 12/1/1
    '68f1500a-a467-4419-8a7a-533f88a122ec'::uuid,  -- annto51099, eval con 1 result
    '6111cac4-701f-47f5-93d0-22f999f66f19'::uuid   -- francellone, eval pendiente
  ];
BEGIN
  FOREACH v_id IN ARRAY v_assignments LOOP
    SELECT public.migrate_assignment_off_template(v_id) INTO v_new_plan_id;
    RAISE NOTICE 'Assignment % → clon plan_id=%', v_id, v_new_plan_id;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- FASE 3 — Backfill 2.3: cerrar evaluaciones que ya tienen results
-- Cubre: las 3 del bloque 2 con results (ahora apuntan a sus clones) +
--        las 2 evals instancia de Franco (chin ups, hip thrust).
-- Resultado esperado: 5 filas actualizadas.
-- -----------------------------------------------------------------------------
UPDATE public.plan_assignments pa
   SET status            = 'completed',
       status_changed_at = now(),
       status_reason     = 'auto-cierre por evaluation_results existentes (backfill 2026-05-15)'
 WHERE pa.status     = 'active'
   AND pa.plan_type  = 'evaluation'
   AND EXISTS (
     SELECT 1 FROM public.evaluation_results er
      WHERE er.student_id = pa.student_id
        AND er.plan_id    = pa.plan_id
   );

-- -----------------------------------------------------------------------------
-- FASE 4 — Trigger: auto-cerrar evaluación cuando se carguen results (raíz 2.3)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_close_eval_on_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.plan_assignments
     SET status            = 'completed',
         status_changed_at = now(),
         status_reason     = COALESCE(status_reason,
                                      'auto-cierre por carga de evaluation_results')
   WHERE student_id = NEW.student_id
     AND plan_id    = NEW.plan_id
     AND plan_type  = 'evaluation'
     AND status     = 'active';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_eval_on_result ON public.evaluation_results;
CREATE TRIGGER trg_close_eval_on_result
  AFTER INSERT ON public.evaluation_results
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_close_eval_on_result();

-- -----------------------------------------------------------------------------
-- FASE 5 — Trigger: prohibir asignar plantillas como plan_assignments (raíz 2.1)
-- Defensa de la BD contra el bug del frontend. El frontend se arregla en otro sprint.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_assignments_forbid_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.plans p
     WHERE p.id = NEW.plan_id AND p.is_template = true
  ) THEN
    RAISE EXCEPTION
      'plan_assignments.plan_id apunta a una plantilla (plan_id=%). ' ||
      'Cloná la plantilla a una instancia primero ' ||
      '(usá public.migrate_assignment_off_template o el flujo del frontend).',
      NEW.plan_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pa_forbid_template ON public.plan_assignments;
CREATE TRIGGER trg_pa_forbid_template
  BEFORE INSERT OR UPDATE ON public.plan_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_assignments_forbid_template();

COMMIT;

-- =============================================================================
-- HEALTH CHECKS POST-EJECUCIÓN
-- =============================================================================
-- HC-post-1: assignments apuntando a templates (esperado: 1, solo el archived)
-- select count(*) as post_assignments_to_templates
-- from public.plan_assignments pa
-- join public.plans p on p.id = pa.plan_id
-- where p.is_template = true;

-- HC-post-2: assignments ACTIVOS apuntando a templates (esperado: 0)
-- select count(*) as post_active_to_templates
-- from public.plan_assignments pa
-- join public.plans p on p.id = pa.plan_id
-- where p.is_template = true and pa.status = 'active';

-- HC-post-3: evals active con results (esperado: 0)
-- select count(*) as post_evals_open_with_results
-- from public.plan_assignments pa
-- where pa.status='active' and pa.plan_type='evaluation'
--   and exists (select 1 from public.evaluation_results er
--               where er.student_id=pa.student_id and er.plan_id=pa.plan_id);

-- HC-post-4: count de plantillas (esperado: igual que antes — no se tocan, 11)
-- select count(*) as post_templates
-- from public.plans where is_template = true;

-- HC-post-5: count de instancias (esperado: 6 + 8 = 14)
-- select count(*) as post_instances
-- from public.plans where is_template = false;

-- HC-post-6: trazabilidad — clones recién creados con su template origen visible
-- select id, title, plan_type, created_at, left(description, 200) as desc_excerpt
-- from public.plans
-- where is_template = false
--   and description like '%template_id=%'
-- order by created_at desc;
