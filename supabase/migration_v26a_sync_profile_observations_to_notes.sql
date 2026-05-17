-- ============================================================
-- Migration v26a: Fase D step 1 — espejo de profiles.observations
-- y profiles.coach_notes hacia el panel de notas
-- ------------------------------------------------------------
-- Cierra el agujero donde el coach edita observaciones / notas
-- privadas desde StudentInfoTab y esos cambios no aparecen en el
-- panel. A partir de v26a, cada save en StudentInfoTab que cambie
-- una de las dos columnas crea una nueva nota en el thread del
-- alumno.
--
-- Semántica: a diferencia de los mirrors de workout_logs (1:1 con
-- el registro), las observaciones del coach son un campo "running"
-- que se sobreescribe. Optamos por patrón INSERT (historia) en
-- lugar de UPSERT (estado actual):
--   - Cada edición = una nueva nota en el panel.
--   - El thread acumula la cronología de observaciones.
--   - La columna legacy sigue guardando el último valor.
--   - Si se borra el campo (NULL), las notas históricas se mantienen
--     en el panel — el coach puede borrarlas individualmente desde
--     el panel si lo desea.
--
-- IS DISTINCT FROM guard: si el save de StudentInfoTab no cambia
-- estas columnas (típico cuando el coach edita otros campos del
-- perfil), el trigger es no-op.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_sync_profile_observations_to_notes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_id  uuid;
  v_coach_id   uuid;
  v_old_obs    text;  v_new_obs    text;
  v_old_priv   text;  v_new_priv   text;
BEGIN
  IF NEW.role <> 'student' THEN RETURN NEW; END IF;

  v_coach_id := public.get_coach_id();
  IF v_coach_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.id = v_coach_id THEN RETURN NEW; END IF;

  v_thread_id := public.notes_get_or_create_thread(v_coach_id, NEW.id);
  IF v_thread_id IS NULL THEN RETURN NEW; END IF;

  v_new_obs  := NULLIF(trim(NEW.observations), '');
  v_new_priv := NULLIF(trim(NEW.coach_notes), '');

  IF TG_OP = 'UPDATE' THEN
    v_old_obs  := NULLIF(trim(OLD.observations), '');
    v_old_priv := NULLIF(trim(OLD.coach_notes), '');
  END IF;

  IF v_old_obs IS DISTINCT FROM v_new_obs AND v_new_obs IS NOT NULL THEN
    INSERT INTO public.notes (
      thread_id, author_id, author_role, body, visibility, context_type
    )
    VALUES (
      v_thread_id, v_coach_id, 'coach', v_new_obs, 'shared', 'free'
    );
  END IF;

  IF v_old_priv IS DISTINCT FROM v_new_priv AND v_new_priv IS NOT NULL THEN
    INSERT INTO public.notes (
      thread_id, author_id, author_role, body, visibility, context_type
    )
    VALUES (
      v_thread_id, v_coach_id, 'coach', v_new_priv, 'coach_private', 'free'
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_profile_observations_to_notes() IS
  'Espeja profiles.observations y profiles.coach_notes hacia notes con patrón INSERT (historia). Fase D step 1 / v26a.';

DROP TRIGGER IF EXISTS trg_sync_profile_observations_to_notes ON public.profiles;
CREATE TRIGGER trg_sync_profile_observations_to_notes
  AFTER INSERT OR UPDATE OF observations, coach_notes ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_profile_observations_to_notes();
