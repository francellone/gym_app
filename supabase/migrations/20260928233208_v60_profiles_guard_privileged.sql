-- v60 — Nadie se sube el rol ni se cambia de coach desde la API
--
-- Hallazgo 2026-09-27: `authenticated` tiene UPDATE sobre todas las columnas
-- de profiles y la policy student_update_own_profile no limita QUÉ cambia.
-- Probado con rollback: una persona hacía `update profiles set role='coach'`
-- sobre su fila y is_coach() pasaba a true (y con eso veía notas, wellbeing
-- y evaluaciones de todas las personas por las tablas sin acotar).
--
-- Regla (vale para llamadas de la API: roles authenticated / anon):
--   * role e id no se cambian nunca desde la API.
--   * Sobre SU PROPIA fila, nadie cambia: coach_id, email, is_test, active,
--     modality ni los campos de pago. Eso lo decide su coach o el servidor.
--   * El coach de la persona sí puede tocar active / is_test / modality /
--     pagos (StudentInfoTab, StudentsPage). coach_id ya lo custodia la RLS
--     (el WITH CHECK implícito exige que siga siendo él).
--   * INSERT desde la API: solo role='student'; si se inserta a sí misma,
--     sin coach; si lo inserta un coach, con coach_id = ese coach.
--
-- Quedan afuera (corren como postgres / service_role): la edge function
-- create-student, payments_sync_profile y process_intake_submission
-- (SECURITY DEFINER), y el mantenimiento por SQL.
--
-- Cuando exista el registro con elección de rol, el rol se va a fijar por
-- una RPC controlada, no abriendo este guard.

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Solo se custodian las llamadas que llegan por la API con JWT de usuario.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'student' THEN
      RAISE EXCEPTION 'No se puede crear un perfil con rol %', NEW.role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.id = v_uid AND NEW.coach_id IS NOT NULL THEN
      RAISE EXCEPTION 'No se puede elegir coach al crear el propio perfil'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.id IS DISTINCT FROM v_uid AND NEW.coach_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Un coach solo puede crear perfiles propios'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'El rol no se puede cambiar desde la app'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.id = v_uid THEN
    IF NEW.coach_id           IS DISTINCT FROM OLD.coach_id
    OR NEW.email              IS DISTINCT FROM OLD.email
    OR NEW.is_test            IS DISTINCT FROM OLD.is_test
    OR NEW.active             IS DISTINCT FROM OLD.active
    OR NEW.modality           IS DISTINCT FROM OLD.modality
    OR NEW.last_payment_date  IS DISTINCT FROM OLD.last_payment_date
    OR NEW.next_payment_due   IS DISTINCT FROM OLD.next_payment_due
    OR NEW.payment_notes      IS DISTINCT FROM OLD.payment_notes
    OR NEW.payment_cycle_days IS DISTINCT FROM OLD.payment_cycle_days
    THEN
      RAISE EXCEPTION 'Estos datos del perfil los administra el coach'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileged
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged();
