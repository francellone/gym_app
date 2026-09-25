// ============================================================
// streak.js — racha semanal de la persona (Etapa 5)
// ------------------------------------------------------------
// Decisiones de Franco (2026-09-24/25):
//   - semanas completas seguidas (lunes a domingo, días CERRADOS);
//   - semana sin asignación vigente = neutra (no suma ni corta); si el plan
//     venció por fecha pero la asignación sigue viva, la racha sigue;
//   - comodín: uno cada 4 semanas completas, máximo 1 guardado;
//   - reemplaza la racha de "días seguidos" del Inicio.
// La racha se calcula siempre desde el historial (cross-plan); en la base
// solo se guardan los hitos celebrados.
// ============================================================
import { fetchAllRows } from '@/lib/fetchAllRows'
import {
  buildWeekStatuses,
  closedSessionDates,
  computeWeeklyStreak,
  isoWeekKey,
} from './milestoneRules'
import { activeDaysOf, buildBlocksBySection } from './celebrationModel'

export const STREAK_WINDOW_WEEKS = 52

function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isTrainingAssignment(a) {
  return !a?.plan?.plan_type || a.plan.plan_type === 'training'
}

// Desde cuándo mirar: el primer plan de entrenamiento, con tope de un año.
export function streakWindowStart(assignments, today = new Date()) {
  const floor = new Date(today)
  floor.setDate(floor.getDate() - STREAK_WINDOW_WEEKS * 7)
  const starts = (assignments || [])
    .map((a) => a?.start_date)
    .filter(Boolean)
    .sort()
  const first = starts[0] ? new Date(`${starts[0]}T12:00:00`) : floor
  return ymd(first > floor ? first : floor)
}

// Fechas cerradas de TODOS los planes: cada registro se evalúa contra la
// estructura de su propio plan.
export function closedDatesAcrossPlans({ planExercises, planBlocks, logs, blockLogs }) {
  const byPlan = new Map()
  const slot = (id) => {
    if (!byPlan.has(id)) byPlan.set(id, { ex: [], bl: [], logs: [], blockLogs: [] })
    return byPlan.get(id)
  }
  for (const e of planExercises || []) if (e.plan_id) slot(e.plan_id).ex.push(e)
  for (const b of planBlocks || []) if (b.plan_id) slot(b.plan_id).bl.push(b)
  for (const l of logs || []) if (l.plan_id) slot(l.plan_id).logs.push(l)
  for (const b of blockLogs || []) if (b.plan_id) slot(b.plan_id).blockLogs.push(b)
  const all = new Set()
  for (const p of byPlan.values()) {
    if (p.logs.length === 0 && p.blockLogs.length === 0) continue
    const bbs = buildBlocksBySection(p.ex, p.bl)
    for (const d of closedSessionDates({
      activeDays: activeDaysOf(bbs),
      blocksBySection: bbs,
      logs: p.logs,
      blockLogs: p.blockLogs,
    })) {
      all.add(d)
    }
  }
  return [...all].sort()
}

// Estado de la racha a partir de asignaciones y fechas cerradas.
export function computeStreakState({ assignments, closedDates, today = new Date() }) {
  const training = (assignments || []).filter(isTrainingAssignment)
  const weeks = buildWeekStatuses({
    assignments: training,
    closedDates,
    fromDate: streakWindowStart(training, today),
    today,
  })
  const result = computeWeeklyStreak(weeks)
  const currentKey = isoWeekKey(today)
  const current = weeks.find((w) => w.weekKey === currentKey)
  const before = computeWeeklyStreak(weeks.filter((w) => w.weekKey !== currentKey))
  return {
    ...result,
    weeks,
    currentWeekComplete: current?.status === 'complete',
    freezeEarnedThisWeek: current?.status === 'complete' && result.freezes > before.freezes,
  }
}

// Lectura completa desde la base (paginada: un año de registros supera las
// 1000 filas de PostgREST).
export async function loadStreakState(supabase, studentId, today = new Date()) {
  const { data: assignments, error } = await supabase
    .from('plan_assignments')
    .select(
      'id, plan_id, start_date, closed_at, status, schedule_mode, preferred_days, expected_end_date, plan:plans!plan_id(id, plan_type, sessions_per_week)'
    )
    .eq('student_id', studentId)
  if (error) throw error
  const training = (assignments || []).filter(isTrainingAssignment)
  if (training.length === 0) return computeStreakState({ assignments: [], closedDates: [], today })
  const planIds = [...new Set(training.map((a) => a.plan_id).filter(Boolean))]
  const from = streakWindowStart(training, today)

  const [exRes, blRes, logs, blockLogs] = await Promise.all([
    supabase
      .from('plan_exercises')
      .select('id, plan_id, section, block_id, order_index')
      .in('plan_id', planIds),
    supabase
      .from('plan_blocks')
      .select('id, plan_id, section, block_type, order_index')
      .in('plan_id', planIds),
    fetchAllRows((a, b) =>
      supabase
        .from('workout_logs')
        .select('id, plan_id, logged_date, plan_exercise_id, completed, status')
        .eq('student_id', studentId)
        .in('plan_id', planIds)
        .gte('logged_date', from)
        .order('logged_date')
        .order('id')
        .range(a, b)
    ),
    fetchAllRows((a, b) =>
      supabase
        .from('workout_block_logs')
        .select('id, plan_id, logged_date, plan_block_id, completed, status')
        .eq('student_id', studentId)
        .in('plan_id', planIds)
        .gte('logged_date', from)
        .order('logged_date')
        .order('id')
        .range(a, b)
    ),
  ])
  if (exRes.error) throw exRes.error
  if (blRes.error) throw blRes.error
  const closedDates = closedDatesAcrossPlans({
    planExercises: exRes.data,
    planBlocks: blRes.data,
    logs,
    blockLogs,
  })
  return computeStreakState({ assignments: training, closedDates, today })
}
