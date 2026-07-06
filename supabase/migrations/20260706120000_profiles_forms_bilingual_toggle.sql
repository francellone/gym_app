-- Plantillas bilingües (docs/plan-formularios-bilingues.md):
-- toggle manual del coach para el modo bilingüe de formularios.
--   null = automático (se deriva de profiles.language de sus alumnos)
--   true = forzado manualmente (el coach quiere preparar traducciones antes
--          de tener alumnos en otro idioma)
alter table public.profiles
  add column if not exists forms_bilingual boolean default null;

comment on column public.profiles.forms_bilingual is
  'Modo bilingüe de formularios (solo coaches): null = automático (derivado del language de sus alumnos), true = forzado manualmente.';
