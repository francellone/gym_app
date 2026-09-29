-- v62 — Catálogo de ejercicios compartido con dueño + pedido de acceso
--
-- Decisiones de Franco (2026-09-28/29):
--   * Las personas sin coach usan el catálogo de Anto. Todo lo que Anto cree
--     entra al catálogo.
--   * Si una persona crea un ejercicio, lo ven los demás; solo el dueño lo
--     modifica, archiva o fusiona.
--   * Un coach nuevo arranca con catálogo vacío. Puede PEDIR el de Anto; ella
--     acepta o rechaza. Si acepta, arma con esos ejercicios (solo lectura) y
--     lo que él cree también entra al compartido. Si rechaza, lo que arme queda
--     para él.
--   * Cada coach lee los ejercicios que aparecen en los planes de sus personas.
--
-- Modelo:
--   catalog_settings.base_owner_id  → la dueña del catálogo base (Anto).
--   catalog_access_requests         → pedido coach → dueña, pending/approved/denied.
--   Un ejercicio es COMPARTIDO si lo creó la dueña, una persona (role student)
--   o un coach aprobado. Lo LEEN del compartido: la dueña, los coaches
--   aprobados y las personas sin coach. Además cada uno lee lo propio, lo de
--   sus planes asignados y (coach) lo de los planes de sus personas o propios.
--   Las personas CON coach siguen viendo solo lo de sus planes (sin cambios).
--   Escribir un ejercicio: solo su dueño (coach_manage_own_exercises, sin cambios).

-- 1. Configuración: quién es la dueña del catálogo base -------------------
CREATE TABLE IF NOT EXISTS public.catalog_settings (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  base_owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.catalog_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_settings_read ON public.catalog_settings;
CREATE POLICY catalog_settings_read ON public.catalog_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.catalog_settings (id, base_owner_id)
SELECT true, id FROM public.profiles
 WHERE email = 'anto.au.almanza@gmail.com' AND role = 'coach'
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.base_catalog_owner()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT base_owner_id FROM public.catalog_settings WHERE id;
$$;

-- 2. Pedidos de acceso -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_access_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (owner_id <> coach_id),
  UNIQUE (owner_id, coach_id)
);
ALTER TABLE public.catalog_access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_requests_read_own ON public.catalog_access_requests;
CREATE POLICY catalog_requests_read_own ON public.catalog_access_requests
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid() OR owner_id = auth.uid());
-- Sin policies de escritura: todo pasa por las RPC de abajo.

-- 3. Quién aporta al compartido y quién lo lee ----------------------------
CREATE OR REPLACE FUNCTION public.catalog_contributes(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_user IS NULL                                   -- semillas viejas
      OR p_user = public.base_catalog_owner()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role = 'student')
      OR EXISTS (SELECT 1 FROM public.catalog_access_requests r
                  WHERE r.coach_id = p_user AND r.owner_id = public.base_catalog_owner()
                    AND r.status = 'approved');
$$;

CREATE OR REPLACE FUNCTION public.catalog_reader(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_user = public.base_catalog_owner()
      OR EXISTS (SELECT 1 FROM public.profiles
                  WHERE id = p_user AND role = 'student'
                    AND (coach_id IS NULL OR coach_id = p_user))
      OR EXISTS (SELECT 1 FROM public.catalog_access_requests r
                  WHERE r.coach_id = p_user AND r.owner_id = public.base_catalog_owner()
                    AND r.status = 'approved');
$$;

CREATE OR REPLACE FUNCTION public.can_see_exercise(p_exercise uuid, p_created_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    p_created_by = auth.uid()
    OR (public.catalog_reader(auth.uid()) AND public.catalog_contributes(p_created_by))
    -- en un plan asignado a mí
    OR EXISTS (SELECT 1 FROM public.plan_exercises pe
                JOIN public.plan_assignments pa ON pa.plan_id = pe.plan_id
               WHERE pa.student_id = auth.uid()
                 AND (pe.exercise_id = p_exercise OR pe.rm_reference_exercise_id = p_exercise))
    -- coach: en un plan mío o de una de mis personas
    OR (public.is_coach() AND EXISTS (
          SELECT 1 FROM public.plan_exercises pe
            JOIN public.plans p ON p.id = pe.plan_id
           WHERE (pe.exercise_id = p_exercise OR pe.rm_reference_exercise_id = p_exercise)
             AND (p.created_by = auth.uid()
                  OR EXISTS (SELECT 1 FROM public.plan_assignments pa
                              WHERE pa.plan_id = p.id AND public.is_coach_of(pa.student_id)))));
$$;

REVOKE ALL ON FUNCTION public.base_catalog_owner(), public.catalog_contributes(uuid),
  public.catalog_reader(uuid), public.can_see_exercise(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.base_catalog_owner(), public.catalog_contributes(uuid),
  public.catalog_reader(uuid), public.can_see_exercise(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS coach_select_all_exercises ON public.exercises;
DROP POLICY IF EXISTS student_view_assigned_exercises ON public.exercises;
CREATE POLICY select_visible_exercises ON public.exercises
  FOR SELECT TO authenticated
  USING (public.can_see_exercise(id, created_by));

-- 4. RPC del pedido ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_catalog_access()
RETURNS public.catalog_access_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner uuid := public.base_catalog_owner(); v_row public.catalog_access_requests;
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
   WHERE catalog_access_requests.status = 'denied'   -- se puede volver a pedir tras un rechazo
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.catalog_access_requests
     WHERE owner_id = v_owner AND coach_id = auth.uid();
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_catalog_access(p_coach uuid, p_approve boolean)
RETURNS public.catalog_access_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.catalog_access_requests;
BEGIN
  UPDATE public.catalog_access_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
         decided_at = now(), decided_by = auth.uid()
   WHERE owner_id = auth.uid() AND coach_id = p_coach
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No hay un pedido de ese coach para tu catálogo' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.request_catalog_access(), public.decide_catalog_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_catalog_access(), public.decide_catalog_access(uuid, boolean) TO authenticated;

-- 5. Archivar y fusionar: solo el dueño ------------------------------------
-- (se reemplazan solo las guardas de entrada; el cuerpo queda igual)
CREATE OR REPLACE FUNCTION public.set_exercise_archived(p_exercise_id uuid, p_archived boolean)
 RETURNS exercises
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_row public.exercises;
begin
  if not public.is_coach() then raise exception 'solo un coach puede archivar ejercicios' using errcode = '42501'; end if;
  select * into v_row from public.exercises where id = p_exercise_id;
  if v_row.id is null then raise exception 'ejercicio inexistente' using errcode = 'P0002'; end if;
  -- v62: solo quien lo creó
  if v_row.created_by is distinct from auth.uid() then
    raise exception 'solo quien creó el ejercicio puede archivarlo' using errcode = '42501';
  end if;
  if not p_archived and v_row.merged_into_id is not null then
    raise exception 'este ejercicio fue fusionado en otro y no se puede desarchivar' using errcode = 'P0001';
  end if;
  update public.exercises
     set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
         archived_by = case when p_archived then coalesce(archived_by, auth.uid()) else null end
   where id = p_exercise_id returning * into v_row;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.merge_exercises(p_from uuid, p_into uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_from public.exercises; v_into public.exercises; v_counts jsonb := '{}'::jsonb; v_tag_ids uuid[]; n bigint;
        v_filled text[] := '{}'; v_i18n jsonb;
begin
  if not public.is_coach() then raise exception 'solo un coach puede fusionar ejercicios' using errcode = '42501'; end if;
  if p_from = p_into then raise exception 'no se puede fusionar un ejercicio consigo mismo' using errcode = 'P0001'; end if;
  select * into v_from from public.exercises where id = p_from for update;
  select * into v_into from public.exercises where id = p_into for update;
  if v_from.id is null or v_into.id is null then raise exception 'ejercicio inexistente' using errcode = 'P0002'; end if;
  -- v62: solo el dueño, y de los DOS (la fusión completa huecos del destino, o sea lo modifica)
  if v_from.created_by is distinct from auth.uid() or v_into.created_by is distinct from auth.uid() then
    raise exception 'solo quien creó los dos ejercicios puede fusionarlos' using errcode = '42501';
  end if;
  if v_from.merged_into_id is not null then raise exception 'el ejercicio origen ya fue fusionado' using errcode = 'P0001'; end if;
  if v_into.merged_into_id is not null then raise exception 'el ejercicio destino es una lápida de otra fusión' using errcode = 'P0001'; end if;
  if v_into.archived_at is not null then raise exception 'el ejercicio destino está archivado; desarchivalo primero' using errcode = 'P0001'; end if;
  perform set_config('app.bulk_maintenance', 'on', true);
  if public._blank(v_into.description) and not public._blank(v_from.description) then v_filled := v_filled || 'description'::text; end if;
  if public._blank(v_into.muscle_group) and not public._blank(v_from.muscle_group) then v_filled := v_filled || 'muscle_group'::text; end if;
  if public._blank(v_into.video_url) and not public._blank(v_from.video_url) then v_filled := v_filled || 'video_url'::text; end if;
  if public._blank(v_into.technique_notes) and not public._blank(v_from.technique_notes) then v_filled := v_filled || 'technique_notes'::text; end if;
  if v_into.default_sets is null and v_from.default_sets is not null then v_filled := v_filled || 'default_sets'::text; end if;
  if v_into.default_reps is null and v_from.default_reps is not null then v_filled := v_filled || 'default_reps'::text; end if;
  if v_into.default_weight is null and v_from.default_weight is not null then v_filled := v_filled || 'default_weight'::text; end if;
  v_i18n := public._merge_i18n_fill(v_into.i18n, v_from.i18n);
  if v_i18n is distinct from v_into.i18n then v_filled := v_filled || 'i18n'::text; end if;
  if array_length(v_filled, 1) > 0 then
    update public.exercises set
      description     = case when 'description'     = any(v_filled) then v_from.description     else description end,
      muscle_group    = case when 'muscle_group'    = any(v_filled) then v_from.muscle_group    else muscle_group end,
      video_url       = case when 'video_url'       = any(v_filled) then v_from.video_url       else video_url end,
      technique_notes = case when 'technique_notes' = any(v_filled) then v_from.technique_notes else technique_notes end,
      default_sets    = case when 'default_sets'    = any(v_filled) then v_from.default_sets    else default_sets end,
      default_reps    = case when 'default_reps'    = any(v_filled) then v_from.default_reps    else default_reps end,
      default_weight  = case when 'default_weight'  = any(v_filled) then v_from.default_weight  else default_weight end,
      i18n            = v_i18n
    where id = p_into;
  end if;
  v_counts := v_counts || jsonb_build_object('filled', to_jsonb(v_filled));
  select coalesce(array_agg(tag_id), '{}') into v_tag_ids from public.exercise_tag_assignments where exercise_id = p_from;
  insert into public.exercise_tag_assignments (exercise_id, tag_id)
    select p_into, tag_id from public.exercise_tag_assignments where exercise_id = p_from on conflict do nothing;
  delete from public.exercise_tag_assignments where exercise_id = p_from;
  v_counts := v_counts || jsonb_build_object('tags', coalesce(array_length(v_tag_ids, 1), 0));
  update public.plan_exercises set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('plan_exercises', n);
  update public.plan_exercises set rm_reference_exercise_id = p_into where rm_reference_exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('rm_references', n);
  update public.evaluation_tests set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('eval_tests', n);
  update public.workout_logs set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('workout_logs', n);
  update public.workout_block_logs set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('workout_block_logs', n);
  update public.evaluation_test_responses set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('eval_responses', n);
  update public.plan_exercise_prescription_history set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('prescription_history', n);
  update public.notes set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', n);
  update public.student_milestones set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('milestones', n);
  update public.exercises set archived_at = now(), archived_by = auth.uid(), merged_into_id = p_into where id = p_from;
  insert into public.exercise_merges (from_exercise_id, into_exercise_id, merged_by, counts, from_snapshot, from_tag_ids, into_snapshot)
  values (p_from, p_into, auth.uid(), v_counts, to_jsonb(v_from), v_tag_ids, to_jsonb(v_into));
  return v_counts;
end;
$function$;
