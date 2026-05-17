-- ============================================================
-- Migration v29: notifs para forms enviados y cambios del plan
-- ------------------------------------------------------------
-- Agrega:
--   * Tipo 'form_submitted' al enum → cuando un alumno completa
--     un intake form o follow-up form (ambos llevan el mismo
--     tipo; el flavor va en data.form_kind = 'intake'|'follow_up').
--   * Tipo 'plan_updated' al enum → cuando el coach edita
--     cualquier cosa de un plan que está asignado a alguien.
--
-- Disparadores nuevos:
--   trg_notify_form_submitted        → AFTER INSERT en
--                                       intake_form_submissions
--   trg_notify_plan_updated_on_plans → AFTER UPDATE en plans
--   trg_notify_plan_updated_on_blocks
--     y _on_exercises                → AFTER INSERT/UPDATE/DELETE
--                                       en plan_blocks / plan_exercises
--   trg_notify_plan_updated_on_assignments
--                                    → AFTER UPDATE OF
--                                       (start_date, end_date,
--                                        preferred_days, schedule_mode,
--                                        plan_type) en plan_assignments
--
-- Comportamiento clave:
--   - No notifica si el plan es template (plans.is_template=true).
--   - Notifica sólo a alumnos con `plan_assignments.active=true`
--     para ese plan.
--   - Deduplicado a 1 notif por (alumno, plan, día) — si el
--     coach edita 30 veces hoy, el alumno recibe 1 sola notif.
--   - El trigger en plan_assignments sólo notifica al alumno
--     dueño de ese assignment (no a todos los alumnos del plan).
--
-- Nota sobre el form_submitted:
--   intake_form_submissions ya tiene coach_id resuelto en su
--   propia columna (no depende de profiles.coach_id), así que
--   el trigger lo usa directamente.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. AMPLIAR ENUM type
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'plan_assigned',
    'activity_update',
    'session_completed',
    'plan_expiring',
    'stagnation_alert',
    'coach_comment',
    'weekly_summary',
    'schema_health_alert',
    'student_note',
    'form_submitted',
    'plan_updated'
  ));

-- ────────────────────────────────────────────────────────────
-- 2. FORM SUBMITTED → al coach
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_form_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name text;
  v_form_kind    text;
  v_form_name    text;
  v_body_extra   text;
BEGIN
  -- coach_id viene resuelto en la propia submission (no usamos profiles.coach_id)
  IF NEW.coach_id IS NULL THEN RETURN NEW; END IF;

  v_form_name := COALESCE(NEW.form_snapshot->>'name', 'formulario');

  SELECT a.form_kind INTO v_form_kind
    FROM public.intake_form_assignments a
   WHERE a.id = NEW.assignment_id;

  SELECT name INTO v_student_name
    FROM public.profiles WHERE id = NEW.student_id;

  v_body_extra := CASE v_form_kind
                    WHEN 'follow_up' THEN ' (seguimiento)'
                    WHEN 'intake'    THEN ' (alta)'
                    ELSE ''
                  END;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.coach_id,
    'form_submitted',
    COALESCE(v_student_name, 'Un alumno') || ' completó un formulario',
    '"' || v_form_name || '"' || v_body_extra,
    jsonb_build_object(
      'submission_id', NEW.id,
      'assignment_id', NEW.assignment_id,
      'student_id',    NEW.student_id,
      'student_name',  v_student_name,
      'form_kind',     v_form_kind,
      'form_name',     v_form_name
    )
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_form_submitted() IS
  'v29: notifica al coach cuando un alumno envía un intake/follow-up form.';

DROP TRIGGER IF EXISTS trg_notify_form_submitted ON public.intake_form_submissions;
CREATE TRIGGER trg_notify_form_submitted
  AFTER INSERT ON public.intake_form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_form_submitted();

-- ────────────────────────────────────────────────────────────
-- 3. PLAN UPDATED → al alumno(s) asignado(s)
-- ────────────────────────────────────────────────────────────

-- 3a. Función interna que centraliza la lógica
CREATE OR REPLACE FUNCTION public.fn_notify_plan_updated_internal(
  p_plan_id        uuid,
  p_only_student   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_title  text;
  v_is_template boolean;
  v_assignment  RECORD;
BEGIN
  IF p_plan_id IS NULL THEN RETURN; END IF;

  SELECT title, is_template
    INTO v_plan_title, v_is_template
    FROM public.plans
   WHERE id = p_plan_id;

  -- Skip si no existe o si es template (no tiene alumnos a notificar)
  IF v_plan_title IS NULL OR v_is_template = true THEN
    RETURN;
  END IF;

  FOR v_assignment IN
    SELECT pa.student_id
      FROM public.plan_assignments pa
     WHERE pa.plan_id = p_plan_id
       AND pa.active  = true
       AND (p_only_student IS NULL OR pa.student_id = p_only_student)
  LOOP
    -- Dedupe por día: 1 notif por (alumno, plan, día)
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
       WHERE user_id = v_assignment.student_id
         AND type    = 'plan_updated'
         AND (data->>'plan_id')::uuid = p_plan_id
         AND created_at::date = CURRENT_DATE
    ) THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_assignment.student_id,
        'plan_updated',
        'Tu coach actualizó tu plan',
        'Hubo cambios en "' || v_plan_title || '". Revisalo cuando puedas.',
        jsonb_build_object(
          'plan_id',    p_plan_id,
          'plan_title', v_plan_title
        )
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_plan_updated_internal(uuid, uuid) IS
  'v29: notifica a los alumnos asignados de un plan que su plan fue actualizado. '
  'Dedupe por (alumno, plan, día). Skip si plan es template.';

-- 3b. Wrapper para `plans` (UPDATE)
CREATE OR REPLACE FUNCTION public.fn_notify_plan_updated_on_plans()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM public.fn_notify_plan_updated_internal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- 3c. Wrapper para `plan_blocks` / `plan_exercises` (INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION public.fn_notify_plan_updated_on_children()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  v_plan_id := COALESCE(NEW.plan_id, OLD.plan_id);
  PERFORM public.fn_notify_plan_updated_internal(v_plan_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3d. Wrapper para `plan_assignments` (UPDATE de campos visibles para alumno)
CREATE OR REPLACE FUNCTION public.fn_notify_plan_updated_on_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sólo notificamos al alumno dueño de este assignment (no a todos los del plan)
  PERFORM public.fn_notify_plan_updated_internal(NEW.plan_id, NEW.student_id);
  RETURN NEW;
END;
$$;

-- 3e. Triggers
DROP TRIGGER IF EXISTS trg_notify_plan_updated_on_plans ON public.plans;
CREATE TRIGGER trg_notify_plan_updated_on_plans
  AFTER UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_plan_updated_on_plans();

DROP TRIGGER IF EXISTS trg_notify_plan_updated_on_blocks ON public.plan_blocks;
CREATE TRIGGER trg_notify_plan_updated_on_blocks
  AFTER INSERT OR UPDATE OR DELETE ON public.plan_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_plan_updated_on_children();

DROP TRIGGER IF EXISTS trg_notify_plan_updated_on_exercises ON public.plan_exercises;
CREATE TRIGGER trg_notify_plan_updated_on_exercises
  AFTER INSERT OR UPDATE OR DELETE ON public.plan_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_plan_updated_on_children();

DROP TRIGGER IF EXISTS trg_notify_plan_updated_on_assignments ON public.plan_assignments;
CREATE TRIGGER trg_notify_plan_updated_on_assignments
  AFTER UPDATE OF start_date, end_date, preferred_days, schedule_mode, plan_type
  ON public.plan_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_plan_updated_on_assignments();

-- ────────────────────────────────────────────────────────────
-- 4. VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_enum_ok        boolean;
  v_form_trigger   boolean;
  v_plan_triggers  int;
BEGIN
  SELECT 'form_submitted' = ANY(string_to_array(
           regexp_replace(pg_get_constraintdef(c.oid), '[^a-z_,]', '', 'g'),
           ','))
    INTO v_enum_ok
    FROM pg_constraint c
    JOIN pg_class      cl ON cl.oid = c.conrelid
   WHERE cl.relname = 'notifications'
     AND c.conname  = 'notifications_type_check';

  IF NOT v_enum_ok THEN
    RAISE EXCEPTION 'v29: form_submitted no quedó en el enum';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_notify_form_submitted'
       AND NOT tgisinternal
  ) INTO v_form_trigger;

  IF NOT v_form_trigger THEN
    RAISE EXCEPTION 'v29: trigger trg_notify_form_submitted no se creó';
  END IF;

  SELECT count(*) INTO v_plan_triggers
    FROM pg_trigger
   WHERE tgname IN (
     'trg_notify_plan_updated_on_plans',
     'trg_notify_plan_updated_on_blocks',
     'trg_notify_plan_updated_on_exercises',
     'trg_notify_plan_updated_on_assignments'
   ) AND NOT tgisinternal;

  IF v_plan_triggers <> 4 THEN
    RAISE EXCEPTION 'v29: esperaba 4 triggers de plan_updated, encontré %', v_plan_triggers;
  END IF;

  RAISE NOTICE 'v29 ok: enum ampliado + 5 triggers nuevos (1 form + 4 plan)';
END;
$$;
