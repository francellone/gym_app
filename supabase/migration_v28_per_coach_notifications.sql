-- ============================================================
-- Migration v28: notificaciones por coach asignado
-- ------------------------------------------------------------
-- Síntoma observado (2026-05-17):
--   Hay 3 coaches activos en la BD (Carlos, Anto, Gonza) pero
--   todas las notificaciones automáticas (activity_update,
--   session_completed, student_note, stagnation, expiring_plans,
--   weekly_summary) las recibe SOLO uno (Carlos), porque las
--   funciones usan `public.get_coach_id()` que hace
--   `SELECT id FROM profiles WHERE role='coach' LIMIT 1` sin
--   ORDER BY y devuelve siempre la misma fila.
--
-- Modelo de datos:
--   `profiles.coach_id` (FK self-referencing a profiles.id,
--   ON DELETE SET NULL) ya existe y vincula cada alumno a su
--   coach. Esta migración hace que cada trigger resuelva el
--   coach destino vía ese campo, en lugar del LIMIT 1 global.
--
-- Funciones tocadas (todas SECURITY DEFINER):
--   1. fn_notify_workout_activity   (AFTER INSERT workout_logs)
--   2. fn_notify_session_completed  (AFTER UPDATE workout_logs)
--   3. fn_notify_student_note       (AFTER INSERT notes)
--   4. fn_notify_stagnation         (cron)
--   5. fn_notify_expiring_plans     (cron, notifica alumno + coach)
--   6. fn_notify_weekly_summary     (cron, notifica alumno + coach)
--
-- Comportamiento cuando el alumno no tiene coach_id asignado:
--   Skip-quietly. El trigger no inserta nada y retorna sin error.
--   Asumido por el usuario: prefiere dejar 4 alumnos huérfanos sin
--   tocar y que vayan recibiendo coach a medida que se asignen
--   desde la UI.
--
-- Realineamiento de note_threads.coach_id:
--   De 10 threads existentes, 5 tienen coach_id apuntando a un
--   coach distinto del actual `profiles.coach_id` del alumno
--   (residuo del era single-coach). Los realineamos cuando el
--   alumno tiene coach_id NO NULL. Los 4 threads con alumno sin
--   coach_id se dejan como están.
--
-- get_coach_id() se mantiene viva (sin uso desde acá) por si
-- algún consumidor externo aún la llama. Se marca con COMMENT
-- como deprecated.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. REALINEAR note_threads.coach_id
-- ────────────────────────────────────────────────────────────
UPDATE public.note_threads nt
   SET coach_id = s.coach_id
  FROM public.profiles s
 WHERE nt.student_id = s.id
   AND s.coach_id IS NOT NULL
   AND nt.coach_id IS DISTINCT FROM s.coach_id;

-- ────────────────────────────────────────────────────────────
-- 1. fn_notify_workout_activity
--    Primer log del día del alumno → notifica al coach del alumno
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_workout_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id     uuid;
  v_student_name text;
  v_log_count    int;
BEGIN
  -- Resolver el coach del alumno (no del LIMIT 1 global)
  SELECT coach_id INTO v_coach_id
    FROM public.profiles
   WHERE id = NEW.student_id;

  IF v_coach_id IS NULL THEN RETURN NEW; END IF;

  -- ¿Era el primer log del día?
  SELECT COUNT(*) INTO v_log_count
    FROM public.workout_logs
   WHERE student_id  = NEW.student_id
     AND logged_date = NEW.logged_date;

  IF v_log_count = 1 THEN
    SELECT name INTO v_student_name
      FROM public.profiles WHERE id = NEW.student_id;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_coach_id,
      'activity_update',
      v_student_name || ' registró actividad hoy',
      'Tiene registros del ' || to_char(NEW.logged_date, 'DD/MM/YYYY') || ' para revisar.',
      jsonb_build_object(
        'student_id',   NEW.student_id,
        'student_name', v_student_name,
        'date',         NEW.logged_date
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_workout_activity() IS
  'v28: notifica al coach asignado del alumno (profiles.coach_id), no al primer coach global.';

-- ────────────────────────────────────────────────────────────
-- 2. fn_notify_session_completed
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_session_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id     uuid;
  v_student_name text;
  v_already_sent boolean;
BEGIN
  IF (OLD.completed IS DISTINCT FROM true) AND NEW.completed = true THEN

    SELECT coach_id INTO v_coach_id
      FROM public.profiles
     WHERE id = NEW.student_id;

    IF v_coach_id IS NULL THEN RETURN NEW; END IF;

    -- Evitar duplicados: una sola por alumno por día PARA ESE COACH
    SELECT EXISTS(
      SELECT 1 FROM public.notifications
       WHERE user_id  = v_coach_id
         AND type     = 'session_completed'
         AND (data->>'student_id')::uuid = NEW.student_id
         AND created_at::date = CURRENT_DATE
    ) INTO v_already_sent;

    IF NOT v_already_sent THEN
      SELECT name INTO v_student_name
        FROM public.profiles WHERE id = NEW.student_id;

      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_coach_id,
        'session_completed',
        v_student_name || ' completó su entrenamiento',
        'Revisá el registro completo del ' || to_char(NEW.logged_date, 'DD/MM/YYYY') || '.',
        jsonb_build_object(
          'student_id',   NEW.student_id,
          'student_name', v_student_name,
          'date',         NEW.logged_date
        )
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_session_completed() IS
  'v28: notifica al coach asignado del alumno (profiles.coach_id), no al primer coach global.';

-- ────────────────────────────────────────────────────────────
-- 3. fn_notify_student_note
--    Alumno escribe una nota → notifica al coach del alumno.
--    note_threads tiene su propio coach_id (recién realineado en
--    el paso 0), pero usamos profiles.coach_id como fuente de
--    verdad para que si el coach del alumno cambia en el futuro,
--    las notas viejas no queden notificando al coach equivocado.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_student_note()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id     uuid;
  v_student_name text;
  v_excerpt      text;
BEGIN
  IF NEW.author_role <> 'student' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT coach_id, name
    INTO v_coach_id, v_student_name
    FROM public.profiles
   WHERE id = NEW.author_id;

  IF v_coach_id IS NULL THEN RETURN NEW; END IF;

  v_excerpt := substring(NEW.body, 1, 140);

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_coach_id,
    'student_note',
    COALESCE(v_student_name, 'Un alumno') || ' te escribió una nota',
    v_excerpt,
    jsonb_build_object(
      'note_id',      NEW.id,
      'thread_id',    NEW.thread_id,
      'student_id',   NEW.author_id,
      'student_name', v_student_name,
      'context_type', NEW.context_type,
      'context_id',   NEW.context_id,
      'exercise_id',  NEW.exercise_id
    )
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_student_note() IS
  'v28: notifica al coach asignado del alumno (profiles.coach_id), no al primer coach global.';

-- ────────────────────────────────────────────────────────────
-- 4. fn_notify_stagnation (cron)
--    Itera alumnos activos con plan activo y sin logs en 7d.
--    Cada notificación va al coach del alumno respectivo.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_stagnation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.id AS student_id, p.name AS student_name, p.coach_id
      FROM public.profiles p
     WHERE p.role     = 'student'
       AND p.active   = true
       AND p.coach_id IS NOT NULL                 -- skip-quietly huérfanos
       AND EXISTS (
         SELECT 1 FROM public.plan_assignments pa
          WHERE pa.student_id = p.id AND pa.active = true
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.workout_logs wl
          WHERE wl.student_id  = p.id
            AND wl.logged_date >= CURRENT_DATE - INTERVAL '7 days'
       )
       -- No duplicar la notif para ESE coach el mismo día
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
          WHERE n.user_id    = p.coach_id
            AND n.type       = 'stagnation_alert'
            AND (n.data->>'student_id')::uuid = p.id
            AND n.created_at::date = CURRENT_DATE
       )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      rec.coach_id,
      'stagnation_alert',
      rec.student_name || ' lleva 7 días sin entrenar',
      'No registra actividad desde hace una semana. Puede ser momento de contactarlo.',
      jsonb_build_object(
        'student_id',   rec.student_id,
        'student_name', rec.student_name
      )
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_stagnation() IS
  'v28: cada notif va al coach asignado del alumno (profiles.coach_id).';

-- ────────────────────────────────────────────────────────────
-- 5. fn_notify_expiring_plans (cron)
--    Notifica al alumno (igual que antes) y al coach del alumno.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_expiring_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      pa.student_id,
      pa.end_date,
      p.title          AS plan_title,
      pa.plan_id,
      pa.id            AS assignment_id,
      s.name           AS student_name,
      s.coach_id       AS coach_id
    FROM public.plan_assignments pa
    JOIN public.plans     p ON p.id = pa.plan_id
    JOIN public.profiles  s ON s.id = pa.student_id
    WHERE pa.active    = true
      AND pa.end_date  = CURRENT_DATE + INTERVAL '7 days'
  LOOP
    -- Notifica al alumno
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      rec.student_id,
      'plan_expiring',
      'Tu plan vence en 7 días',
      'El plan "' || rec.plan_title || '" vence el ' || to_char(rec.end_date, 'DD/MM/YYYY') || '.',
      jsonb_build_object(
        'plan_id',       rec.plan_id,
        'assignment_id', rec.assignment_id,
        'end_date',      rec.end_date
      )
    )
    ON CONFLICT DO NOTHING;

    -- Notifica al coach del alumno (si lo tiene asignado)
    IF rec.coach_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        rec.coach_id,
        'plan_expiring',
        'Plan de ' || COALESCE(rec.student_name, 'alumno') || ' vence en 7 días',
        '"' || rec.plan_title || '" vence el ' || to_char(rec.end_date, 'DD/MM/YYYY') || '.',
        jsonb_build_object(
          'student_id',    rec.student_id,
          'student_name',  rec.student_name,
          'plan_id',       rec.plan_id,
          'assignment_id', rec.assignment_id,
          'end_date',      rec.end_date
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_expiring_plans() IS
  'v28: la copia para el coach va al coach asignado del alumno (profiles.coach_id).';

-- ────────────────────────────────────────────────────────────
-- 6. fn_notify_weekly_summary (cron, los lunes)
--    Notifica al alumno y al coach del alumno.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_weekly_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec          RECORD;
  v_week_start date;
  v_week_end   date;
BEGIN
  v_week_start := CURRENT_DATE - INTERVAL '7 days';
  v_week_end   := CURRENT_DATE - INTERVAL '1 day';

  FOR rec IN
    SELECT
      p.id        AS student_id,
      p.name      AS student_name,
      p.coach_id  AS coach_id,
      COUNT(DISTINCT wl.logged_date)                                                    AS sessions,
      COALESCE(SUM(wl.actual_sets * wl.actual_reps::numeric * wl.actual_weight), 0)     AS volume,
      ROUND(AVG(wl.perceived_difficulty), 1)                                            AS avg_rpe
    FROM public.profiles p
    LEFT JOIN public.workout_logs wl ON wl.student_id = p.id
      AND wl.logged_date BETWEEN v_week_start AND v_week_end
    WHERE p.role   = 'student'
      AND p.active = true
    GROUP BY p.id, p.name, p.coach_id
  LOOP
    -- Al alumno
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      rec.student_id,
      'weekly_summary',
      'Tu resumen semanal está listo',
      rec.sessions || ' sesión(es) · ' ||
        COALESCE(rec.avg_rpe::text || ' RPE promedio', 'sin RPE') ||
        ' · semana del ' || to_char(v_week_start, 'DD/MM') || ' al ' || to_char(v_week_end, 'DD/MM'),
      jsonb_build_object(
        'student_id',  rec.student_id,
        'week_start',  v_week_start,
        'week_end',    v_week_end,
        'sessions',    rec.sessions,
        'volume',      rec.volume,
        'avg_rpe',     rec.avg_rpe
      )
    );

    -- Al coach del alumno (si lo tiene asignado)
    IF rec.coach_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        rec.coach_id,
        'weekly_summary',
        'Resumen semanal: ' || rec.student_name,
        rec.sessions || ' sesión(es) · RPE: ' || COALESCE(rec.avg_rpe::text, 'N/A'),
        jsonb_build_object(
          'student_id',   rec.student_id,
          'student_name', rec.student_name,
          'week_start',   v_week_start,
          'week_end',     v_week_end,
          'sessions',     rec.sessions,
          'volume',       rec.volume,
          'avg_rpe',      rec.avg_rpe
        )
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_notify_weekly_summary() IS
  'v28: la copia para el coach va al coach asignado del alumno (profiles.coach_id).';

-- ────────────────────────────────────────────────────────────
-- 7. Deprecar get_coach_id()
--    No la borramos para no romper consumidores externos
--    (cron functions, scripts, etc.). Sólo la marcamos.
-- ────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.get_coach_id() IS
  'DEPRECATED v28: devuelve un coach arbitrario (LIMIT 1 sin ORDER BY). '
  'No usar en triggers nuevos. Para resolver el coach destino de un alumno, '
  'leer profiles.coach_id del alumno.';

-- ────────────────────────────────────────────────────────────
-- 8. VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_misaligned int;
BEGIN
  SELECT COUNT(*) INTO v_misaligned
    FROM public.note_threads nt
    JOIN public.profiles s ON s.id = nt.student_id
   WHERE s.coach_id IS NOT NULL
     AND nt.coach_id IS DISTINCT FROM s.coach_id;

  IF v_misaligned > 0 THEN
    RAISE EXCEPTION 'v28: quedaron % note_threads desalineados tras el realineamiento', v_misaligned;
  END IF;
  RAISE NOTICE 'v28 ok: 6 funciones reescritas + note_threads realineado';
END;
$$;
