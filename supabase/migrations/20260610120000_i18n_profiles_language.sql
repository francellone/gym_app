-- Doc 46: idioma de la app por alumno (vista alumno EN/ES).
-- Aplicada en prod el 2026-06-10 vía MCP (apply_migration i18n_profiles_language).
alter table public.profiles
  add column if not exists language text not null default 'es'
  constraint profiles_language_check check (language in ('es','en'));

comment on column public.profiles.language is 'Idioma de la UI del alumno (es|en). Doc 46.';
