-- ============================================================
-- GYM APP v14 — BLOQUES POR DÍA (fuerza / aeróbico / circuito)
-- ============================================================
-- Motivación:
--   Cada día (A, B, C…) puede tener múltiples bloques de 3 tipos:
--     - strength: ejercicios con peso/reps/series (comportamiento actual)
--     - aerobic : bloque de cardio (duración + intensidad + formato)
--     - circuit : bloque tipo HIIT / AMRAP / EMOM / libre
--
--   Antes, plan_exercises vivía "plano" bajo (plan_id, section).
--   Ahora, los ejercicios cuelgan de un plan_block y la estructura
--   principal del plan es plan_blocks.
--
--   Los planes existentes se migran creando un bloque 'strength'
--   por cada combinación (plan_id, section) con ejercicios, y
--   enlazando los plan_exercises a ese bloque. No se pierde data.
-- ============================================================


-- ============================================================
-- 1. TABLA plan_blocks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plan_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  section       text NOT NULL,   -- 'activation', 'day_a', 'day_b', 'day_c', ...
  block_type    text NOT NULL CHECK (block_type IN ('strength', 'aerobic', 'circuit')),
  order_index   int NOT NULL DEFAULT 0,
  title         text,            -- opcional: "Press + remo", "Cardio final"
  notes         text,            -- notas técnicas del bloque

  -- Aeróbico
  aerobic_format            text CHECK (aerobic_format IN ('continuous','intervals','hiit','progressive')),
  aerobic_total_minutes     int,
  aerobic_intensity         text CHECK (aerobic_intensity IN ('soft','moderate','intense')),
  aerobic_work_seconds      int,  -- si intervalos/HIIT
  aerobic_rest_seconds      int,
  aerobic_rounds            int,
  aerobic_expected_sensation text,

  -- Circuito
  circuit_type          text CHECK (circuit_type IN ('hiit','amrap','emom','free')),
  circuit_work_seconds  int,   -- HIIT
  circuit_rest_seconds  int,   -- HIIT
  circuit_rounds        int,   -- HIIT
  circuit_total_minutes int,   -- AMRAP / EMOM
  circuit_intensity     text CHECK (circuit_intensity IN ('soft','moderate','intense')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER plan_blocks_updated_at
  BEFORE UPDATE ON public.plan_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_plan_blocks_plan    ON public.plan_blocks(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_blocks_section ON public.plan_blocks(plan_id, section, order_index);


-- ============================================================
-- 2. plan_exercises — nuevas columnas
-- ============================================================
-- block_id         → FK al bloque (nullable durante migración)
-- exercise_mode    → 'reps' (fuerza, default) | 'time' (circuitos por tiempo)
-- duration_seconds → para ejercicios "por tiempo" (ej: 30 seg en HIIT)
-- ============================================================
ALTER TABLE public.plan_exercises
  ADD COLUMN IF NOT EXISTS block_id         uuid REFERENCES public.plan_blocks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS exercise_mode    text CHECK (exercise_mode IN ('reps','time')) DEFAULT 'reps',
  ADD COLUMN IF NOT EXISTS duration_seconds int;

CREATE INDEX IF NOT EXISTS idx_plan_exercises_block ON public.plan_exercises(block_id);


-- ============================================================
-- 3. workout_block_logs — registros del alumno por BLOQUE
-- ============================================================
-- Usado para bloques aeróbico y circuito, donde no tiene sentido
-- un log por ejercicio (el bloque es la unidad).
-- Para fuerza se sigue usando workout_logs (por ejercicio).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workout_block_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id        uuid REFERENCES public.plans(id) ON DELETE CASCADE,
  plan_block_id  uuid NOT NULL REFERENCES public.plan_blocks(id) ON DELETE CASCADE,
  logged_date    date NOT NULL DEFAULT current_date,
  logged_late    boolean DEFAULT false,

  -- Datos comunes
  actual_minutes         numeric,          -- duración real del bloque
  actual_rounds          int,              -- rondas completadas (circuito)
  perceived_difficulty   int CHECK (perceived_difficulty BETWEEN 1 AND 10),
  perceived_difficulty_label text,
  notes                  text,
  completed              boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (student_id, plan_block_id, logged_date)
);

CREATE TRIGGER workout_block_logs_updated_at
  BEFORE UPDATE ON public.workout_block_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_workout_block_logs_student ON public.workout_block_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_workout_block_logs_block   ON public.workout_block_logs(plan_block_id);
CREATE INDEX IF NOT EXISTS idx_workout_block_logs_date    ON public.workout_block_logs(logged_date);


-- ============================================================
-- 4. MIGRACIÓN DE DATOS EXISTENTES
--    Por cada (plan_id, section) con ejercicios, crear un
--    plan_block tipo 'strength' y enlazar los ejercicios.
-- ============================================================
INSERT INTO public.plan_blocks (plan_id, section, block_type, order_index)
SELECT DISTINCT pe.plan_id, pe.section, 'strength', 0
FROM public.plan_exercises pe
WHERE pe.section IS NOT NULL
  AND pe.block_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.plan_blocks pb
    WHERE pb.plan_id = pe.plan_id
      AND pb.section = pe.section
      AND pb.block_type = 'strength'
  );

UPDATE public.plan_exercises pe
SET block_id = pb.id
FROM public.plan_blocks pb
WHERE pe.block_id IS NULL
  AND pb.plan_id = pe.plan_id
  AND pb.section = pe.section
  AND pb.block_type = 'strength';


-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.plan_blocks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_block_logs  ENABLE ROW LEVEL SECURITY;

-- plan_blocks: coach puede todo, alumno lee los de sus planes activos
DROP POLICY IF EXISTS "coach_manage_plan_blocks" ON public.plan_blocks;
CREATE POLICY "coach_manage_plan_blocks"
  ON public.plan_blocks FOR ALL
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'coach'));

DROP POLICY IF EXISTS "student_view_own_plan_blocks" ON public.plan_blocks;
CREATE POLICY "student_view_own_plan_blocks"
  ON public.plan_blocks FOR SELECT
  USING (
    plan_id IN (SELECT public.get_my_active_plan_ids())
  );

-- workout_block_logs: alumno maneja los suyos, coach lee todos
DROP POLICY IF EXISTS "student_manage_own_block_logs" ON public.workout_block_logs;
CREATE POLICY "student_manage_own_block_logs"
  ON public.workout_block_logs FOR ALL
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "coach_view_all_block_logs" ON public.workout_block_logs;
CREATE POLICY "coach_view_all_block_logs"
  ON public.workout_block_logs FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'coach'));

DROP POLICY IF EXISTS "coach_update_all_block_logs" ON public.workout_block_logs;
CREATE POLICY "coach_update_all_block_logs"
  ON public.workout_block_logs FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'coach'));


-- ============================================================
-- 6. VERIFICACIÓN RÁPIDA
-- ============================================================
-- Estos SELECT ayudan a confirmar que la migración dejó todo consistente:
--
--   -- Todos los ejercicios existentes deben tener block_id:
--   SELECT COUNT(*) AS huerfanos FROM public.plan_exercises WHERE block_id IS NULL;
--   -- esperado: 0
--
--   -- Un bloque strength por (plan_id, section) con ejercicios:
--   SELECT plan_id, section, COUNT(*) AS bloques
--   FROM public.plan_blocks
--   WHERE block_type = 'strength'
--   GROUP BY plan_id, section
--   HAVING COUNT(*) > 1;
--   -- esperado: 0 filas
-- ============================================================
