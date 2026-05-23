-- Mueve archive.student_profiles → public.student_profiles y la marca con
-- COMMENTs para que cualquier dev/agente futuro entienda su rol (snapshot
-- inmutable del intake, NO source-of-truth operacional).
--
-- Diagnóstico previo (handoff 16, 2026-05-23):
--   - 0 funciones Postgres la referencian
--   - 0 archivos del front la referencian
--   - process_intake_submission escribe a public.profiles, NO acá
--   - 4 filas vivas: 3 con submission_id que matchean intake_form_submissions.responses,
--     1 huérfana (student1 test legacy)
--   - public.profiles ya tiene todos los campos operacionales equivalentes
--
-- El doc 11 §2.1 decía "tabla operacional mal ubicada". La realidad encontrada
-- el 23/05 es que estaba huérfana — residuo del flujo original del intake.
-- Move + COMMENTs es defensa contra confusión futura. Ver:
--   - docs/known-exceptions.md §"public.student_profiles es snapshot inmutable…"
--   - diagnostico_arquitec/16_handoff_proximo_agente_2026-05-23_late.md
--   - diagnostico_arquitec/01_changelog_back.md migración #24

ALTER TABLE archive.student_profiles SET SCHEMA public;

-- Las policies, FKs, trigger y RLS state viajan con la tabla (atadas al oid).

COMMENT ON TABLE public.student_profiles IS
  'Snapshot inmutable del intake form al momento de alta del alumno. NO es source-of-truth operacional — los datos vivos del perfil viven en public.profiles (goal, level, weekly_frequency, lugar_entrenamiento, tiene_lesiones, patologias, descripcion_lesiones, weight_kg, height_cm, target_weight_kg). public.intake_form_submissions.responses contiene la misma data en jsonb cuando submission_id IS NOT NULL. Ninguna RPC actual lee de esta tabla; se mantiene por valor histórico (qué dijo el alumno cuando arrancó, antes de cualquier edición posterior). Si necesitás datos del alumno para queries operacionales o features nuevas, usá public.profiles. Movida desde schema archive el 2026-05-23 (handoff 16) — antes estaba mal ubicada porque NO es un backup deny-by-default.';

COMMENT ON COLUMN public.student_profiles.objetivo_principal IS
  'Texto crudo del intake (ej "Mejorar salud general"). Equivalente operacional: public.profiles.goal.';

COMMENT ON COLUMN public.student_profiles.nivel_experiencia IS
  'Texto crudo del intake (ej "Intermedio (1-3 años)"). Equivalente operacional normalizado: public.profiles.level (beginner/intermediate/advanced via _intake_map_nivel()).';

COMMENT ON COLUMN public.student_profiles.frecuencia_semanal IS
  'Texto crudo del intake (ej "3-4 veces por semana"). Equivalente operacional como int: public.profiles.weekly_frequency (via _intake_parse_frecuencia()).';

COMMENT ON COLUMN public.student_profiles.raw_data IS
  'Snapshot JSON completo de la submission. Redundante con public.intake_form_submissions.responses cuando submission_id IS NOT NULL.';

COMMENT ON COLUMN public.student_profiles.submission_id IS
  'FK a public.intake_form_submissions. NULL para filas huérfanas (ej. seeds de test viejos).';
