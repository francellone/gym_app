-- ============================================================================
-- Fix: 6 funciones sin search_path explícito (linter Supabase, WARN)
-- ============================================================================
-- Contexto:
--   La auditoría del 2026-05-16 dejó 0 funciones con search_path mutable.
--   Estas 6 funciones se crearon DESPUÉS de esa auditoría y reabrieron la
--   grieta. Ver diagnostico_arquitec/03_auditoria_estructura_2026-05-20.md
--   sección 5 para el contexto, y la entrada del linter:
--   https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
--
-- Por qué importa:
--   Sin search_path explícito, un schema malicioso (o uno con objetos
--   homónimos a los del sistema) podría secuestrar la resolución de nombres
--   adentro de la función. Es buena práctica fijarlo aunque la función sea
--   SECURITY INVOKER.
--
-- Las 6 funciones (todas SECURITY INVOKER en public):
--   _intake_map_nivel(p_nivel text)
--   _intake_parse_frecuencia(p_text text)
--   enforce_follow_up_template_limit()
--   migrate_assignment_off_template(p_assignment_id uuid)
--   update_updated_at()
--   update_wellbeing_updated_at()
-- ============================================================================

ALTER FUNCTION public._intake_map_nivel(text)                          SET search_path = public, pg_temp;
ALTER FUNCTION public._intake_parse_frecuencia(text)                   SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_follow_up_template_limit()               SET search_path = public, pg_temp;
ALTER FUNCTION public.migrate_assignment_off_template(uuid)            SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at()                              SET search_path = public, pg_temp;
ALTER FUNCTION public.update_wellbeing_updated_at()                    SET search_path = public, pg_temp;

-- Verificación inline: si alguna no aplicó, esto devuelve filas.
DO $$
DECLARE
  pending_count int;
BEGIN
  SELECT count(*) INTO pending_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      '_intake_map_nivel',
      '_intake_parse_frecuencia',
      'enforce_follow_up_template_limit',
      'migrate_assignment_off_template',
      'update_updated_at',
      'update_wellbeing_updated_at'
    )
    AND (p.proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
    ));

  IF pending_count > 0 THEN
    RAISE EXCEPTION 'Quedaron % funciones sin search_path tras el fix', pending_count;
  END IF;

  RAISE NOTICE 'OK: las 6 funciones tienen search_path explícito';
END
$$;
