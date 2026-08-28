-- ============================================================
-- v39a — El Borg de la sesión promedia TODOS los días, no solo A y B
-- ------------------------------------------------------------
-- Hallazgo 2026-08-28, revisando la pestaña Progreso del alumno en la vista
-- del coach: el gráfico "Intensidad" mostraba huecos y el promedio ignoraba
-- sesiones que sí tenían Borg cargado.
--
-- Causa: `v_workout_session_intensity` (nace en legacy/migration_v9.sql,
-- 2026-05) resolvía `borg_per_day` a mano, con la aritmética escrita para
-- exactamente dos días:
--
--     (COALESCE(day_a,0) + COALESCE(day_b,0))
--     / NULLIF((day_a?1:0) + (day_b?1:0), 0)
--
-- Cuando la sesión es de un día C..G, el numerador da 0 y el denominador
-- NULLIF(0,0) da NULL → toda la expresión es NULL. No es un promedio malo:
-- es Borg perdido. Y como es NULL en vez de error, el front lo lee como
-- "esta sesión no registró intensidad" y sigue de largo, igual que el fetch
-- truncado de useCoachAlerts: el dato falta sin que nadie se entere.
--
-- Los planes soportan day_a..day_g desde hace rato (DAY_SECTION_IDS en
-- src/features/plans/helpers.js); la vista se quedó en la época de 2 días.
--
-- Medido en producción (bvexjanqmfypmtgoapbt) ANTES de aplicar:
--   285 sesiones, 97 con borg_value NULL
--    -> 65 son sesiones sin borg_per_day cargado (NULL legítimo)
--    -> 32 son Borg perdido: 27 con day_c + 5 con day_d
--   Dry-run del fix: recupera esas 32, cambia 0 valores ya existentes,
--   0 valores fuera del rango 0–10.
--
-- El fix promedia todas las claves `day_*` presentes, sin enumerarlas: si
-- mañana aparece day_h la vista lo toma sola.
--
-- Ojo al re-crear: la definición VIVA ya no tiene las columnas borg_scale ni
-- borg_notes (se eliminaron de workout_sessions después de v9) y lleva
-- `security_invoker = on`. Sin eso último cualquier authenticated leería las
-- sesiones de todos los alumnos salteando la RLS de workout_sessions.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS public.v_workout_session_intensity;

CREATE VIEW public.v_workout_session_intensity
WITH (security_invoker = on) AS
SELECT
  ws.id,
  ws.student_id,
  ws.plan_id,
  ws.logged_date,
  ws.started_at,
  ws.finished_at,
  -- Promedio de todos los días con Borg cargado en la sesión.
  -- El guard de jsonb_typeof evita el error si algún día se guarda un escalar;
  -- el regex descarta valores no numéricos (el jsonb lo escribe el front y no
  -- hay CHECK que lo garantice). Sin claves day_* válidas → NULL, que es lo
  -- que el front ya interpreta como "sin intensidad registrada".
  CASE
    WHEN jsonb_typeof(ws.borg_per_day) = 'object' THEN (
      SELECT ROUND(AVG(e.value::numeric), 1)
      FROM jsonb_each_text(ws.borg_per_day) AS e(key, value)
      WHERE e.key LIKE 'day\_%'
        AND e.value ~ '^-?[0-9]+(\.[0-9]+)?$'
    )
    ELSE NULL::numeric
  END AS borg_value,
  ws.borg_per_day,
  ws.logged_late,
  ws.created_at,
  ws.updated_at
FROM public.workout_sessions ws;

GRANT SELECT ON public.v_workout_session_intensity TO authenticated;

COMMIT;
