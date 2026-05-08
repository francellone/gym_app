-- ============================================================
-- Migration v21: Ciclo de vida de planes + asociación plan↔evaluación
-- ============================================================
-- Motivación:
--   Hoy plan_assignments solo tiene un boolean `active`. Eso hizo que
--   al asignar un plan nuevo el viejo no se desactivara, dejando varias
--   filas con active=true por alumno y mostrando el plan equivocado en
--   StudentsPage / CoachDashboard. Además mezcla planes de
--   entrenamiento con evaluaciones en una sola lista, lo que confunde
--   a la coach en la pestaña Planes.
--
-- Esta migración introduce:
--   1. plan_assignments.status (active, paused, replaced, completed,
--      archived) con motivo y timestamp de cambio.
--   2. plan_assignments.replaced_by_assignment_id → puntero al sucesor.
--   3. plan_assignments.plan_type DENORMALIZADO desde plans.plan_type
--      (necesario para índices parciales y queries rápidas).
--   4. plan_assignments.linked_assignment_id → vincular una asignación
--      de evaluación a una asignación de plan de entrenamiento del
--      mismo alumno.
--   5. plans.parent_plan_id → declarar una evaluación template como
--      "parte de" un plan template.
--   6. Trigger que mantiene plan_assignments.active SINCRONIZADO con
--      status (active=true ⇔ status='active'). Esto evita romper RLS
--      ni queries del cliente que filtran por active=true.
--   7. Trigger que llena plan_type al insertar y lo mantiene si cambia
--      el plans.plan_type (rarísimo pero contemplado).
--   8. Limpieza de datos: si un alumno tiene >1 training activo se
--      conserva el más reciente como 'active' y los demás se marcan
--      como 'replaced' apuntando al sucesor cronológico.
--   9. Índice parcial único: un solo training 'active' por alumno.
--
-- Migración aditiva e idempotente. Las columnas/triggers/políticas
-- existentes no se modifican; solo se agregan. No rompe ninguna RLS
-- ni query existente.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas nuevas en plan_assignments
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.plan_assignments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'replaced', 'completed', 'archived')),
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS replaced_by_assignment_id uuid
    REFERENCES public.plan_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_type text
    CHECK (plan_type IN ('training', 'evaluation')),
  ADD COLUMN IF NOT EXISTS linked_assignment_id uuid
    REFERENCES public.plan_assignments(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Columna nueva en plans (asociación template-level)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS parent_plan_id uuid
    REFERENCES public.plans(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Backfill: poblar plan_type denormalizado desde plans
-- ─────────────────────────────────────────────────────────────
UPDATE public.plan_assignments pa
   SET plan_type = COALESCE(p.plan_type, 'training')
  FROM public.plans p
 WHERE pa.plan_id = p.id
   AND pa.plan_type IS NULL;

-- Por si quedó algún huérfano (plan eliminado): asumir 'training'.
UPDATE public.plan_assignments
   SET plan_type = 'training'
 WHERE plan_type IS NULL;

ALTER TABLE public.plan_assignments
  ALTER COLUMN plan_type SET NOT NULL,
  ALTER COLUMN plan_type SET DEFAULT 'training';

-- ─────────────────────────────────────────────────────────────
-- 4. Backfill: status desde el booleano existente
-- ─────────────────────────────────────────────────────────────
-- Asignaciones inactivas pasan a 'archived' (no sabemos por qué se
-- desactivaron, archived es el catch-all neutro).
UPDATE public.plan_assignments
   SET status = CASE WHEN active THEN 'active' ELSE 'archived' END,
       status_changed_at = COALESCE(status_changed_at, created_at, now())
 WHERE status = 'active' AND active = false;

-- ─────────────────────────────────────────────────────────────
-- 5. Limpieza de duplicados activos (training)
-- ─────────────────────────────────────────────────────────────
-- Para cada (student_id) con más de un plan_type='training' en estado
-- 'active', conservar el más reciente como 'active' y marcar los
-- anteriores como 'replaced' apuntando al sucesor cronológico.
DO $$
DECLARE
  rec RECORD;
  prev_id uuid;
  curr_id uuid;
BEGIN
  FOR rec IN
    SELECT student_id
      FROM public.plan_assignments
     WHERE status = 'active' AND plan_type = 'training'
     GROUP BY student_id
    HAVING COUNT(*) > 1
  LOOP
    prev_id := NULL;
    -- Iteramos del más reciente al más viejo.
    FOR curr_id IN
      SELECT id
        FROM public.plan_assignments
       WHERE student_id = rec.student_id
         AND status = 'active'
         AND plan_type = 'training'
       ORDER BY created_at DESC, id DESC
    LOOP
      IF prev_id IS NULL THEN
        -- El más reciente queda como 'active'.
        prev_id := curr_id;
      ELSE
        -- Los demás se marcan 'replaced' apuntando al inmediato
        -- siguiente cronológico (que ya pasó por aquí en la iter anterior).
        UPDATE public.plan_assignments
           SET status = 'replaced',
               replaced_by_assignment_id = prev_id,
               status_reason = COALESCE(status_reason, 'Limpieza automática: reemplazado por asignación más reciente'),
               status_changed_at = now()
         WHERE id = curr_id;
        prev_id := curr_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. Trigger: mantener plan_type denormalizado en sync con plans
-- ─────────────────────────────────────────────────────────────
-- Al INSERT toma el plan_type del plan asociado. Al UPDATE de plan_id,
-- también. No es forwardable desde plans → plan_assignments porque
-- cambiar plan_type en plans es muy raro (sería cambiar la naturaleza
-- de un plan ya creado), pero contemplamos el caso vía trigger explícito
-- aparte (ver paso 7).
CREATE OR REPLACE FUNCTION public.plan_assignments_sync_plan_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.plan_id IS DISTINCT FROM OLD.plan_id) THEN
    SELECT COALESCE(p.plan_type, 'training')
      INTO NEW.plan_type
      FROM public.plans p
     WHERE p.id = NEW.plan_id;
    -- Si el plan no existe (debería ser imposible por FK), default training.
    IF NEW.plan_type IS NULL THEN
      NEW.plan_type := 'training';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_plan_assignments_sync_plan_type
  ON public.plan_assignments;
CREATE TRIGGER trg_plan_assignments_sync_plan_type
  BEFORE INSERT OR UPDATE OF plan_id
  ON public.plan_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_assignments_sync_plan_type();

-- ─────────────────────────────────────────────────────────────
-- 7. Trigger: si cambia plans.plan_type, propagar a las asignaciones
-- ─────────────────────────────────────────────────────────────
-- Ultra defensivo: hoy nadie cambia plan_type después de crear, pero
-- si llegara a pasar (UI futura, migration, etc.) las asignaciones
-- quedarían inconsistentes.
CREATE OR REPLACE FUNCTION public.plans_propagate_plan_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
    UPDATE public.plan_assignments
       SET plan_type = NEW.plan_type
     WHERE plan_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_plans_propagate_plan_type ON public.plans;
CREATE TRIGGER trg_plans_propagate_plan_type
  AFTER UPDATE OF plan_type
  ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.plans_propagate_plan_type();

-- ─────────────────────────────────────────────────────────────
-- 8. Trigger: mantener plan_assignments.active espejo de status
-- ─────────────────────────────────────────────────────────────
-- active = true ⇔ status = 'active'. Cualquier cambio en uno se
-- refleja en el otro automáticamente, así NINGÚN consumidor existente
-- (RLS, queries del cliente, etc.) se rompe durante la migración
-- progresiva del código.
CREATE OR REPLACE FUNCTION public.plan_assignments_sync_active_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si el cliente tocó status, alinear active.
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.active := (NEW.status = 'active');
    NEW.status_changed_at := now();
  -- Si el cliente tocó active (código viejo todavía no migrado),
  -- alinear status.
  ELSIF TG_OP = 'UPDATE'
        AND NEW.active IS DISTINCT FROM OLD.active
        AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    NEW.status := CASE WHEN NEW.active THEN 'active' ELSE 'archived' END;
    NEW.status_changed_at := now();
  -- INSERT: status default es 'active', pero si el cliente forzó otra
  -- cosa, alineamos.
  ELSIF TG_OP = 'INSERT' THEN
    -- Si vino active explícito y status default, respetamos active.
    IF NEW.active IS NOT NULL AND NEW.status = 'active' AND NOT NEW.active THEN
      NEW.status := 'archived';
    ELSE
      NEW.active := (NEW.status = 'active');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_plan_assignments_sync_active
  ON public.plan_assignments;
CREATE TRIGGER trg_plan_assignments_sync_active
  BEFORE INSERT OR UPDATE OF status, active
  ON public.plan_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_assignments_sync_active_flag();

-- ─────────────────────────────────────────────────────────────
-- 9. Validación: linked_assignment_id solo para evaluaciones
-- ─────────────────────────────────────────────────────────────
-- Una asignación de evaluación puede estar linkeada a una asignación
-- de training del MISMO alumno. Una asignación de training nunca
-- debería tener linked_assignment_id (no tiene sentido).
CREATE OR REPLACE FUNCTION public.plan_assignments_validate_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link_student uuid;
  link_type text;
BEGIN
  IF NEW.linked_assignment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Solo evaluaciones pueden linkearse a otra asignación.
  IF NEW.plan_type <> 'evaluation' THEN
    RAISE EXCEPTION 'linked_assignment_id solo aplica a asignaciones de evaluación';
  END IF;

  SELECT student_id, plan_type
    INTO link_student, link_type
    FROM public.plan_assignments
   WHERE id = NEW.linked_assignment_id;

  IF link_student IS NULL THEN
    RAISE EXCEPTION 'linked_assignment_id apunta a una asignación inexistente';
  END IF;

  IF link_student <> NEW.student_id THEN
    RAISE EXCEPTION 'linked_assignment_id debe pertenecer al mismo alumno';
  END IF;

  IF link_type <> 'training' THEN
    RAISE EXCEPTION 'linked_assignment_id debe apuntar a un plan de entrenamiento';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_plan_assignments_validate_link
  ON public.plan_assignments;
CREATE TRIGGER trg_plan_assignments_validate_link
  BEFORE INSERT OR UPDATE OF linked_assignment_id, plan_type, student_id
  ON public.plan_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_assignments_validate_link();

-- ─────────────────────────────────────────────────────────────
-- 10. Validación: parent_plan_id solo para evaluaciones template
-- ─────────────────────────────────────────────────────────────
-- Una evaluación puede declararse como parte de un plan de training.
-- Un plan de training nunca debería tener parent_plan_id.
CREATE OR REPLACE FUNCTION public.plans_validate_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_type text;
BEGIN
  IF NEW.parent_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_type <> 'evaluation' THEN
    RAISE EXCEPTION 'parent_plan_id solo aplica a planes de evaluación';
  END IF;

  IF NEW.parent_plan_id = NEW.id THEN
    RAISE EXCEPTION 'parent_plan_id no puede apuntar al mismo plan';
  END IF;

  SELECT plan_type INTO parent_type
    FROM public.plans
   WHERE id = NEW.parent_plan_id;

  IF parent_type IS NULL THEN
    RAISE EXCEPTION 'parent_plan_id apunta a un plan inexistente';
  END IF;

  IF parent_type <> 'training' THEN
    RAISE EXCEPTION 'parent_plan_id debe apuntar a un plan de entrenamiento';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_plans_validate_parent ON public.plans;
CREATE TRIGGER trg_plans_validate_parent
  BEFORE INSERT OR UPDATE OF parent_plan_id, plan_type
  ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.plans_validate_parent();

-- ─────────────────────────────────────────────────────────────
-- 11. Índice parcial único: un solo training 'active' por alumno
-- ─────────────────────────────────────────────────────────────
-- Esto es la red de seguridad para que NUNCA vuelva a aparecer el bug
-- del badge equivocado. Las evaluaciones quedan exentas: un alumno
-- puede tener varias evaluaciones activas en paralelo.
DROP INDEX IF EXISTS public.one_active_training_per_student;
CREATE UNIQUE INDEX one_active_training_per_student
  ON public.plan_assignments (student_id)
  WHERE status = 'active' AND plan_type = 'training';

-- ─────────────────────────────────────────────────────────────
-- 12. Índices de soporte
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plan_assignments_status
  ON public.plan_assignments (student_id, status);

CREATE INDEX IF NOT EXISTS idx_plan_assignments_linked
  ON public.plan_assignments (linked_assignment_id)
  WHERE linked_assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plans_parent_plan
  ON public.plans (parent_plan_id)
  WHERE parent_plan_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 13. Comentarios de documentación (opcional pero útil para psql)
-- ─────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.plan_assignments.status IS
  'Ciclo de vida: active|paused|replaced|completed|archived. Mantiene active boolean en sync vía trigger.';
COMMENT ON COLUMN public.plan_assignments.replaced_by_assignment_id IS
  'Si status=replaced, apunta a la asignación que tomó su lugar. NULL en otros estados.';
COMMENT ON COLUMN public.plan_assignments.plan_type IS
  'Denormalizado desde plans.plan_type. Mantenido por trigger.';
COMMENT ON COLUMN public.plan_assignments.linked_assignment_id IS
  'Solo para evaluaciones: vincula esta asignación a una asignación de training del mismo alumno.';
COMMENT ON COLUMN public.plans.parent_plan_id IS
  'Solo para plans con plan_type=evaluation: declara que la evaluación forma parte de un plan de training.';
