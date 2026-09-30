-- v69 — Catálogo de coaches
-- Cada coach decide si aparece. Para aparecer tiene que tener foto,
-- presentación en cada idioma en que trabaja, ciudad y modalidad.
-- Lo ven solo personas registradas; el único contacto es "Pedir sumarme"
-- (mismo pedido que el link de invitación: la coach acepta o rechaza).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_city text,
  ADD COLUMN IF NOT EXISTS coach_work_mode text,
  ADD COLUMN IF NOT EXISTS directory_listed boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_coach_city_check
    CHECK (coach_city IS NULL OR length(coach_city) <= 80),
  ADD CONSTRAINT profiles_coach_work_mode_check
    CHECK (coach_work_mode IS NULL OR coach_work_mode = ANY (ARRAY['online', 'in_person', 'both']));

-- Qué le falta a un perfil para aparecer (vacío = listo). Lo usa el guard y el front.
CREATE OR REPLACE FUNCTION public.directory_missing(p public.profiles)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN p.role <> 'coach' THEN 'role' END,
    CASE WHEN p.avatar_url IS NULL OR btrim(p.avatar_url) = '' THEN 'photo' END,
    CASE WHEN p.coach_languages IS NULL OR cardinality(p.coach_languages) = 0 THEN 'languages' END,
    CASE WHEN p.coach_languages IS NOT NULL AND EXISTS (
           SELECT 1 FROM unnest(p.coach_languages) l
            WHERE coalesce(btrim(p.bio ->> l), '') = '') THEN 'bio' END,
    CASE WHEN p.coach_city IS NULL OR btrim(p.coach_city) = '' THEN 'city' END,
    CASE WHEN p.coach_work_mode IS NULL THEN 'work_mode' END
  ], NULL);
$$;

CREATE OR REPLACE FUNCTION public.profiles_directory_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_missing text[];
BEGIN
  IF NEW.directory_listed THEN
    v_missing := public.directory_missing(NEW);
    IF cardinality(v_missing) > 0 THEN
      RAISE EXCEPTION 'directory_incomplete: %', array_to_string(v_missing, ',')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_directory_guard ON public.profiles;
CREATE TRIGGER trg_profiles_directory_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_directory_guard();

-- Listado para personas registradas
CREATE OR REPLACE FUNCTION public.list_coach_directory()
RETURNS TABLE (id uuid, name text, avatar_url text, coach_city text, coach_work_mode text,
               coach_languages text[], bio jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.name, p.avatar_url, p.coach_city, p.coach_work_mode, p.coach_languages, p.bio
    FROM public.profiles p
   WHERE (SELECT auth.uid()) IS NOT NULL
     AND p.role = 'coach' AND p.active AND p.directory_listed
     AND p.id <> (SELECT auth.uid())
   ORDER BY p.name;
$$;
REVOKE ALL ON FUNCTION public.list_coach_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_coach_directory() TO authenticated;

-- La foto de una coach que está en el catálogo la puede ver cualquier persona registrada
DO $$
DECLARE v_def text; v_old text := $o$    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.coach_id = p_owner)$o$;
BEGIN
  v_def := pg_get_functiondef('public.can_see_avatar'::regproc);
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'v69: texto no encontrado en can_see_avatar'; END IF;
  v_def := replace(v_def, v_old, v_old || $n$
    or exists (select 1 from public.profiles c where c.id = p_owner and c.role = 'coach' and c.active and c.directory_listed)$n$);
  EXECUTE v_def;
END $$;

-- Pedir sumarse desde el catálogo (mismo pedido que por código)
CREATE OR REPLACE FUNCTION public.request_coach_link_listed(p_coach_id uuid, p_share_history boolean)
RETURNS public.coach_link_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me public.profiles; v_row public.coach_link_requests;
BEGIN
  SELECT * INTO v_me FROM public.profiles WHERE id = auth.uid();
  IF v_me.id IS NULL OR v_me.role <> 'student' THEN
    RAISE EXCEPTION 'Solo una persona que entrena puede sumarse a una coach' USING ERRCODE = '42501';
  END IF;
  IF v_me.coach_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ya tenés coach' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                  WHERE id = p_coach_id AND role = 'coach' AND active AND directory_listed) THEN
    RAISE EXCEPTION 'Esa coach no está en el catálogo' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.coach_link_requests SET status = 'cancelled', decided_at = now()
   WHERE student_id = auth.uid() AND status = 'pending';

  INSERT INTO public.coach_link_requests (student_id, coach_id, share_history)
  VALUES (auth.uid(), p_coach_id, coalesce(p_share_history, false))
  RETURNING * INTO v_row;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (p_coach_id, 'coach_link_request',
          coalesce(v_me.name, 'Alguien') || ' quiere sumarse',
          'Aceptá o rechazá el pedido desde tu lista de personas.',
          jsonb_build_object('request_id', v_row.id, 'student_id', auth.uid(),
                             'student_name', v_me.name, 'source', 'directory'));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.request_coach_link_listed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_coach_link_listed(uuid, boolean) TO authenticated;

-- Pedido pendiente propio (para mostrar "pedido enviado" en el catálogo)
CREATE OR REPLACE FUNCTION public.my_pending_coach_request()
RETURNS TABLE (request_id uuid, coach_id uuid, coach_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.id, r.coach_id, c.name, r.created_at
    FROM public.coach_link_requests r JOIN public.profiles c ON c.id = r.coach_id
   WHERE r.student_id = (SELECT auth.uid()) AND r.status = 'pending'
   ORDER BY r.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_pending_coach_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pending_coach_request() TO authenticated;
