-- Renombra public.student_profiles a un nombre que explique su rol sin
-- necesidad de leer COMMENTs: es un snapshot del intake, no un "perfil
-- de alumno". Continuación inmediata de la migración #24 (handoff 16) que
-- la movió desde archive. Ver:
--   - docs/known-exceptions.md
--   - diagnostico_arquitec/16_handoff_proximo_agente_2026-05-23_late.md
--     §"Sugerencia opcional para una sesión futura"
--
-- Cero callers actuales (verificado en handoff 16). Sin refactor del front.

ALTER TABLE public.student_profiles RENAME TO intake_profile_snapshots;

-- Constraints
ALTER TABLE public.intake_profile_snapshots
  RENAME CONSTRAINT student_profiles_pkey TO intake_profile_snapshots_pkey;
ALTER TABLE public.intake_profile_snapshots
  RENAME CONSTRAINT student_profiles_student_id_fkey TO intake_profile_snapshots_student_id_fkey;
ALTER TABLE public.intake_profile_snapshots
  RENAME CONSTRAINT student_profiles_submission_id_fkey TO intake_profile_snapshots_submission_id_fkey;
ALTER TABLE public.intake_profile_snapshots
  RENAME CONSTRAINT student_profiles_student_id_key TO intake_profile_snapshots_student_id_key;

-- Policies (sus qual refs a `student_profiles.student_id` se reescriben
-- automáticamente al nuevo nombre porque están atadas al oid de la tabla)
ALTER POLICY coach_read_own_student_profiles
  ON public.intake_profile_snapshots
  RENAME TO coach_read_own_intake_snapshots;
ALTER POLICY student_manage_own_student_profiles
  ON public.intake_profile_snapshots
  RENAME TO student_manage_own_intake_snapshot;

-- Trigger
ALTER TRIGGER student_profiles_updated_at
  ON public.intake_profile_snapshots
  RENAME TO intake_profile_snapshots_updated_at;

-- COMMENT ON TABLE actualizado (refleja el nuevo nombre y menciona los old
-- names por trazabilidad)
COMMENT ON TABLE public.intake_profile_snapshots IS
  'Snapshot inmutable del intake form al momento de alta del alumno. NO es source-of-truth operacional — los datos vivos del perfil viven en public.profiles (goal, level, weekly_frequency, lugar_entrenamiento, tiene_lesiones, patologias, descripcion_lesiones, weight_kg, height_cm, target_weight_kg). public.intake_form_submissions.responses contiene la misma data en jsonb cuando submission_id IS NOT NULL. Ninguna RPC actual lee de esta tabla; se mantiene por valor histórico (qué dijo el alumno cuando arrancó, antes de cualquier edición posterior). Si necesitás datos del alumno para queries operacionales o features nuevas, usá public.profiles. Histórico: vivía en archive.student_profiles hasta el 2026-05-23 AM (movida a public con COMMENTs); ese mismo día PM renombrada a intake_profile_snapshots para que el nombre cuente la historia sin necesidad de leer COMMENTs (handoff 16).';

-- Los COMMENT ON COLUMN se preservan automáticamente con el rename (van por oid)
