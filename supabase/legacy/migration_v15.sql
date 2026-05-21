-- =============================================================
-- Migration v15: Preservar resultados de alumnos al borrar evaluaciones
-- =============================================================
-- Cambia el FK de evaluation_results.plan_id de ON DELETE CASCADE (NOT NULL)
-- a ON DELETE SET NULL (nullable).
-- Esto permite al coach borrar un protocolo de evaluación sin perder los
-- resultados históricos de los alumnos: cuando se borra el plan, los registros
-- quedan con plan_id = NULL pero conservan todos sus datos.
-- =============================================================

-- 1. Borrar la FK constraint existente
ALTER TABLE evaluation_results
  DROP CONSTRAINT IF EXISTS evaluation_results_plan_id_fkey;

-- 2. Hacer nullable la columna plan_id
ALTER TABLE evaluation_results
  ALTER COLUMN plan_id DROP NOT NULL;

-- 3. Re-agregar la FK con ON DELETE SET NULL
ALTER TABLE evaluation_results
  ADD CONSTRAINT evaluation_results_plan_id_fkey
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;

-- Nota: la unique constraint (student_id, plan_id, eval_date) sigue funcionando
-- correctamente en PostgreSQL: los NULLs no se comparan como iguales, por lo
-- que múltiples registros con plan_id = NULL no violan la restricción.
