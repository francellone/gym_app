// ============================================================
// milestones/api.js — acceso a student_milestones (v55)
// ============================================================
import { fetchAllRows } from '@/lib/fetchAllRows'
import { toAwardArgs } from './milestoneRules'

// Otorga un hito (idempotente). Devuelve la fila tal como la verá la
// pantalla: { id, kind, period_key, payload, isNew }.
export async function awardMilestone(supabase, studentId, candidate) {
  const { data, error } = await supabase.rpc('award_milestone', toAwardArgs(studentId, candidate))
  if (error) throw error
  return {
    id: data?.id ?? null,
    kind: candidate.kind,
    period_key: candidate.periodKey,
    payload: candidate.payload ?? {},
    isNew: !!data?.is_new,
  }
}

// Deshace un hito de día / semana / plan al desmarcar (v55d): borra la
// fila y corrige o borra el aviso a la coach.
export async function revokeMilestone(supabase, studentId, { kind, periodKey }) {
  const { data, error } = await supabase.rpc('revoke_milestone', {
    p_student_id: studentId,
    p_kind: kind,
    p_period_key: periodKey,
  })
  if (error) throw error
  return !!data
}

// Hitos que la persona todavía no vio (los cargó la coach, o se cortó la
// app antes de mostrarlos). Solo los que tienen pantalla.
export async function fetchPendingMilestones(supabase, studentId) {
  const { data, error } = await supabase
    .from('student_milestones')
    .select('id, kind, period_key, payload, created_by, created_at')
    .eq('student_id', studentId)
    .is('celebrated_at', null)
    .is('voided_at', null)
    .in('kind', ['day_complete', 'week_complete', 'plan_complete', 'streak', 'streak_freeze_used'])
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) throw error
  return data || []
}

export async function markMilestonesCelebrated(supabase, ids) {
  const clean = (ids || []).filter(Boolean)
  if (clean.length === 0) return 0
  const { data, error } = await supabase.rpc('mark_milestones_celebrated', { p_ids: clean })
  if (error) throw error
  return data
}

export async function hasMilestone(supabase, studentId, kind, periodKey) {
  const { data, error } = await supabase
    .from('student_milestones')
    .select('id')
    .eq('student_id', studentId)
    .eq('kind', kind)
    .eq('period_key', periodKey)
    .maybeSingle()
  if (error) throw error
  return !!data
}

// Actividad del plan (todas las fechas desde el inicio de la asignación),
// paginada: un plan largo supera las 1000 filas de PostgREST.
export async function fetchPlanActivity(supabase, { studentId, planId, fromDate }) {
  const [logs, blockLogs] = await Promise.all([
    fetchAllRows((from, to) => {
      let q = supabase
        .from('workout_logs')
        .select('id, logged_date, plan_exercise_id, completed, status')
        .eq('student_id', studentId)
        .eq('plan_id', planId)
      if (fromDate) q = q.gte('logged_date', fromDate)
      return q.order('logged_date').order('id').range(from, to)
    }),
    fetchAllRows((from, to) => {
      let q = supabase
        .from('workout_block_logs')
        .select('id, logged_date, plan_block_id, completed, status')
        .eq('student_id', studentId)
        .eq('plan_id', planId)
      if (fromDate) q = q.gte('logged_date', fromDate)
      return q.order('logged_date').order('id').range(from, to)
    }),
  ])
  return { logs, blockLogs }
}

// ── Mejores marcas (Etapa 4) ────────────────────────────────

// Registros hechos de la persona en un ejercicio de catálogo, ANTES de una
// fecha (cross-plan: la marca es de la persona, no del plan).
export async function fetchExerciseHistory(supabase, { studentId, exerciseId, beforeDate }) {
  return fetchAllRows((from, to) =>
    supabase
      .from('workout_logs')
      .select(
        'id, logged_date, completed, status, reps_unit, actual_weights_jsonb, actual_reps_jsonb, actual_weights, actual_reps, actual_weight, actual_sets'
      )
      .eq('student_id', studentId)
      .eq('exercise_id', exerciseId)
      .eq('completed', true)
      .lt('logged_date', beforeDate)
      .order('logged_date')
      .order('id')
      .range(from, to)
  )
}

// Logs cuyas marcas se anularon: no sirven de referencia.
export async function fetchVoidedBestLogIds(supabase, { studentId, exerciseId }) {
  let q = supabase
    .from('student_milestones')
    .select('workout_log_id')
    .eq('student_id', studentId)
    .eq('kind', 'personal_best')
    .not('voided_at', 'is', null)
  if (exerciseId) q = q.eq('exercise_id', exerciseId)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map((r) => r.workout_log_id).filter(Boolean)
}

export async function fetchBestForLog(supabase, { studentId, logId }) {
  const { data, error } = await supabase
    .from('student_milestones')
    .select('id, voided_at, payload')
    .eq('student_id', studentId)
    .eq('kind', 'personal_best')
    .eq('period_key', String(logId))
    .maybeSingle()
  if (error) throw error
  return data
}

// Marcas vigentes otorgadas desde `sinceIso` (para "una por día").
export async function countBestsSince(supabase, { studentId, sinceIso, excludeId }) {
  let q = supabase
    .from('student_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('kind', 'personal_best')
    .is('voided_at', null)
    .gte('created_at', sinceIso)
  if (excludeId) q = q.neq('id', excludeId)
  const { count, error } = await q
  if (error) throw error
  return count || 0
}

export async function voidPersonalBest(supabase, milestoneId, reason) {
  const { data, error } = await supabase.rpc('void_personal_best', {
    p_milestone_id: milestoneId,
    p_reason: reason ?? null,
  })
  if (error) throw error
  return data
}
