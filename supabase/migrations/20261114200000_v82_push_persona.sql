-- ============================================================
-- v82 — Avisos al celular para quien entrena — Franco, 2026-11-14
-- ------------------------------------------------------------
-- Segunda etapa de v81. Hasta acá solo le sonaban al coach.
--
-- QUÉ SUENA para quien entrena (decisión de Franco, 2026-11-14):
--   suena        → coach_comment (mensaje de la coach), plan_assigned
--   solo campana → plan_updated (la coach puede editar un plan varias veces
--                  seguidas y sonaría cada vez) y todo lo demás
--
-- Los tipos de cada lado no se pisan, así que los de quien entrena valen
-- para cualquier rol: una coach que también entrena (role = 'coach') recibe
-- igual el mensaje de SU coach.
--
-- El texto del aviso sale en el idioma del perfil: eso lo resuelve la edge
-- function send-push (push-texts.json), no la base.
--
-- PARA VOLVER A "solo coach": aplicar de nuevo la definición de v81.
-- ============================================================

create or replace function public.fn_push_policy(p_type text, p_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    -- a quien entrena
    p_type in ('coach_comment', 'plan_assigned')
    -- al coach
    or (p_role = 'coach' and p_type in (
      'student_note',
      'form_submitted',
      'evaluation_completed',
      'coach_link_request',
      'exercise_unclear'
    ))
$$;

comment on function public.fn_push_policy(text, text) is
  'v81/v82: única fuente de qué avisos van al celular, por tipo y rol de quien los recibe.';
