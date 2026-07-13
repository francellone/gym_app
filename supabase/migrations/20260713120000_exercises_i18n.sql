-- Traducciones opcionales de ejercicios (patrón "canónico + i18n", ver docs/plan-formularios-bilingues.md)
-- Forma: { "en": { "name": text, "description": text, "technique_notes": text } }
-- NULL o clave ausente => fallback al canónico (español). Se resuelve en el front.
alter table public.exercises
  add column if not exists i18n jsonb;

comment on column public.exercises.i18n is
  'Traducciones opcionales por idioma: { en: { name, description, technique_notes } }. Canónico = columnas base (es).';
