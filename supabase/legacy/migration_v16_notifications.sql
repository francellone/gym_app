-- ============================================================
-- Migration v16: Sistema de Notificaciones
-- ============================================================
-- Incluye:
--   1. Tabla notifications (in-app)
--   2. Tabla push_subscriptions (Web Push)
--   3. Trigger: plan asignado → notifica al alumno
--   4. Trigger: primer log del día → notifica al coach
--   5. Trigger: sesión completada → notifica al coach
--   6. Funciones helper para el cron Edge Function
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLA NOTIFICATIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN (
                 'plan_assigned',
                 'activity_update',
                 'session_completed',
                 'plan_expiring',
                 'stagnation_alert',
                 'coach_comment',
                 'weekly_summary'
               )),
  title       text NOT NULL,
  body        text,
  data        jsonb NOT NULL DEFAULT '{}',
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read      ON public.notifications(user_id, read) WHERE NOT read;
CREATE INDEX IF NOT EXISTS idx_notifications_created   ON public.notifications(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 2. TABLA PUSH_SUBSCRIPTIONS (Web Push API)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  keys        jsonb NOT NULL,    -- { p256dh, auth }
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON public.push_subscriptions(user_id);

-- ────────────────────────────────────────────────────────────
-- 3. RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Notifications: cada usuario ve solo las suyas
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INSERT lo hacen los triggers (SECURITY DEFINER), no el cliente
CREATE POLICY "notifications_insert_service"
  ON public.notifications FOR INSERT
  WITH CHECK (true);   -- sólo accesible desde funciones SECURITY DEFINER

-- Push subscriptions: el usuario gestiona las suyas
CREATE POLICY "push_subs_all_own"
  ON public.push_subscriptions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- El cron/edge function necesita leer todas para enviar pushes
CREATE POLICY "push_subs_service_select"
  ON public.push_subscriptions FOR SELECT
  USING (true);   -- la clave de service_role bypasea RLS de todas formas

-- ────────────────────────────────────────────────────────────
-- 4. HELPER: obtener el id del coach (único)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_coach_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.profiles WHERE role = 'coach' LIMIT 1;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. TRIGGER: Plan asignado → notifica al ALUMNO
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_plan_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan_title text;
BEGIN
  SELECT title INTO v_plan_title
  FROM public.plans
  WHERE id = NEW.plan_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.student_id,
    'plan_assigned',
    '¡Nuevo plan asignado!',
    'Tu coach te asignó el plan "' || COALESCE(v_plan_title, 'Sin nombre') || '".',
    jsonb_build_object(
      'plan_id',       NEW.plan_id,
      'assignment_id', NEW.id,
      'start_date',    NEW.start_date,
      'end_date',      NEW.end_date
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_plan_assigned ON public.plan_assignments;
CREATE TRIGGER trg_notify_plan_assigned
  AFTER INSERT ON public.plan_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_plan_assigned();

-- ────────────────────────────────────────────────────────────
-- 6. TRIGGER: Primer log del día → notifica al COACH (actividad)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_workout_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_coach_id    uuid;
  v_student_name text;
  v_log_count   int;
BEGIN
  v_coach_id := public.get_coach_id();
  IF v_coach_id IS NULL THEN RETURN NEW; END IF;

  -- ¿El alumno ya tenía logs registrados hoy antes de éste?
  SELECT COUNT(*) INTO v_log_count
  FROM public.workout_logs
  WHERE student_id  = NEW.student_id
    AND logged_date = NEW.logged_date;

  -- Solo notificar en el PRIMER log del día (count = 1 incluye el recién insertado)
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

DROP TRIGGER IF EXISTS trg_notify_workout_activity ON public.workout_logs;
CREATE TRIGGER trg_notify_workout_activity
  AFTER INSERT ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_workout_activity();

-- ────────────────────────────────────────────────────────────
-- 7. TRIGGER: Sesión completada → notifica al COACH
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_session_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_coach_id     uuid;
  v_student_name text;
  v_already_sent boolean;
BEGIN
  -- Solo disparar cuando completed cambia a TRUE
  IF (OLD.completed IS DISTINCT FROM true) AND NEW.completed = true THEN

    v_coach_id := public.get_coach_id();
    IF v_coach_id IS NULL THEN RETURN NEW; END IF;

    -- Evitar duplicados: una sola notificación por alumno por día
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

DROP TRIGGER IF EXISTS trg_notify_session_completed ON public.workout_logs;
CREATE TRIGGER trg_notify_session_completed
  AFTER UPDATE ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_session_completed();

-- ────────────────────────────────────────────────────────────
-- 8. FUNCIONES PARA EL CRON EDGE FUNCTION
--    (llamadas desde notify-cron/index.ts con service_role)
-- ────────────────────────────────────────────────────────────

-- 8a. Planes que vencen en exactamente 7 días
CREATE OR REPLACE FUNCTION public.fn_notify_expiring_plans()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      pa.student_id,
      pa.end_date,
      p.title        AS plan_title,
      pa.plan_id,
      pa.id          AS assignment_id
    FROM public.plan_assignments pa
    JOIN public.plans p ON p.id = pa.plan_id
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

    -- Notifica al coach
    DECLARE v_coach_id uuid; v_student_name text;
    BEGIN
      v_coach_id    := public.get_coach_id();
      SELECT name INTO v_student_name FROM public.profiles WHERE id = rec.student_id;
      IF v_coach_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
          v_coach_id,
          'plan_expiring',
          'Plan de ' || COALESCE(v_student_name, 'alumno') || ' vence en 7 días',
          '"' || rec.plan_title || '" vence el ' || to_char(rec.end_date, 'DD/MM/YYYY') || '.',
          jsonb_build_object(
            'student_id',    rec.student_id,
            'student_name',  v_student_name,
            'plan_id',       rec.plan_id,
            'assignment_id', rec.assignment_id,
            'end_date',      rec.end_date
          )
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END;
  END LOOP;
END;
$$;

-- 8b. Alumnos sin actividad en los últimos 7 días → notifica al coach
CREATE OR REPLACE FUNCTION public.fn_notify_stagnation()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_coach_id uuid;
  rec        RECORD;
BEGIN
  v_coach_id := public.get_coach_id();
  IF v_coach_id IS NULL THEN RETURN; END IF;

  FOR rec IN
    SELECT p.id AS student_id, p.name AS student_name
    FROM public.profiles p
    WHERE p.role   = 'student'
      AND p.active = true
      -- Tiene al menos un plan activo
      AND EXISTS (
        SELECT 1 FROM public.plan_assignments pa
        WHERE pa.student_id = p.id AND pa.active = true
      )
      -- No tiene logs en los últimos 7 días
      AND NOT EXISTS (
        SELECT 1 FROM public.workout_logs wl
        WHERE wl.student_id  = p.id
          AND wl.logged_date >= CURRENT_DATE - INTERVAL '7 days'
      )
      -- No enviamos esta notificación dos veces el mismo día para el mismo alumno
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id    = v_coach_id
          AND n.type       = 'stagnation_alert'
          AND (n.data->>'student_id')::uuid = p.id
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_coach_id,
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

-- 8c. Resumen semanal (ejecutar los lunes)
--     Inserta una notificación de resumen para cada usuario activo
CREATE OR REPLACE FUNCTION public.fn_notify_weekly_summary()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_coach_id   uuid;
  rec          RECORD;
  v_week_start date;
  v_week_end   date;
  v_sessions   int;
  v_volume     numeric;
  v_avg_rpe    numeric;
BEGIN
  v_week_start := CURRENT_DATE - INTERVAL '7 days';
  v_week_end   := CURRENT_DATE - INTERVAL '1 day';
  v_coach_id   := public.get_coach_id();

  -- Resumen por alumno (para el alumno y para el coach)
  FOR rec IN
    SELECT
      p.id   AS student_id,
      p.name AS student_name,
      COUNT(DISTINCT wl.logged_date)                    AS sessions,
      COALESCE(SUM(wl.actual_sets * wl.actual_reps::numeric * wl.actual_weight), 0) AS volume,
      ROUND(AVG(wl.perceived_difficulty), 1)            AS avg_rpe
    FROM public.profiles p
    LEFT JOIN public.workout_logs wl ON wl.student_id = p.id
      AND wl.logged_date BETWEEN v_week_start AND v_week_end
    WHERE p.role   = 'student'
      AND p.active = true
    GROUP BY p.id, p.name
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

    -- Al coach (uno por alumno)
    IF v_coach_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_coach_id,
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
