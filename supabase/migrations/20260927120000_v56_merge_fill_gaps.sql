-- ============================================================
-- v56 — La fusión de ejercicios completa los huecos del destino
-- ------------------------------------------------------------
-- Pregunta de Franco (2026-09-27): "si son el mismo y uno tiene y otro no,
-- ¿qué pasa?". Hasta v55 la fusión repuntaba referencias pero NO pasaba los
-- datos del ejercicio que se va: descripción, grupo muscular, video, nota
-- técnica, valores por defecto y traducciones quedaban solo en
-- exercise_merges.from_snapshot. Casos reales al 27/09: "Gato Bueno Malo"
-- (la copia con registros no tiene descripción), "Goblet Sq..." y
-- "Vuelos en Y" (grupo muscular en la copia sin uso).
--
-- Regla: el destino MANDA. Solo se completa lo que en el destino está vacío
-- (NULL o texto en blanco). Nunca se pisa un dato existente.
--   - Columnas: description, muscle_group, video_url, technique_notes,
--     default_sets, default_reps, default_weight.
--   - i18n: por idioma y por clave (en.name, en.description, ...), misma regla.
--   - NO se tocan: name (es la identidad elegida), default_weight_mode y
--     default_unilateral (NOT NULL con default: no hay forma de saber si el
--     valor fue elegido o es el de fábrica).
--
-- Deshacer: exercise_merges suma into_snapshot (fila del destino ANTES de la
-- fusión) y counts.filled (lista de campos completados).
-- ============================================================

alter table public.exercise_merges add column if not exists into_snapshot jsonb;
comment on column public.exercise_merges.into_snapshot is
  'v56: fila del ejercicio destino antes de la fusión (para deshacer los campos completados).';

-- Texto vacío = NULL o solo espacios.
create or replace function public._blank(p text) returns boolean
language sql immutable as $$ select p is null or btrim(p) = '' $$;

-- Completa i18n del destino con el del origen, por idioma y por clave.
create or replace function public._merge_i18n_fill(p_into jsonb, p_from jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_out jsonb := coalesce(p_into, '{}'::jsonb);
  v_lang text; v_obj jsonb; v_key text; v_val jsonb; v_cur jsonb;
begin
  if p_from is null or jsonb_typeof(p_from) <> 'object' then return p_into; end if;
  for v_lang, v_obj in select * from jsonb_each(p_from) loop
    if jsonb_typeof(v_obj) <> 'object' then continue; end if;
    v_cur := coalesce(v_out -> v_lang, '{}'::jsonb);
    if jsonb_typeof(v_cur) <> 'object' then continue; end if;
    for v_key, v_val in select * from jsonb_each(v_obj) loop
      if (v_cur -> v_key) is null or public._blank(v_cur ->> v_key) then
        if not (jsonb_typeof(v_val) = 'string' and public._blank(v_val #>> '{}')) then
          v_cur := v_cur || jsonb_build_object(v_key, v_val);
        end if;
      end if;
    end loop;
    v_out := v_out || jsonb_build_object(v_lang, v_cur);
  end loop;
  if v_out = '{}'::jsonb and p_into is null then return null; end if;
  return v_out;
end $$;

CREATE OR REPLACE FUNCTION public.merge_exercises(p_from uuid, p_into uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_from public.exercises; v_into public.exercises; v_counts jsonb := '{}'::jsonb; v_tag_ids uuid[]; n bigint;
        v_filled text[] := '{}'; v_i18n jsonb;
begin
  if not public.is_coach() then raise exception 'solo un coach puede fusionar ejercicios' using errcode = '42501'; end if;
  if p_from = p_into then raise exception 'no se puede fusionar un ejercicio consigo mismo' using errcode = 'P0001'; end if;
  select * into v_from from public.exercises where id = p_from for update;
  select * into v_into from public.exercises where id = p_into for update;
  if v_from.id is null or v_into.id is null then raise exception 'ejercicio inexistente' using errcode = 'P0002'; end if;
  if v_from.merged_into_id is not null then raise exception 'el ejercicio origen ya fue fusionado' using errcode = 'P0001'; end if;
  if v_into.merged_into_id is not null then raise exception 'el ejercicio destino es una lápida de otra fusión' using errcode = 'P0001'; end if;
  if v_into.archived_at is not null then raise exception 'el ejercicio destino está archivado; desarchivalo primero' using errcode = 'P0001'; end if;

  perform set_config('app.bulk_maintenance', 'on', true);

  -- v56: completar huecos del destino (el destino manda)
  if public._blank(v_into.description) and not public._blank(v_from.description) then v_filled := v_filled || 'description'::text; end if;
  if public._blank(v_into.muscle_group) and not public._blank(v_from.muscle_group) then v_filled := v_filled || 'muscle_group'::text; end if;
  if public._blank(v_into.video_url) and not public._blank(v_from.video_url) then v_filled := v_filled || 'video_url'::text; end if;
  if public._blank(v_into.technique_notes) and not public._blank(v_from.technique_notes) then v_filled := v_filled || 'technique_notes'::text; end if;
  if v_into.default_sets is null and v_from.default_sets is not null then v_filled := v_filled || 'default_sets'::text; end if;
  if v_into.default_reps is null and v_from.default_reps is not null then v_filled := v_filled || 'default_reps'::text; end if;
  if v_into.default_weight is null and v_from.default_weight is not null then v_filled := v_filled || 'default_weight'::text; end if;
  v_i18n := public._merge_i18n_fill(v_into.i18n, v_from.i18n);
  if v_i18n is distinct from v_into.i18n then v_filled := v_filled || 'i18n'::text; end if;

  if array_length(v_filled, 1) > 0 then
    update public.exercises set
      description     = case when 'description'     = any(v_filled) then v_from.description     else description end,
      muscle_group    = case when 'muscle_group'    = any(v_filled) then v_from.muscle_group    else muscle_group end,
      video_url       = case when 'video_url'       = any(v_filled) then v_from.video_url       else video_url end,
      technique_notes = case when 'technique_notes' = any(v_filled) then v_from.technique_notes else technique_notes end,
      default_sets    = case when 'default_sets'    = any(v_filled) then v_from.default_sets    else default_sets end,
      default_reps    = case when 'default_reps'    = any(v_filled) then v_from.default_reps    else default_reps end,
      default_weight  = case when 'default_weight'  = any(v_filled) then v_from.default_weight  else default_weight end,
      i18n            = v_i18n
    where id = p_into;
  end if;
  v_counts := v_counts || jsonb_build_object('filled', to_jsonb(v_filled));

  select coalesce(array_agg(tag_id), '{}') into v_tag_ids from public.exercise_tag_assignments where exercise_id = p_from;
  insert into public.exercise_tag_assignments (exercise_id, tag_id)
    select p_into, tag_id from public.exercise_tag_assignments where exercise_id = p_from on conflict do nothing;
  delete from public.exercise_tag_assignments where exercise_id = p_from;
  v_counts := v_counts || jsonb_build_object('tags', coalesce(array_length(v_tag_ids, 1), 0));

  update public.plan_exercises set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('plan_exercises', n);
  update public.plan_exercises set rm_reference_exercise_id = p_into where rm_reference_exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('rm_references', n);
  update public.evaluation_tests set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('eval_tests', n);

  update public.workout_logs set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('workout_logs', n);
  update public.workout_block_logs set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('workout_block_logs', n);
  update public.evaluation_test_responses set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('eval_responses', n);
  update public.plan_exercise_prescription_history set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('prescription_history', n);
  update public.notes set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', n);
  update public.student_milestones set exercise_id = p_into where exercise_id = p_from; get diagnostics n = row_count;
  v_counts := v_counts || jsonb_build_object('milestones', n);

  update public.exercises set archived_at = now(), archived_by = auth.uid(), merged_into_id = p_into where id = p_from;
  insert into public.exercise_merges (from_exercise_id, into_exercise_id, merged_by, counts, from_snapshot, from_tag_ids, into_snapshot)
  values (p_from, p_into, auth.uid(), v_counts, to_jsonb(v_from), v_tag_ids, to_jsonb(v_into));
  return v_counts;
end;
$function$;
revoke execute on function public._merge_i18n_fill(jsonb, jsonb) from public, anon;
