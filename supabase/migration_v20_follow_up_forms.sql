-- ============================================================
-- Migration v20: Formularios de seguimiento (follow-up forms)
-- ============================================================
-- Motivación:
--   Hoy el sistema intake_form_* sirve un único formulario de alta
--   por alumno (UNIQUE constraint). La coach pidió poder crear
--   formularios libres para mandar en mitad de un programa
--   (check-in) y al cierre (feedback final), con disparadores
--   automáticos o manuales.
--
-- Estrategia:
--   Reutilizamos las tablas intake_form_* y agregamos:
--     • form_kind: 'intake' | 'follow_up'
--     • triggers: manual / on_week_N / on_plan_end
--     • estado 'scheduled' (programado, todavía no visible al alumno)
--     • plan_assignment_id en assignments (al cuál plan se ata el trigger)
--     • límite duro de 10 plantillas follow_up por coach (vía trigger DB)
--     • RPC release_due_forms() para flippar 'scheduled' → 'pending'
--       cuando scheduled_for ya pasó. Se llama desde el cliente al cargar.
--
-- Migración aditiva: assignments y templates existentes quedan como
-- 'intake' por default. No se rompe nada de lo que ya está en producción.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Agregar form_kind a templates
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.intake_form_templates
  ADD COLUMN IF NOT EXISTS form_kind text NOT NULL DEFAULT 'intake'
    CHECK (form_kind IN ('intake', 'follow_up')),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_templates_coach_kind
  ON public.intake_form_templates (coach_id, form_kind, is_active);

-- ─────────────────────────────────────────────────────────────
-- 2. Agregar campos de trigger a assignments
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.intake_form_assignments
  ADD COLUMN IF NOT EXISTS form_kind text NOT NULL DEFAULT 'intake'
    CHECK (form_kind IN ('intake', 'follow_up')),
  ADD COLUMN IF NOT EXISTS trigger_type text NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'on_week', 'on_plan_end')),
  ADD COLUMN IF NOT EXISTS trigger_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS plan_assignment_id uuid
    REFERENCES public.plan_assignments(id) ON DELETE SET NULL;

-- Status: agregar 'scheduled' al CHECK
ALTER TABLE public.intake_form_assignments
  DROP CONSTRAINT IF EXISTS intake_form_assignments_status_check;

ALTER TABLE public.intake_form_assignments
  ADD CONSTRAINT intake_form_assignments_status_check
    CHECK (status IN ('scheduled', 'pending', 'in_progress', 'completed'));

-- ─────────────────────────────────────────────────────────────
-- 3. Reemplazar el UNIQUE constraint para que solo aplique a intake
-- ─────────────────────────────────────────────────────────────
-- El intake sigue siendo "uno activo por alumno". Los follow_up pueden
-- coexistir varios en paralelo (incluso de la misma plantilla).
DROP INDEX IF EXISTS idx_intake_one_active_per_student;

CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_one_active_per_student
  ON public.intake_form_assignments (coach_id, student_id)
  WHERE form_kind = 'intake' AND status != 'completed';

-- Índice para queries del alumno: formularios activos / pendientes
CREATE INDEX IF NOT EXISTS idx_assignments_student_status
  ON public.intake_form_assignments (student_id, status, scheduled_for);

-- Índice para el release: programados con scheduled_for vencido
CREATE INDEX IF NOT EXISTS idx_assignments_scheduled
  ON public.intake_form_assignments (scheduled_for)
  WHERE status = 'scheduled';

-- ─────────────────────────────────────────────────────────────
-- 4. Trigger: límite de 10 plantillas follow_up por coach
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_follow_up_template_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count int;
BEGIN
  IF NEW.form_kind = 'follow_up' AND NEW.is_active = true THEN
    SELECT COUNT(*) INTO current_count
    FROM public.intake_form_templates
    WHERE coach_id = NEW.coach_id
      AND form_kind = 'follow_up'
      AND is_active = true
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF current_count >= 10 THEN
      RAISE EXCEPTION 'Límite alcanzado: máximo 10 plantillas de seguimiento por coach. Archivá alguna antes de crear otra.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_follow_up_limit ON public.intake_form_templates;
CREATE TRIGGER trg_follow_up_limit
  BEFORE INSERT OR UPDATE ON public.intake_form_templates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_follow_up_template_limit();

-- ─────────────────────────────────────────────────────────────
-- 5. RPC release_due_forms()
-- ─────────────────────────────────────────────────────────────
-- Flippa los assignments con status='scheduled' y scheduled_for <= now()
-- a status='pending'. Pensada para llamarse al cargar dashboard del
-- coach o del alumno (cliente). Idempotente.
--
-- SECURITY DEFINER: corre con permisos de owner para ignorar RLS, pero
-- solo afecta filas con scheduled_for vencido. Sin riesgo de escalar.
CREATE OR REPLACE FUNCTION public.release_due_forms()
RETURNS int AS $$
DECLARE
  released_count int;
BEGIN
  UPDATE public.intake_form_assignments
  SET status = 'pending'
  WHERE status = 'scheduled'
    AND scheduled_for IS NOT NULL
    AND scheduled_for <= now();

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.release_due_forms() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Ajuste de process_intake_submission: no correr para follow_up
-- ─────────────────────────────────────────────────────────────
-- La función v12 actual procesa cualquier submission y escribe en
-- student_profiles. Para follow_up no queremos eso: el form puede
-- tener cualquier estructura y no representa el perfil del alumno.
CREATE OR REPLACE FUNCTION public.process_intake_submission(submission_id uuid)
RETURNS void AS $$
DECLARE
  sub  public.intake_form_submissions%ROWTYPE;
  asgn public.intake_form_assignments%ROWTYPE;
  resp jsonb;
BEGIN
  SELECT * INTO sub FROM public.intake_form_submissions WHERE id = submission_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Si la submission corresponde a un follow_up, no procesamos
  -- el perfil — es un formulario de feedback, no de alta.
  SELECT * INTO asgn
  FROM public.intake_form_assignments
  WHERE id = sub.assignment_id;

  IF FOUND AND asgn.form_kind = 'follow_up' THEN
    RETURN;
  END IF;

  resp := sub.responses;

  INSERT INTO public.student_profiles (
    student_id,
    submission_id,
    nombre,
    apellido,
    objetivo_principal,
    nivel_experiencia,
    frecuencia_semanal,
    lugar_entrenamiento,
    tiene_lesiones,
    patologias,
    raw_data
  ) VALUES (
    sub.student_id,
    sub.id,
    resp->>'nombre',
    resp->>'apellido',
    resp->>'objetivo_principal',
    resp->>'experiencia_nivel',
    resp->>'frecuencia_semanal',
    resp->>'lugar_entrenamiento',
    (resp->>'tiene_lesiones')::boolean,
    ARRAY(SELECT jsonb_array_elements_text(resp->'patologias')),
    resp
  )
  ON CONFLICT (student_id) DO UPDATE SET
    submission_id       = EXCLUDED.submission_id,
    nombre              = EXCLUDED.nombre,
    apellido            = EXCLUDED.apellido,
    objetivo_principal  = EXCLUDED.objetivo_principal,
    nivel_experiencia   = EXCLUDED.nivel_experiencia,
    frecuencia_semanal  = EXCLUDED.frecuencia_semanal,
    lugar_entrenamiento = EXCLUDED.lugar_entrenamiento,
    tiene_lesiones      = EXCLUDED.tiene_lesiones,
    patologias          = EXCLUDED.patologias,
    raw_data            = EXCLUDED.raw_data,
    updated_at          = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- 7. RLS: nada nuevo, las policies existentes ya cubren los
--    nuevos campos (siguen siendo coach_id / student_id based).
-- ─────────────────────────────────────────────────────────────

-- Validación final: contar campos agregados
DO $$
BEGIN
  RAISE NOTICE 'Migration v20 aplicada. Verificá:';
  RAISE NOTICE '  - intake_form_templates.form_kind y is_active existen';
  RAISE NOTICE '  - intake_form_assignments.form_kind, trigger_type, scheduled_for existen';
  RAISE NOTICE '  - release_due_forms() callable desde cliente';
END $$;
