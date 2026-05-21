-- Backups creados durante el refactor de notas m26 (migración v26d_drop_legacy_notes_columns)
-- quedaron con RLS deshabilitada. Contenido: 66 filas con texto libre (notas, observaciones,
-- lesiones) accesibles vía anon key. Fix: habilitar RLS sin policies = deny-by-default
-- (sólo service_role puede leer). Coincide con el patrón de archive.plan_assignments_backup_20260508.
-- Ver: diagnostico_arquitec/06_validacion_estado_real_2026-05-21.md §3.1

ALTER TABLE archive.profiles_notes_20260517             ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.workout_logs_notes_20260517         ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.workout_block_logs_notes_20260517   ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.eval_responses_comments_20260517    ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.evaluation_results_notes_20260517   ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE archive.profiles_notes_20260517            IS 'Backup de profiles.notes pre-v26d. RLS habilitada sin policies: deny-by-default, sólo service_role.';
COMMENT ON TABLE archive.workout_logs_notes_20260517        IS 'Backup de workout_logs.notes pre-v26d. RLS habilitada sin policies: deny-by-default, sólo service_role.';
COMMENT ON TABLE archive.workout_block_logs_notes_20260517  IS 'Backup de workout_block_logs.notes pre-v26d. RLS habilitada sin policies: deny-by-default, sólo service_role.';
COMMENT ON TABLE archive.eval_responses_comments_20260517   IS 'Backup de evaluation_test_responses.comments pre-v26d. RLS habilitada sin policies: deny-by-default, sólo service_role.';
COMMENT ON TABLE archive.evaluation_results_notes_20260517  IS 'Backup de evaluation_results.notes pre-v26d. RLS habilitada sin policies: deny-by-default, sólo service_role.';
