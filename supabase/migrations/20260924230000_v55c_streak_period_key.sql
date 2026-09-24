-- ============================================================
-- v55c — la clave de una racha incluye la semana en que empezó
-- ------------------------------------------------------------
-- Con 'streak-N' una persona que corta la racha y vuelve a llegar a 2
-- semanas chocaba con el hito 'streak-2' de la racha anterior: la RPC
-- respondía is_new=false y la segunda racha no se celebraba nunca.
-- Formato nuevo: 'streak-<IYYY-Www de inicio>-<N>', p. ej.
-- 'streak-2026-W30-4'. Lo detectó el diseño de la Etapa 2 antes de que
-- existiera ninguna fila (student_milestones vacía al aplicar).
-- ============================================================
alter table public.student_milestones drop constraint student_milestones_period_check;
alter table public.student_milestones add constraint student_milestones_period_check check (
     (kind = 'day_complete'       and period_key ~ '^\d{4}-\d{2}-\d{2}$')
  or (kind in ('week_complete','streak_freeze_used') and period_key ~ '^\d{4}-W\d{2}$')
  or (kind = 'plan_complete'      and assignment_id is not null and period_key = assignment_id::text)
  or (kind = 'personal_best'      and workout_log_id is not null and exercise_id is not null
                                  and period_key = workout_log_id::text)
  or (kind = 'streak'             and period_key ~ '^streak-\d{4}-W\d{2}-\d+$')
);
