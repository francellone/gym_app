-- ============================================================
-- Migration v24c: corregir created_at del backfill de notas
-- ------------------------------------------------------------
-- Bug detectado el 2026-05-17: el backfill de v24 usaba
-- COALESCE(wl.updated_at, wl.created_at, now()) priorizando
-- updated_at. Pero alguna migración bulk previa tocó
-- workout_logs.updated_at dejándolo idéntico para todas las filas.
-- Resultado: las notas backfilleadas tenían 1-2 timestamps
-- distintos en lugar de los ~48 reales por alumno.
--
-- Fix: re-anclar created_at/updated_at de notas backfilleadas a
-- los timestamps REALES de la fila origen.
--
-- No afectamos notas free (context_type='free') porque vienen de
-- profiles.updated_at — best-effort acceptable: la fecha de
-- creación real no se preservó nunca para esas observaciones.
-- ============================================================

-- 1. workout_log
UPDATE public.notes n
   SET created_at = wl.created_at,
       updated_at = wl.created_at
  FROM public.workout_logs wl
 WHERE n.context_type = 'workout_log'
   AND n.context_id   = wl.id;

-- 2. workout_block_log
UPDATE public.notes n
   SET created_at = wbl.created_at,
       updated_at = wbl.created_at
  FROM public.workout_block_logs wbl
 WHERE n.context_type = 'workout_block_log'
   AND n.context_id   = wbl.id;

-- 3. evaluation_test (ambigüedad: context_id apunta a test_id, no a
--    response.id). Tomamos MIN(etr.created_at) del thread correspondiente.
UPDATE public.notes n
   SET created_at = sub.first_resp_created,
       updated_at = sub.first_resp_created
  FROM (
    SELECT
      n2.id AS note_id,
      MIN(etr.created_at) AS first_resp_created
    FROM public.notes n2
    JOIN public.note_threads nt ON nt.id = n2.thread_id
    JOIN public.evaluation_test_responses etr ON etr.test_id = n2.context_id
    JOIN public.evaluation_results        er  ON er.id = etr.evaluation_result_id
   WHERE n2.context_type = 'evaluation_test'
     AND er.student_id = nt.student_id
   GROUP BY n2.id
  ) sub
 WHERE n.id = sub.note_id;

-- 4. Recalcular thread.last_message_at consistente
UPDATE public.note_threads nt
   SET last_message_at = sub.max_ts
  FROM (
    SELECT thread_id, MAX(created_at) AS max_ts
      FROM public.notes
     WHERE deleted_at IS NULL
     GROUP BY thread_id
  ) sub
 WHERE nt.id = sub.thread_id;
