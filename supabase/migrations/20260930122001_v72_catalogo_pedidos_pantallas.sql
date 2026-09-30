-- v72 — Pantallas del catálogo compartido (pedir / aprobar) + avisos
-- Base v62: catalog_access_requests, request_catalog_access, decide_catalog_access.
-- Faltaba: avisar a la dueña cuando un coach pide, avisar al coach la respuesta,
-- y que la dueña vea nombre/foto de quien pide (RLS de profiles no se lo deja).

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'plan_assigned','activity_update','session_completed','plan_expiring','stagnation_alert',
  'coach_comment','weekly_summary','schema_health_alert','student_note','form_submitted',
  'plan_updated','profile_change','evaluation_completed','week_completed','plan_completed',
  'personal_best_voided','exercise_unclear','coach_link_request','coach_link_accepted',
  'coach_link_rejected','catalog_access_request','catalog_access_approved','catalog_access_denied'
]::text[]));

-- Pedir: además de crear/reabrir el pedido, avisa a la dueña (solo si cambió a pendiente)
CREATE OR REPLACE FUNCTION public.request_catalog_access()
RETURNS public.catalog_access_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner uuid := public.base_catalog_owner(); v_row public.catalog_access_requests; v_name text;
BEGIN
  IF NOT public.is_coach() THEN
    RAISE EXCEPTION 'Solo un coach puede pedir el catálogo' USING ERRCODE = '42501';
  END IF;
  IF v_owner IS NULL OR v_owner = auth.uid() THEN
    RAISE EXCEPTION 'No hay catálogo para pedir' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.catalog_access_requests (owner_id, coach_id)
  VALUES (v_owner, auth.uid())
  ON CONFLICT (owner_id, coach_id) DO UPDATE
     SET status = 'pending', requested_at = now(), decided_at = NULL, decided_by = NULL
   WHERE catalog_access_requests.status = 'denied'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    -- ya estaba pendiente o aprobado: no se re-avisa
    SELECT * INTO v_row FROM public.catalog_access_requests
     WHERE owner_id = v_owner AND coach_id = auth.uid();
    RETURN v_row;
  END IF;
  SELECT name INTO v_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (v_owner, 'catalog_access_request',
          coalesce(v_name, 'Un coach') || ' pidió usar tu catálogo',
          'Aprobalo o rechazalo desde Ejercicios.',
          jsonb_build_object('coach_id', auth.uid(), 'coach_name', v_name, 'request_id', v_row.id));
  RETURN v_row;
END $$;

-- Decidir: solo la dueña; avisa al coach
CREATE OR REPLACE FUNCTION public.decide_catalog_access(p_coach uuid, p_approve boolean)
RETURNS public.catalog_access_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.catalog_access_requests; v_owner_name text;
BEGIN
  UPDATE public.catalog_access_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
         decided_at = now(), decided_by = auth.uid()
   WHERE owner_id = auth.uid() AND coach_id = p_coach
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No hay un pedido de ese coach para tu catálogo' USING ERRCODE = 'P0002';
  END IF;
  SELECT split_part(btrim(coalesce(name, '')), ' ', 1) INTO v_owner_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (p_coach,
          CASE WHEN p_approve THEN 'catalog_access_approved' ELSE 'catalog_access_denied' END,
          CASE WHEN p_approve THEN coalesce(v_owner_name, 'La dueña') || ' aprobó tu pedido de catálogo'
               ELSE coalesce(v_owner_name, 'La dueña') || ' no aprobó tu pedido de catálogo' END,
          CASE WHEN p_approve THEN 'Ya podés usar sus ejercicios en tus planes.'
               ELSE 'Podés seguir armando tu propio catálogo.' END,
          jsonb_build_object('owner_id', auth.uid(), 'owner_name', v_owner_name, 'request_id', v_row.id));
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.decide_catalog_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_catalog_access(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.request_catalog_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_catalog_access() TO authenticated;

-- Para la dueña: pedidos con nombre, mail y foto de quien pide
CREATE OR REPLACE FUNCTION public.catalog_requests_for_owner()
RETURNS TABLE (coach_id uuid, name text, email text, avatar_url text, status text,
               requested_at timestamptz, decided_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.coach_id, p.name, p.email, p.avatar_url, r.status, r.requested_at, r.decided_at
    FROM public.catalog_access_requests r JOIN public.profiles p ON p.id = r.coach_id
   WHERE r.owner_id = (SELECT auth.uid())
   ORDER BY (r.status = 'pending') DESC, r.requested_at DESC;
$$;
REVOKE ALL ON FUNCTION public.catalog_requests_for_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_requests_for_owner() TO authenticated;

-- Para cualquier coach: ¿soy la dueña?, ¿de quién es el catálogo?, ¿cómo está mi pedido?
CREATE OR REPLACE FUNCTION public.my_catalog_access()
RETURNS TABLE (is_owner boolean, owner_name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.base_catalog_owner() = (SELECT auth.uid()),
         (SELECT split_part(btrim(coalesce(o.name, '')), ' ', 1) FROM public.profiles o
           WHERE o.id = public.base_catalog_owner()),
         (SELECT r.status FROM public.catalog_access_requests r
           WHERE r.owner_id = public.base_catalog_owner() AND r.coach_id = (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.my_catalog_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_catalog_access() TO authenticated;
