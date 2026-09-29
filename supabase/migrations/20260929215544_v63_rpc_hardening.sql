-- v63 — Blindaje de funciones que se saltean la RLS (SECURITY DEFINER)
--
-- Auditoría 2026-09-29, antes de abrir el registro: varias funciones
-- SECURITY DEFINER se podían llamar SIN sesión (rol anon, con la clave pública
-- del front) o sin validar quién llama:
--   * assign_template_to_student: cualquiera (hasta anon) podía clonar
--     cualquier plantilla y asignársela a cualquier persona.
--   * set_plan_archived: cualquier coach archivaba planes ajenos.
--   * process_intake_submission: cualquiera aplicaba cualquier formulario al
--     perfil de su dueño.
--   * notes_thread_filter_options: devolvía ejercicios/etiquetas de cualquier hilo.
--   * jobs de cron (resumen semanal, estancamiento, limpieza, chequeo de
--     esquema, avisos de plan actualizado) ejecutables por anon/authenticated:
--     cualquiera podía disparar notificaciones masivas.
--   * get_coach_id(): "el primer coach de la tabla", resabio sin uso → se borra.
--
-- Los cron corren como postgres y notify-cron con service_role: el REVOKE no
-- los afecta. Las guardas se agregan con replace() sobre la definición actual
-- y se verifica que el texto buscado exista (si no, la migración falla).

-- 1. Jobs internos: fuera de anon y authenticated ---------------------------
REVOKE EXECUTE ON FUNCTION public.fn_notify_weekly_summary()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_notify_stagnation()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_abandoned_sessions()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_schema_health_check()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_notify_plan_updated_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_notify_weekly_summary(), public.fn_notify_stagnation(),
  public.fn_cleanup_abandoned_sessions(), public.fn_schema_health_check() TO service_role;

-- 2. Las que usa el front: solo con sesión ----------------------------------
REVOKE EXECUTE ON FUNCTION public.release_due_forms()                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_log_volume(uuid)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_note_for_workout_log(uuid, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_note_for_workout_block_log(uuid, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_note_for_evaluation_result(uuid, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_intake_submission(uuid)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notes_thread_filter_options(uuid)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_plan_archived(uuid, boolean)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_template_to_student(uuid, uuid, date, date, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.release_due_forms(), public.calculate_log_volume(uuid),
  public.add_note_for_workout_log(uuid, text), public.add_note_for_workout_block_log(uuid, text),
  public.add_note_for_evaluation_result(uuid, text), public.process_intake_submission(uuid),
  public.notes_thread_filter_options(uuid), public.set_plan_archived(uuid, boolean),
  public.assign_template_to_student(uuid, uuid, date, date, text, jsonb, uuid) TO authenticated;

-- 3. Guardas de quién llama --------------------------------------------------
DO $mig$
DECLARE d text;
BEGIN
  -- 3a. assign_template_to_student: dueño de la plantilla, y destino = persona
  --     suya o sí mismo (para quien entrena solo o la coach que también entrena)
  d := pg_get_functiondef('public.assign_template_to_student(uuid,uuid,date,date,text,jsonb,uuid)'::regprocedure);
  IF position($o$  SELECT COALESCE(NULLIF(trim(name), ''), email) INTO v_student_name
    FROM public.profiles WHERE id = p_student_id AND role = 'student';$o$ IN d) = 0 THEN
    RAISE EXCEPTION 'v63: no encontré el bloque esperado en assign_template_to_student';
  END IF;
  d := replace(d,
$o$  SELECT COALESCE(NULLIF(trim(name), ''), email) INTO v_student_name
    FROM public.profiles WHERE id = p_student_id AND role = 'student';$o$,
$n$  -- v63: quién llama
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Requiere sesión' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (SELECT created_by FROM public.plans WHERE id = p_template_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Solo quien creó la plantilla puede asignarla' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_student_id = auth.uid() OR public.is_coach_of(p_student_id)) THEN
    RAISE EXCEPTION 'Solo podés asignar planes a tus personas o a vos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(NULLIF(trim(name), ''), email) INTO v_student_name
    FROM public.profiles WHERE id = p_student_id AND (role = 'student' OR id = auth.uid());$n$);
  EXECUTE d;

  -- 3b. set_plan_archived: solo el dueño del plan (antes: cualquier coach)
  d := pg_get_functiondef('public.set_plan_archived(uuid,boolean)'::regprocedure);
  IF position($o$if not public.is_coach() then raise exception 'solo un coach puede archivar planes' using errcode = '42501'; end if;$o$ IN d) = 0
     OR position($o$if v_row.id is null then raise exception 'plan inexistente' using errcode = 'P0002'; end if;$o$ IN d) = 0 THEN
    RAISE EXCEPTION 'v63: no encontré las guardas esperadas en set_plan_archived';
  END IF;
  d := replace(d, $o$if not public.is_coach() then raise exception 'solo un coach puede archivar planes' using errcode = '42501'; end if;$o$, '');
  d := replace(d, $o$if v_row.id is null then raise exception 'plan inexistente' using errcode = 'P0002'; end if;$o$,
$n$if v_row.id is null then raise exception 'plan inexistente' using errcode = 'P0002'; end if;
  -- v63: solo quien creó el plan
  if v_row.created_by is distinct from auth.uid() then
    raise exception 'solo quien creó el plan puede archivarlo' using errcode = '42501';
  end if;$n$);
  EXECUTE d;

  -- 3c. process_intake_submission: la persona dueña del formulario o su coach
  d := pg_get_functiondef('public.process_intake_submission(uuid)'::regprocedure);
  IF position($o$  IF NOT FOUND THEN RETURN; END IF;$o$ IN d) = 0 THEN
    RAISE EXCEPTION 'v63: no encontré el bloque esperado en process_intake_submission';
  END IF;
  d := replace(d, $o$  IF NOT FOUND THEN RETURN; END IF;$o$,
$n$  IF NOT FOUND THEN RETURN; END IF;
  -- v63: solo la persona o su coach
  IF NOT (sub.student_id = auth.uid() OR public.is_coach_of(sub.student_id)) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'insufficient_privilege';
  END IF;$n$);
  EXECUTE d;

  -- 3d. notes_thread_filter_options: la persona del hilo o su coach
  d := pg_get_functiondef('public.notes_thread_filter_options(uuid)'::regprocedure);
  IF position($o$BEGIN
  -- Ejercicios distintos$o$ IN d) = 0 THEN
    RAISE EXCEPTION 'v63: no encontré el bloque esperado en notes_thread_filter_options';
  END IF;
  d := replace(d, $o$BEGIN
  -- Ejercicios distintos$o$,
$n$BEGIN
  -- v63: solo la persona del hilo o su coach
  IF NOT EXISTS (SELECT 1 FROM public.note_threads nt
                  WHERE nt.id = p_thread_id
                    AND (nt.student_id = auth.uid() OR public.is_coach_of(nt.student_id))) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Ejercicios distintos$n$);
  EXECUTE d;
END
$mig$;

-- 4. Resabio de la época de un solo coach --------------------------------------
DROP FUNCTION IF EXISTS public.get_coach_id();
