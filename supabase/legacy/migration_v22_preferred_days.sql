-- ============================================================
-- Migration v22: Días preferidos de entrenamiento por asignación
-- ============================================================
-- Motivación:
--   Hoy plan_assignments solo se relaciona con plans.sessions_per_week
--   (un número), pero no guarda QUÉ días específicos de la semana
--   debería entrenar el alumno. Sin esta información el dashboard del
--   coach no puede:
--     - calcular adherencia día por día (verde / ámbar / coral)
--     - mostrar en el calendario qué días "debería haber ido"
--     - alertar cuando un alumno se saltea un día concreto
--
--   La info vive en plan_assignments (NO en plans) porque dos alumnos
--   pueden tener el mismo plan template y entrenar en días distintos:
--   Lun/Mié/Vie vs Mar/Jue/Sáb.
--
-- Esta migración introduce:
--   1. plan_assignments.preferred_days jsonb. Array de ints 0-6.
--      Convención: 0=domingo, 1=lunes, ..., 6=sábado. Coincide con
--      JavaScript Date.getDay() a propósito, para minimizar
--      conversiones en el cliente.
--   2. plan_assignments.schedule_mode text ('fixed' | 'flexible').
--      - flexible (DEFAULT): solo importa la cantidad semanal.
--        La adherencia se mide sobre el total de sesiones cumplidas
--        en la semana, no por día específico. preferred_days NULL/[].
--      - fixed: el alumno tiene días definidos. La adherencia se mide
--        día por día. preferred_days debe ser array no vacío con
--        valores únicos en [0..6].
--   3. Backfill explícito: TODAS las asignaciones existentes pasan a
--      'flexible' con preferred_days NULL. Comportamiento idéntico al
--      actual: nadie ve cambios hasta que el coach edite asignaciones.
--   4. Trigger de validación que asegura coherencia entre schedule_mode
--      y preferred_days.
--
-- Migración aditiva e idempotente:
--   - No modifica columnas existentes.
--   - No altera RLS ni triggers existentes.
--   - No rompe queries del cliente que ignoren estos campos.
--   - Re-ejecutarla es seguro (IF NOT EXISTS, DROP IF EXISTS).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas nuevas en plan_assignments
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.plan_assignments
  ADD COLUMN IF NOT EXISTS schedule_mode text NOT NULL DEFAULT 'flexible'
    CHECK (schedule_mode IN ('fixed', 'flexible')),
  ADD COLUMN IF NOT EXISTS preferred_days jsonb;

-- ─────────────────────────────────────────────────────────────
-- 2. Backfill (no-op si ya corrió, explícito por claridad)
-- ─────────────────────────────────────────────────────────────
-- El DEFAULT 'flexible' ya cubre las filas nuevas; este UPDATE deja
-- documentada la intención para asignaciones preexistentes y es
-- idempotente: NULL solo aparece si la columna se acaba de agregar.
UPDATE public.plan_assignments
   SET schedule_mode = 'flexible'
 WHERE schedule_mode IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Trigger de validación schedule_mode ↔ preferred_days
-- ─────────────────────────────────────────────────────────────
-- Reglas:
--   schedule_mode='flexible'
--     → preferred_days debe ser NULL o array vacío [].
--   schedule_mode='fixed'
--     → preferred_days debe ser un array JSON
--     → con al menos 1 elemento
--     → todos integers en [0..6] (regex anclado para descartar 1.5,
--       -1, 10, "1", etc.)
--     → sin duplicados
--
-- Importante: NO validamos que length(preferred_days) coincida con
-- plans.sessions_per_week. Esa coherencia se valida (y se sugiere)
-- en la UI del coach. Razones:
--   - el coach podría querer asignar 3 días aun cuando el plan
--     template diga 4 (descarga, lesión, agenda complicada).
--   - sessions_per_week en plans puede cambiar después de asignar y
--     no queremos invalidar asignaciones retroactivamente.
CREATE OR REPLACE FUNCTION public.plan_assignments_validate_preferred_days()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  arr_len    int;
  unique_len int;
  bad_count  int;
BEGIN
  -- ── Modo flexible: preferred_days vacío o nulo ─────────────
  IF NEW.schedule_mode = 'flexible' THEN
    IF NEW.preferred_days IS NOT NULL
       AND jsonb_typeof(NEW.preferred_days) = 'array'
       AND jsonb_array_length(NEW.preferred_days) > 0 THEN
      RAISE EXCEPTION
        'En schedule_mode=flexible, preferred_days debe ser NULL o []';
    END IF;
    RETURN NEW;
  END IF;

  -- ── Modo fixed: validar el array ───────────────────────────
  IF NEW.preferred_days IS NULL THEN
    RAISE EXCEPTION
      'En schedule_mode=fixed, preferred_days no puede ser NULL';
  END IF;

  IF jsonb_typeof(NEW.preferred_days) <> 'array' THEN
    RAISE EXCEPTION
      'preferred_days debe ser un array JSON, recibido: %',
      jsonb_typeof(NEW.preferred_days);
  END IF;

  arr_len := jsonb_array_length(NEW.preferred_days);

  IF arr_len = 0 THEN
    RAISE EXCEPTION
      'En schedule_mode=fixed, preferred_days debe contener al menos 1 día';
  END IF;

  -- Cada elemento: número entero entre 0 y 6.
  SELECT COUNT(*) INTO bad_count
    FROM jsonb_array_elements(NEW.preferred_days) AS elem
   WHERE NOT (
     jsonb_typeof(elem) = 'number'
     AND elem::text ~ '^[0-6]$'
   );

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'preferred_days debe contener solo enteros entre 0 y 6 (0=domingo, 6=sábado)';
  END IF;

  -- Sin duplicados.
  SELECT COUNT(DISTINCT elem::text::int) INTO unique_len
    FROM jsonb_array_elements(NEW.preferred_days) AS elem;

  IF unique_len <> arr_len THEN
    RAISE EXCEPTION 'preferred_days no puede contener días duplicados';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_plan_assignments_validate_preferred_days
  ON public.plan_assignments;
CREATE TRIGGER trg_plan_assignments_validate_preferred_days
  BEFORE INSERT OR UPDATE OF schedule_mode, preferred_days
  ON public.plan_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.plan_assignments_validate_preferred_days();

-- ─────────────────────────────────────────────────────────────
-- 4. Índice de soporte
-- ─────────────────────────────────────────────────────────────
-- El dashboard del coach va a filtrar repetidamente por
-- "asignaciones con horario fijo" para calcular adherencia. Índice
-- parcial barato.
CREATE INDEX IF NOT EXISTS idx_plan_assignments_fixed_schedule
  ON public.plan_assignments (student_id, plan_id)
  WHERE schedule_mode = 'fixed';

-- ─────────────────────────────────────────────────────────────
-- 5. Comentarios de documentación
-- ─────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.plan_assignments.schedule_mode IS
  'Cómo se evalúa la adherencia del alumno: fixed (días específicos en preferred_days) | flexible (solo cantidad semanal, default).';

COMMENT ON COLUMN public.plan_assignments.preferred_days IS
  'JSONB array de ints 0-6 (0=domingo, 6=sábado, igual que JS Date.getDay()). NULL/[] cuando schedule_mode=flexible. Validado por trigger trg_plan_assignments_validate_preferred_days.';
