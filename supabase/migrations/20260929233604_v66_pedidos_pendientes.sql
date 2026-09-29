-- v66 — La coach ve quién le pide sumarse
--
-- La coach todavía no puede leer el perfil de quien le manda un pedido (la
-- RLS de profiles solo le muestra a SUS personas), así que la lista de
-- pedidos pendientes sale de esta función: nombre, mail, foto y si comparte
-- lo anterior. Solo pedidos pendientes y solo los dirigidos a quien llama.
CREATE OR REPLACE FUNCTION public.my_pending_link_requests()
RETURNS TABLE (
  request_id    uuid,
  student_id    uuid,
  name          text,
  email         text,
  avatar_url    text,
  share_history boolean,
  created_at    timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.id, r.student_id, p.name, p.email, p.avatar_url, r.share_history, r.created_at
    FROM public.coach_link_requests r
    JOIN public.profiles p ON p.id = r.student_id
   WHERE r.coach_id = auth.uid()
     AND r.status = 'pending'
     AND public.is_coach()
   ORDER BY r.created_at;
$$;
REVOKE ALL ON FUNCTION public.my_pending_link_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pending_link_requests() TO authenticated;
