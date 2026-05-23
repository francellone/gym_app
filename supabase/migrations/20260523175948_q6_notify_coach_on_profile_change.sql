-- Q6 (handoff 13/16): notif al coach cuando alumno cambia campos críticos del perfil.
-- Decisiones tomadas con Franco 2026-05-23:
--   - Opción B: trigger nuevo separado (no extender fn_audit_profile_changes, ese sigue intacto)
--   - Campos críticos: weight_kg, target_weight_kg, goal, tiene_lesiones, patologias,
--                      descripcion_lesiones, weekly_frequency
--   - height_cm queda fuera (no es decisión coach)
--   - Self-notif suppressed: si auth.uid() = coach_id, no notifica (evita ruido cuando el
--     coach edita desde StudentDetailPage)

-- 1) Agregar 'profile_change' al CHECK constraint de notifications.type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'plan_assigned'::text,
    'activity_update'::text,
    'session_completed'::text,
    'plan_expiring'::text,
    'stagnation_alert'::text,
    'coach_comment'::text,
    'weekly_summary'::text,
    'schema_health_alert'::text,
    'student_note'::text,
    'form_submitted'::text,
    'plan_updated'::text,
    'profile_change'::text
  ]));

-- 2) Función fn_notify_profile_change
CREATE OR REPLACE FUNCTION public.fn_notify_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_fields text[] := ARRAY[]::text[];
  v_student_name   text;
  v_body           text;
  v_data           jsonb := '{}'::jsonb;
  v_changer        uuid;
BEGIN
  -- Sólo notif sobre cambios de filas de alumnos
  IF NEW.role IS DISTINCT FROM 'student' THEN
    RETURN NEW;
  END IF;

  -- Sin coach asignado, no hay a quién notificar
  IF NEW.coach_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_changer := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_changer := NULL;
  END;

  -- Si quien hace el cambio es el coach mismo (ej. desde StudentDetailPage),
  -- no le mandamos auto-notif. Sólo notif si cambia el alumno o un sistema.
  IF v_changer IS NOT NULL AND v_changer = NEW.coach_id THEN
    RETURN NEW;
  END IF;

  -- Detectar campos críticos cambiados (compara OLD vs NEW)
  IF OLD.weight_kg IS DISTINCT FROM NEW.weight_kg THEN
    v_changed_fields := array_append(v_changed_fields, 'peso');
    v_data := v_data || jsonb_build_object(
      'weight_kg', jsonb_build_object('old', OLD.weight_kg, 'new', NEW.weight_kg)
    );
  END IF;
  IF OLD.target_weight_kg IS DISTINCT FROM NEW.target_weight_kg THEN
    v_changed_fields := array_append(v_changed_fields, 'objetivo de peso');
    v_data := v_data || jsonb_build_object(
      'target_weight_kg', jsonb_build_object('old', OLD.target_weight_kg, 'new', NEW.target_weight_kg)
    );
  END IF;
  IF OLD.goal IS DISTINCT FROM NEW.goal THEN
    v_changed_fields := array_append(v_changed_fields, 'objetivo');
    v_data := v_data || jsonb_build_object(
      'goal', jsonb_build_object('old', OLD.goal, 'new', NEW.goal)
    );
  END IF;
  IF OLD.tiene_lesiones IS DISTINCT FROM NEW.tiene_lesiones THEN
    v_changed_fields := array_append(v_changed_fields, 'lesiones');
    v_data := v_data || jsonb_build_object(
      'tiene_lesiones', jsonb_build_object('old', OLD.tiene_lesiones, 'new', NEW.tiene_lesiones)
    );
  END IF;
  IF OLD.patologias IS DISTINCT FROM NEW.patologias THEN
    v_changed_fields := array_append(v_changed_fields, 'patologías');
    v_data := v_data || jsonb_build_object(
      'patologias', jsonb_build_object('old', OLD.patologias, 'new', NEW.patologias)
    );
  END IF;
  IF OLD.descripcion_lesiones IS DISTINCT FROM NEW.descripcion_lesiones THEN
    v_changed_fields := array_append(v_changed_fields, 'descripción de lesiones');
    v_data := v_data || jsonb_build_object(
      'descripcion_lesiones', jsonb_build_object('old', OLD.descripcion_lesiones, 'new', NEW.descripcion_lesiones)
    );
  END IF;
  IF OLD.weekly_frequency IS DISTINCT FROM NEW.weekly_frequency THEN
    v_changed_fields := array_append(v_changed_fields, 'frecuencia semanal');
    v_data := v_data || jsonb_build_object(
      'weekly_frequency', jsonb_build_object('old', OLD.weekly_frequency, 'new', NEW.weekly_frequency)
    );
  END IF;

  -- Ningún campo crítico cambió → no notif
  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_student_name := COALESCE(NEW.name, 'Un alumno');

  v_body := 'Cambió: ' || array_to_string(v_changed_fields, ', ') || '.';

  v_data := v_data || jsonb_build_object(
    'student_id',     NEW.id,
    'student_name',   v_student_name,
    'changed_fields', v_changed_fields,
    'changed_by',     v_changer
  );

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.coach_id,
    'profile_change',
    v_student_name || ' actualizó su perfil',
    v_body,
    v_data
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_profile_change() IS
'Q6 (handoff 13/16, 2026-05-23): trigger AFTER UPDATE en profiles. Si un alumno (NEW.role=student) cambia alguno de 7 campos críticos (weight_kg, target_weight_kg, goal, tiene_lesiones, patologias, descripcion_lesiones, weekly_frequency), inserta notif al coach con el resumen de cambios y old/new values en data jsonb. Skip si auth.uid()=coach_id (suppress self-notif). Skip si coach_id NULL. Audit completo de TODA columna sigue vía trg_audit_profile_changes (separado, single-responsibility).';

-- 3) Trigger AFTER UPDATE
DROP TRIGGER IF EXISTS trg_notify_profile_change ON public.profiles;
CREATE TRIGGER trg_notify_profile_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_profile_change();
