-- ============================================================
-- v58 — Perfil de la coach (pedido de Franco 2026-09-27)
-- ------------------------------------------------------------
-- La coach tiene su página "Mi perfil": foto (v57), nombre, teléfono,
-- idioma de la app (profiles.language, ya existía), idiomas en los que
-- trabaja y una presentación corta EN CADA uno de esos idiomas.
--
--   phone            texto libre (formatos internacionales variados).
--   coach_languages  subconjunto de {es,en}; NULL = no lo definió.
--   bio              {"es": "...", "en": "..."}; una clave por idioma.
--
-- Son columnas de profiles (una persona = una fila) y sirven también para
-- personas si algún día hace falta, pero hoy solo las edita la coach.
-- El historial de cambios (student_edit_history) pasa a registrar solo
-- filas de personas: los cambios de la coach en su propio perfil no son
-- "historial de un alumno".
-- ============================================================

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists coach_languages text[];
alter table public.profiles add column if not exists bio jsonb;

alter table public.profiles drop constraint if exists profiles_coach_languages_check;
alter table public.profiles add constraint profiles_coach_languages_check check (
  coach_languages is null or (coach_languages <@ array['es','en']::text[] and cardinality(coach_languages) >= 1)
);

alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (
  bio is null or (
    jsonb_typeof(bio) = 'object'
    and (bio - 'es' - 'en') = '{}'::jsonb
    and coalesce(length(bio->>'es'), 0) <= 600
    and coalesce(length(bio->>'en'), 0) <= 600
  )
);

alter table public.profiles drop constraint if exists profiles_phone_check;
alter table public.profiles add constraint profiles_phone_check check (phone is null or length(phone) <= 40);

comment on column public.profiles.phone is 'v58: teléfono de contacto (texto libre).';
comment on column public.profiles.coach_languages is 'v58: idiomas en los que trabaja la coach (es/en). Define en qué idiomas carga la presentación.';
comment on column public.profiles.bio is 'v58: presentación corta por idioma {"es","en"}, máx. 600 caracteres cada una.';

CREATE OR REPLACE FUNCTION public.fn_audit_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_changed_by uuid;
  v_old_jsonb  jsonb;
  v_new_jsonb  jsonb;
  v_key        text;
  v_old_value  text;
  v_new_value  text;
BEGIN
  -- v58: solo historial de personas (no de la coach editando su perfil).
  IF NEW.role IS DISTINCT FROM 'student' THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_changed_by := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;
  v_old_jsonb := to_jsonb(OLD);
  v_new_jsonb := to_jsonb(NEW);
  FOR v_key IN SELECT jsonb_object_keys(v_new_jsonb) LOOP
    IF v_key IN ('id', 'created_at', 'updated_at', 'avatar_url') THEN
      CONTINUE;
    END IF;
    v_old_value := v_old_jsonb->>v_key;
    v_new_value := v_new_jsonb->>v_key;
    IF v_old_value IS DISTINCT FROM v_new_value THEN
      INSERT INTO public.student_edit_history (
        student_id, changed_by, field_name, old_value, new_value, changed_at
      ) VALUES (
        NEW.id, v_changed_by, v_key, v_old_value, v_new_value, now()
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
