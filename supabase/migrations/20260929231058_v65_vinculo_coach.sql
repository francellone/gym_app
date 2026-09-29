-- v65 — Registro propio, link de invitación de la coach y vínculo aceptado
--
-- Decisiones de Franco (2026-09-29):
--   * Cada coach tiene su link de invitación (código corto al azar, se puede
--     regenerar). Quien entra por el link general se registra sin coach.
--   * Quien pide sumarse a una coach queda PENDIENTE hasta que ella acepta.
--   * Al pedir, la persona decide una sola vez si la coach ve lo que entrenó
--     antes de sumarse. Lo posterior lo ve siempre.
--   * Registro con confirmación de mail; el perfil se crea después, al elegir
--     "entreno", "entreno a otros" o ambas (complete_signup).
--
-- Además, cierra tres huecos encontrados en la misma revisión:
--   * activity_logs: cualquier coach veía y editaba actividades de todos.
--   * exercise_merges: cualquier coach veía todas las fusiones.
--   * push_subscriptions: una policy con USING (true) dejaba leer TODAS las
--     suscripciones push (endpoint y claves) incluso sin sesión.

-- 0. Huecos ----------------------------------------------------------------------
DROP POLICY IF EXISTS activity_coach_all ON public.activity_logs;
CREATE POLICY activity_coach_own_students ON public.activity_logs
  FOR ALL TO authenticated
  USING (public.is_coach_of(student_id))
  WITH CHECK (public.is_coach_of(student_id));

DROP POLICY IF EXISTS coach_select_exercise_merges ON public.exercise_merges;
CREATE POLICY coach_select_own_exercise_merges ON public.exercise_merges
  FOR SELECT TO authenticated
  USING (merged_by = (SELECT auth.uid()));

-- service_role no necesita policy (saltea la RLS)
DROP POLICY IF EXISTS push_subs_service_select ON public.push_subscriptions;

-- Tipos de aviso nuevos
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'plan_assigned','activity_update','session_completed','plan_expiring','stagnation_alert',
  'coach_comment','weekly_summary','schema_health_alert','student_note','form_submitted',
  'plan_updated','profile_change','evaluation_completed','week_completed','plan_completed',
  'personal_best_voided','exercise_unclear',
  'coach_link_request','coach_link_accepted','coach_link_rejected']));

-- 1. Desde cuándo ve la coach -----------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_visible_since timestamptz;
COMMENT ON COLUMN public.profiles.coach_visible_since IS
  'Si la persona se sumó a su coach eligiendo NO compartir lo anterior: desde cuándo la coach ve sus datos. NULL = ve todo.';

-- Nadie lo cambia desde la API (ni la persona ni la coach): solo decide_coach_link.
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.profiles_guard_privileged()'::regprocedure);
  IF position($o$IF NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role THEN$o$ IN d) = 0 THEN
    RAISE EXCEPTION 'v65: no encontré la guarda de rol en profiles_guard_privileged';
  END IF;
  d := replace(d, $o$IF NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role THEN$o$,
    $n$IF NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.coach_visible_since IS DISTINCT FROM OLD.coach_visible_since THEN$n$);
  EXECUTE d;
END
$mig$;

-- La coach no ve filas de antes de esa fecha (la persona sí ve todo lo suyo).
-- SQL simple (no SECURITY DEFINER) para que el planificador lo integre: la
-- coach ya puede leer el perfil de sus personas.
CREATE OR REPLACE FUNCTION public.coach_history_visible(p_student uuid, p_day date)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_student
       AND p.coach_visible_since IS NOT NULL
       AND p_day < (p.coach_visible_since AT TIME ZONE 'America/Argentina/Cordoba')::date
  );
$$;

DROP POLICY IF EXISTS history_cutoff ON public.workout_logs;
CREATE POLICY history_cutoff ON public.workout_logs AS RESTRICTIVE FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()) OR public.coach_history_visible(student_id, logged_date));
DROP POLICY IF EXISTS history_cutoff ON public.workout_sessions;
CREATE POLICY history_cutoff ON public.workout_sessions AS RESTRICTIVE FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()) OR public.coach_history_visible(student_id, logged_date));
DROP POLICY IF EXISTS history_cutoff ON public.workout_block_logs;
CREATE POLICY history_cutoff ON public.workout_block_logs AS RESTRICTIVE FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()) OR public.coach_history_visible(student_id, logged_date));
DROP POLICY IF EXISTS history_cutoff ON public.wellbeing_logs;
CREATE POLICY history_cutoff ON public.wellbeing_logs AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.coach_history_visible(user_id, date));
DROP POLICY IF EXISTS history_cutoff ON public.activity_logs;
CREATE POLICY history_cutoff ON public.activity_logs AS RESTRICTIVE FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()) OR public.coach_history_visible(student_id, date));
DROP POLICY IF EXISTS history_cutoff ON public.evaluation_results;
CREATE POLICY history_cutoff ON public.evaluation_results AS RESTRICTIVE FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()) OR public.coach_history_visible(student_id, eval_date));
DROP POLICY IF EXISTS history_cutoff ON public.student_milestones;
CREATE POLICY history_cutoff ON public.student_milestones AS RESTRICTIVE FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR public.coach_history_visible(student_id, (created_at AT TIME ZONE 'America/Argentina/Cordoba')::date));

-- 2. Link de invitación ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_invites (
  coach_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE CHECK (code ~ '^[A-HJ-NP-Z2-9]{7}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_invites_own ON public.coach_invites;
CREATE POLICY coach_invites_own ON public.coach_invites
  FOR SELECT TO authenticated USING (coach_id = (SELECT auth.uid()));
-- sin policies de escritura: todo por RPC

CREATE OR REPLACE FUNCTION public._new_invite_code()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path TO 'public' AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin I, O, 0, 1
  c text;
BEGIN
  LOOP
    SELECT string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      INTO c FROM generate_series(1, 7);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.coach_invites WHERE code = c);
  END LOOP;
  RETURN c;
END;
$$;
REVOKE ALL ON FUNCTION public._new_invite_code() FROM PUBLIC, anon, authenticated;

-- La coach obtiene su código (se crea la primera vez)
CREATE OR REPLACE FUNCTION public.my_invite_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text;
BEGIN
  IF NOT public.is_coach() THEN
    RAISE EXCEPTION 'Solo una coach tiene link de invitación' USING ERRCODE = '42501';
  END IF;
  SELECT code INTO v FROM public.coach_invites WHERE coach_id = auth.uid();
  IF v IS NULL THEN
    INSERT INTO public.coach_invites (coach_id, code) VALUES (auth.uid(), public._new_invite_code())
    RETURNING code INTO v;
  END IF;
  RETURN v;
END;
$$;

-- Link nuevo: el anterior deja de funcionar
CREATE OR REPLACE FUNCTION public.regenerate_invite_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text;
BEGIN
  IF NOT public.is_coach() THEN
    RAISE EXCEPTION 'Solo una coach tiene link de invitación' USING ERRCODE = '42501';
  END IF;
  v := public._new_invite_code();
  INSERT INTO public.coach_invites (coach_id, code) VALUES (auth.uid(), v)
  ON CONFLICT (coach_id) DO UPDATE SET code = EXCLUDED.code, created_at = now();
  RETURN v;
END;
$$;

-- Para mostrar "Te estás sumando con X" en la pantalla de registro (sin sesión).
-- Devuelve solo el nombre de pila; nada más de la coach.
CREATE OR REPLACE FUNCTION public.resolve_invite_code(p_code text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT split_part(btrim(coalesce(p.name, '')), ' ', 1)
    FROM public.coach_invites i JOIN public.profiles p ON p.id = i.coach_id
   WHERE i.code = upper(btrim(p_code)) AND p.role = 'coach' AND p.active;
$$;

-- 3. Alta del perfil propio (después de confirmar el mail) ---------------------------
CREATE OR REPLACE FUNCTION public.complete_signup(
  p_name text, p_language text, p_as_coach boolean, p_also_trains boolean DEFAULT false)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text; v_row public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Requiere sesión' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'El perfil ya existe' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL OR length(btrim(p_name)) > 120 THEN
    RAISE EXCEPTION 'Nombre inválido' USING ERRCODE = '22023';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Confirmá tu mail antes de seguir' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (id, email, name, role, coach_id, language, also_trains)
  VALUES (auth.uid(), v_email, btrim(p_name),
          CASE WHEN p_as_coach THEN 'coach' ELSE 'student' END,
          NULL,
          CASE WHEN p_language = 'en' THEN 'en' ELSE 'es' END,
          coalesce(p_as_coach AND p_also_trains, false))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- 4. Pedido de vínculo con una coach ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_link_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_history boolean NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  CHECK (student_id <> coach_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS coach_link_requests_one_pending
  ON public.coach_link_requests (student_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS coach_link_requests_coach_pending
  ON public.coach_link_requests (coach_id) WHERE status = 'pending';
ALTER TABLE public.coach_link_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_link_requests_read ON public.coach_link_requests;
CREATE POLICY coach_link_requests_read ON public.coach_link_requests
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR coach_id = (SELECT auth.uid()));
-- sin policies de escritura: todo por RPC

CREATE OR REPLACE FUNCTION public.request_coach_link(p_code text, p_share_history boolean)
RETURNS public.coach_link_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_coach uuid; v_me public.profiles; v_row public.coach_link_requests;
BEGIN
  SELECT * INTO v_me FROM public.profiles WHERE id = auth.uid();
  IF v_me.id IS NULL OR v_me.role <> 'student' THEN
    RAISE EXCEPTION 'Solo una persona que entrena puede sumarse a una coach' USING ERRCODE = '42501';
  END IF;
  IF v_me.coach_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ya tenés coach' USING ERRCODE = 'P0001';
  END IF;
  SELECT i.coach_id INTO v_coach
    FROM public.coach_invites i JOIN public.profiles p ON p.id = i.coach_id
   WHERE i.code = upper(btrim(p_code)) AND p.role = 'coach' AND p.active;
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'El link de invitación no es válido' USING ERRCODE = 'P0002';
  END IF;

  -- un solo pedido pendiente: si había otro, se reemplaza
  UPDATE public.coach_link_requests SET status = 'cancelled', decided_at = now()
   WHERE student_id = auth.uid() AND status = 'pending';

  INSERT INTO public.coach_link_requests (student_id, coach_id, share_history)
  VALUES (auth.uid(), v_coach, coalesce(p_share_history, false))
  RETURNING * INTO v_row;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (v_coach, 'coach_link_request',
          coalesce(v_me.name, 'Alguien') || ' quiere sumarse',
          'Aceptá o rechazá el pedido desde tu lista de personas.',
          jsonb_build_object('request_id', v_row.id, 'student_id', auth.uid(),
                             'student_name', v_me.name));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_coach_link_request()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.coach_link_requests SET status = 'cancelled', decided_at = now()
   WHERE student_id = auth.uid() AND status = 'pending';
$$;

CREATE OR REPLACE FUNCTION public.decide_coach_link(p_request_id uuid, p_accept boolean)
RETURNS public.coach_link_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.coach_link_requests; v_coach_name text;
BEGIN
  SELECT * INTO v_row FROM public.coach_link_requests WHERE id = p_request_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.coach_id IS DISTINCT FROM auth.uid() OR NOT public.is_coach() THEN
    RAISE EXCEPTION 'No hay un pedido tuyo con ese id' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'El pedido ya no está pendiente' USING ERRCODE = 'P0001';
  END IF;

  IF p_accept THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_row.student_id AND coach_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Esa persona ya tiene coach' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.profiles
       SET coach_id = v_row.coach_id,
           coach_visible_since = CASE WHEN v_row.share_history THEN NULL ELSE now() END
     WHERE id = v_row.student_id;
  END IF;

  UPDATE public.coach_link_requests
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END, decided_at = now()
   WHERE id = p_request_id RETURNING * INTO v_row;

  SELECT split_part(btrim(coalesce(name, '')), ' ', 1) INTO v_coach_name FROM public.profiles WHERE id = v_row.coach_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (v_row.student_id,
          CASE WHEN p_accept THEN 'coach_link_accepted' ELSE 'coach_link_rejected' END,
          CASE WHEN p_accept THEN coalesce(v_coach_name, 'Tu coach') || ' aceptó tu pedido'
               ELSE coalesce(v_coach_name, 'La coach') || ' no aceptó tu pedido' END,
          CASE WHEN p_accept THEN 'Ya forman parte del mismo equipo.' ELSE 'Podés seguir entrenando por tu cuenta.' END,
          jsonb_build_object('request_id', v_row.id, 'coach_id', v_row.coach_id, 'coach_name', v_coach_name));
  RETURN v_row;
END;
$$;

-- 5. Permisos -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.my_invite_code(), public.regenerate_invite_code(),
  public.complete_signup(text, text, boolean, boolean), public.request_coach_link(text, boolean),
  public.cancel_coach_link_request(), public.decide_coach_link(uuid, boolean),
  public.resolve_invite_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_invite_code(), public.regenerate_invite_code(),
  public.complete_signup(text, text, boolean, boolean), public.request_coach_link(text, boolean),
  public.cancel_coach_link_request(), public.decide_coach_link(uuid, boolean),
  public.resolve_invite_code(text) TO authenticated;
-- la pantalla de registro muestra el nombre de la coach antes de tener sesión
GRANT EXECUTE ON FUNCTION public.resolve_invite_code(text) TO anon;
