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

// Hitos que la persona todavía no vio (los cargó la coach, o se cortó la
// app antes de mostrarlos). Solo los que tienen pantalla.
export async function fetchPendingMilestones(supabase, studentId) {
  const { data, error } = await supabase
    .from('student_milestones')
    .select('id, kind, period_key, payload, created_by, created_at')
    .eq('student_id', studentId)
    .is('celebrated_at', null)
    .is('voided_at', null)
    .in('kind', ['day_complete', 'week_complete', 'plan_complete'])
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
