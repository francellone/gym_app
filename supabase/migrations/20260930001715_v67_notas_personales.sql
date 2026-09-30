-- v67 — Notas personales (hilo sin coach)
-- Una persona puede tener dos hilos: el personal (coach_id NULL, solo ella) y
-- el de su coach actual. Sin coach, todo va al personal. Con coach, los
-- comentarios de ejercicios van al de la coach y las notas sueltas pueden ir
-- a cualquiera de los dos (la persona elige: "para mi coach" / "privada").
-- Al aceptar un vínculo con share_history, los comentarios de ejercicios
-- previos pasan al hilo de la coach; las notas sueltas quedan privadas.

-- 1. Estructura
ALTER TABLE public.note_threads ALTER COLUMN coach_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS note_threads_personal_uniq
  ON public.note_threads (student_id) WHERE coach_id IS NULL;

-- 2. Resolver de hilo (interno)
CREATE OR REPLACE FUNCTION public._note_thread_for(p_student uuid, p_private boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_coach uuid; v_id uuid;
BEGIN
  SELECT coach_id INTO v_coach FROM public.profiles WHERE id = p_student;
  IF p_private OR v_coach IS NULL OR v_coach = p_student THEN
    SELECT id INTO v_id FROM public.note_threads WHERE student_id = p_student AND coach_id IS NULL;
    IF v_id IS NULL THEN
      INSERT INTO public.note_threads (coach_id, student_id) VALUES (NULL, p_student)
      ON CONFLICT (student_id) WHERE coach_id IS NULL DO UPDATE SET updated_at = now()
      RETURNING id INTO v_id;
    END IF;
  ELSE
    INSERT INTO public.note_threads (coach_id, student_id) VALUES (v_coach, p_student)
    ON CONFLICT (coach_id, student_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public._note_thread_for(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- 3. RPC para el front: hilo actual (o personal) de una persona
CREATE OR REPLACE FUNCTION public.my_note_thread(p_student_id uuid, p_private boolean DEFAULT false)
RETURNS public.note_threads LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_row public.note_threads;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Requiere sesión' USING ERRCODE = '42501'; END IF;
  IF p_student_id = auth.uid() THEN
    NULL;
  ELSIF NOT p_private AND public.is_coach_of(p_student_id) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  v_id := public._note_thread_for(p_student_id, p_private);
  SELECT * INTO v_row FROM public.note_threads WHERE id = v_id;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.my_note_thread(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_note_thread(uuid, boolean) TO authenticated;

-- 4. Policies: la coach solo ve SU hilo (nunca el personal)
DROP POLICY IF EXISTS coach_manage_own_students_threads ON public.note_threads;
CREATE POLICY coach_manage_own_students_threads ON public.note_threads
  FOR ALL TO authenticated
  USING (coach_id = (SELECT auth.uid()) AND public.is_coach_of(student_id))
  WITH CHECK (coach_id = (SELECT auth.uid()) AND public.is_coach_of(student_id));

DROP POLICY IF EXISTS coach_select_own_students_notes ON public.notes;
CREATE POLICY coach_select_own_students_notes ON public.notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.note_threads nt
                  WHERE nt.id = notes.thread_id AND nt.coach_id = (SELECT auth.uid())
                    AND public.is_coach_of(nt.student_id)));
DROP POLICY IF EXISTS coach_insert_own_students_notes ON public.notes;
CREATE POLICY coach_insert_own_students_notes ON public.notes FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND author_role = 'coach'
    AND EXISTS (SELECT 1 FROM public.note_threads nt
                 WHERE nt.id = notes.thread_id AND nt.coach_id = (SELECT auth.uid())
                   AND public.is_coach_of(nt.student_id)));
DROP POLICY IF EXISTS coach_update_own_students_notes ON public.notes;
CREATE POLICY coach_update_own_students_notes ON public.notes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.note_threads nt
                  WHERE nt.id = notes.thread_id AND nt.coach_id = (SELECT auth.uid())
                    AND public.is_coach_of(nt.student_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.note_threads nt
                  WHERE nt.id = notes.thread_id AND nt.coach_id = (SELECT auth.uid())
                    AND public.is_coach_of(nt.student_id)));

-- 5. Hilo al vincularse: uno por (coach, persona), aunque ya exista el personal
CREATE OR REPLACE FUNCTION public.profiles_ensure_note_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.role = 'student' AND NEW.coach_id IS NOT NULL AND NEW.coach_id <> NEW.id THEN
    INSERT INTO public.note_threads (coach_id, student_id)
    VALUES (NEW.coach_id, NEW.id)
    ON CONFLICT (coach_id, student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- 6. Aviso a la coach: se decide por el hilo, no por el perfil (una nota privada no avisa)
DO $$
DECLARE v_def text; v_old text := $o$  SELECT coach_id, name
    INTO v_coach_id, v_student_name
    FROM public.profiles
   WHERE id = NEW.author_id;$o$;
BEGIN
  v_def := pg_get_functiondef('public.fn_notify_student_note'::regproc);
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'v67: texto no encontrado en fn_notify_student_note'; END IF;
  v_def := replace(v_def, v_old, $n$  SELECT nt.coach_id INTO v_coach_id FROM public.note_threads nt WHERE nt.id = NEW.thread_id;
  SELECT name INTO v_student_name FROM public.profiles WHERE id = NEW.author_id;$n$);
  EXECUTE v_def;
END $$;

-- 7. Marcar leído como coach: solo en su hilo
DO $$
DECLARE v_def text; v_old text := $o$SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'coach'$o$;
BEGIN
  v_def := pg_get_functiondef('public.notes_mark_thread_read'::regproc);
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'v67: texto no encontrado en notes_mark_thread_read'; END IF;
  v_def := replace(v_def, v_old, $n$SELECT 1 FROM public.note_threads nt WHERE nt.id = p_thread_id AND nt.coach_id = v_caller_id AND public.is_coach_of(nt.student_id)$n$);
  EXECUTE v_def;
END $$;
REVOKE EXECUTE ON FUNCTION public.notes_mark_thread_read(uuid, text) FROM PUBLIC, anon;

-- 8. Opciones de filtro: la coach solo en su hilo
DO $$
DECLARE v_def text; v_old text := $o$(nt.student_id = auth.uid() OR public.is_coach_of(nt.student_id))$o$;
BEGIN
  v_def := pg_get_functiondef('public.notes_thread_filter_options'::regproc);
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'v67: texto no encontrado en notes_thread_filter_options'; END IF;
  v_def := replace(v_def, v_old, $n$(nt.student_id = auth.uid() OR (nt.coach_id = auth.uid() AND public.is_coach_of(nt.student_id)))$n$);
  EXECUTE v_def;
END $$;

-- 9. Crear hilo como coach: solo con personas propias
DO $$
DECLARE v_def text; v_old text := $o$IF v_student_coach_id IS NOT NULL AND v_student_coach_id <> p_coach_id THEN$o$;
BEGIN
  v_def := pg_get_functiondef('public.notes_get_or_create_thread'::regproc);
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'v67: texto no encontrado en notes_get_or_create_thread'; END IF;
  v_def := replace(v_def, v_old, $n$IF v_student_coach_id IS DISTINCT FROM p_coach_id THEN$n$);
  EXECUTE v_def;
END $$;
REVOKE EXECUTE ON FUNCTION public.notes_get_or_create_thread(uuid, uuid) FROM PUBLIC, anon;

-- 10. Comentarios por RPC (add_note_for_*): sin coach van al hilo personal
CREATE OR REPLACE FUNCTION public._add_note_internal(p_student_id uuid, p_context_type text, p_context_id uuid, p_body text, p_block_type text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_body text; v_coach_id uuid; v_thread_id uuid;
  v_author_id uuid := auth.uid(); v_author_role text; v_note_id uuid;
BEGIN
  v_body := nullif(btrim(p_body), '');
  IF v_body IS NULL THEN RAISE EXCEPTION 'note body cannot be empty'; END IF;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null; this RPC requires an authenticated session';
  END IF;
  SELECT coach_id INTO v_coach_id FROM public.profiles WHERE id = p_student_id;
  IF v_author_id = p_student_id THEN
    v_author_role := 'student';
  ELSIF v_coach_id IS NOT NULL AND v_author_id = v_coach_id THEN
    v_author_role := 'coach';
  ELSE
    RAISE EXCEPTION 'caller % is neither the student nor the assigned coach', v_author_id;
  END IF;
  v_thread_id := public._note_thread_for(p_student_id, false);
  INSERT INTO public.notes (thread_id, author_id, author_role, body, context_type, context_id, block_type)
  VALUES (v_thread_id, v_author_id, v_author_role, v_body, p_context_type, p_context_id, p_block_type)
  RETURNING id INTO v_note_id;
  RETURN v_note_id;
END $$;

-- 11. Shim legacy: sin coach ya no se descarta, va al hilo personal
DO $$
DECLARE v_def text;
  v_old1 text := $o$  if v_coach_id is null then
    insert into public.legacy_notes_shim_log$o$;
  v_old2 text := $o$  insert into public.note_threads (coach_id, student_id)
  values (v_coach_id, NEW.student_id)
  on conflict (coach_id, student_id) do update set updated_at = now()
  returning id into v_thread_id;$o$;
BEGIN
  v_def := pg_get_functiondef('public.fn_legacy_notes_shim'::regproc);
  IF position(v_old1 in v_def) = 0 OR position(v_old2 in v_def) = 0 THEN
    RAISE EXCEPTION 'v67: texto no encontrado en fn_legacy_notes_shim';
  END IF;
  v_def := replace(v_def, v_old1, $n$  if false then
    insert into public.legacy_notes_shim_log$n$);
  v_def := replace(v_def, v_old2, $n$  v_thread_id := public._note_thread_for(NEW.student_id, false);$n$);
  EXECUTE v_def;
END $$;

-- 12. Aceptar vínculo con historial: los comentarios de ejercicios previos pasan al hilo de la coach
DO $$
DECLARE v_def text; v_old text := $o$           coach_visible_since = CASE WHEN v_row.share_history THEN NULL ELSE now() END
     WHERE id = v_row.student_id;$o$;
BEGIN
  v_def := pg_get_functiondef('public.decide_coach_link'::regproc);
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'v67: texto no encontrado en decide_coach_link'; END IF;
  v_def := replace(v_def, v_old, v_old || $n$
    IF v_row.share_history THEN
      PERFORM public._move_exercise_notes_to_coach(v_row.student_id, v_row.coach_id);
    END IF;$n$);
  CREATE OR REPLACE FUNCTION public._move_exercise_notes_to_coach(p_student uuid, p_coach uuid)
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
  DECLARE v_personal uuid; v_coach_thread uuid; v_n integer;
  BEGIN
    SELECT id INTO v_personal FROM public.note_threads WHERE student_id = p_student AND coach_id IS NULL;
    IF v_personal IS NULL THEN RETURN 0; END IF;
    INSERT INTO public.note_threads (coach_id, student_id) VALUES (p_coach, p_student)
    ON CONFLICT (coach_id, student_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_coach_thread;
    -- Primero se marcan leídas en el hilo personal (el contador que baja es el
    -- del personal, no el de la coach) y recién después se mueven: sin esto la
    -- coach recibiría de golpe todo el historial como "no leído".
    UPDATE public.notes SET read_at_coach = now()
     WHERE thread_id = v_personal AND context_type <> 'free' AND read_at_coach IS NULL;
    UPDATE public.notes SET thread_id = v_coach_thread
     WHERE thread_id = v_personal AND context_type <> 'free';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
  END $f$;
  REVOKE ALL ON FUNCTION public._move_exercise_notes_to_coach(uuid, uuid) FROM PUBLIC, anon, authenticated;
  EXECUTE v_def;
END $$;
