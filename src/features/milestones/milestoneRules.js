// ============================================================
// milestoneRules.js — cuándo hay un hito (día, semana, plan, marca, racha)
// ------------------------------------------------------------
// Etapa 2 del plan de celebraciones (doc del proyecto
// `claude/plan-celebraciones-hitos.md`, decisiones de Franco 2026-09-24).
//
// Funciones puras, sin React ni Supabase. Detectan CANDIDATOS a hito; la
// base (award_milestone, v55) garantiza que cada uno exista una sola vez y
// el front celebra solo si la RPC responde is_new.
//
// Reglas que salen de acá y de ningún otro lado:
//   - Día: se detecta la TRANSICIÓN a 'complete' (no al cargar un día que
//     ya estaba completo). Un día 'partial' no es hito: se reconoce en la
//     pantalla pero no se persiste ni se avisa (la coach se queda con
//     "registró actividad", que es verdad).
//   - Semana: cuentan los días CERRADOS (complete o partial, decisión v54),
//     no "cualquier registro". Transición a completa.
//   - Plan: criterio combinado. Se celebra al completar la semana que
//     contiene expected_end_date, o al abrir la app después de esa fecha,
//     con un tono según la adherencia del plan.
//   - Marca: supera estrictamente el máximo previo, con mínimo 3 registros
//     previos. Peso si el registro lleva peso; si no, reps. Los logs de
//     marcas anuladas no cuentan como referencia.
//   - Aviso al cargar: el valor supera en más del 100% al máximo previo
//     (también con mínimo 3 previos). Avisa, nunca bloquea.
//   - Racha: semanas completas seguidas; semana sin asignación = neutra;
//     semana en curso no juzga; comodín cada 4 semanas completas, máximo 1.
// ============================================================

import { computeWeekAdherence, startOfWeekMonday } from '@/features/plans/assignmentHelpers'
import { isWeekComplete, computeDayStateMap } from '@/features/workouts/sessionProgress'
import { isDayStateClosed, isLogDone } from '@/features/workouts/completionRules'
import { maxWeightOfLog } from '@/features/plans/helpers'
import { repsMaxOfLog } from '@/features/progress/progression'

// ── Constantes de producto (ajustables sin tocar la lógica) ────
export const MIN_PREVIOUS_FOR_BEST = 3
export const OUTLIER_RATIO = 2 // "más del 100%" por encima del máximo previo
export const WEEKS_PER_FREEZE = 4
export const MAX_FREEZES = 1
// Rachas que se celebran: 2, 4, 8 y de ahí cada 4 semanas.
export const STREAK_CELEBRATIONS = [2, 4, 8]
export const STREAK_CELEBRATION_STEP = 4
// Tono del cierre de plan según la adherencia (sesiones cerradas / previstas).
export const PLAN_TONE_THRESHOLDS = { strong: 0.9, good: 0.6 }

// ============================================================
// Fechas y claves de período (mismo formato que los CHECK de v55)
// ============================================================

function ymd(value) {
  if (!value) return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function parseYMD(value) {
  const s = ymd(value)
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dayKey(value) {
  return ymd(value)
}

// Semana ISO 'IYYY-Www', igual que to_char(..., 'IYYY-"W"IW') en Postgres.
// Ojo: el año ISO puede no ser el calendario (2027-01-01 es 2026-W53).
export function isoWeekKey(value) {
  const s = ymd(value)
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = (date.getUTCDay() + 6) % 7 // lunes = 0
  date.setUTCDate(date.getUTCDate() - dow + 3) // jueves de esa semana
  const isoYear = date.getUTCFullYear()
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4Dow = (jan4.getUTCDay() + 6) % 7
  const week1Thursday = new Date(Date.UTC(isoYear, 0, 4 - jan4Dow + 3))
  const week = 1 + Math.round((date - week1Thursday) / (7 * 86400000))
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

// La racha lleva la semana en que empezó: si se corta y vuelve a llegar
// a 2, es OTRA racha y se celebra de nuevo (v55c).
export function streakKey(startWeek, n) {
  return `streak-${startWeek}-${n}`
}

// ============================================================
// Día
// ============================================================

// Nivel de celebración del día a partir de su estado (completionRules).
export function dayCelebrationLevel(state) {
  if (state === 'complete') return 'day_complete'
  if (state === 'partial') return 'day_partial'
  return null
}

// Hito de día: solo en la transición a 'complete'.
export function detectDayMilestone({ prevState, nextState, date, dayId } = {}) {
  const key = dayKey(date)
  if (!key || nextState !== 'complete' || prevState === 'complete') return null
  return { kind: 'day_complete', periodKey: key, payload: { day_id: dayId ?? null } }
}

// ============================================================
// Fechas con sesión CERRADA (complete o partial)
// ------------------------------------------------------------
// logs / blockLogs: arrays con logged_date + plan_exercise_id /
// plan_block_id. Se agrupan por fecha y se evalúa cada día del plan con
// computeDayStateMap: la fecha cuenta si algún día quedó cerrado.
// ============================================================
export function closedSessionDates({ activeDays, blocksBySection, logs, blockLogs } = {}) {
  const byDate = new Map()
  const slot = (date) => {
    if (!byDate.has(date)) byDate.set(date, { logs: {}, blockLogs: {} })
    return byDate.get(date)
  }
  for (const l of logs || []) {
    const date = ymd(l?.logged_date)
    if (date && l.plan_exercise_id) slot(date).logs[l.plan_exercise_id] = l
  }
  for (const b of blockLogs || []) {
    const date = ymd(b?.logged_date)
    if (date && b.plan_block_id) slot(date).blockLogs[b.plan_block_id] = b
  }
  const out = []
  for (const [date, maps] of byDate) {
    const states = computeDayStateMap({
      activeDays,
      blocksBySection,
      logs: maps.logs,
      blockLogs: maps.blockLogs,
    })
    if (Object.values(states).some(isDayStateClosed)) out.push(date)
  }
  return out.sort()
}

// ============================================================
// Semana
// ============================================================

// Hito de semana: transición de incompleta a completa, con las fechas
// cerradas de antes y de después del guardado.
export function detectWeekMilestone({ assignment, prevDates, nextDates, date, today } = {}) {
  const anchor = parseYMD(date)
  if (!assignment || !anchor) return null
  const now = today || new Date()
  const before = computeWeekAdherence(assignment, prevDates || [], anchor, now)
  const after = computeWeekAdherence(assignment, nextDates || [], anchor, now)
  if (isWeekComplete(before) || !isWeekComplete(after)) return null
  return {
    kind: 'week_complete',
    periodKey: isoWeekKey(anchor),
    assignmentId: assignment.id ?? null,
    payload: {
      expected: after.expectedCount,
      completed: after.completedCount,
      week_start: ymd(after.weekStart),
    },
  }
}

// ============================================================
// Plan
// ============================================================

// Adherencia del plan: sesiones cerradas dentro de la vigencia / previstas.
// Previstas = sesiones por semana × semanas entre start_date y
// expected_end_date (redondeando hacia arriba).
export function planAdherence({ assignment, closedDates } = {}) {
  const start = parseYMD(assignment?.start_date)
  const end = parseYMD(assignment?.expected_end_date)
  const perWeek = Number(assignment?.plan?.sessions_per_week ?? assignment?.sessions_per_week ?? 0)
  if (!start || !end || !(perWeek > 0) || end < start) return null
  const days = Math.round((end - start) / 86400000) + 1
  const weeks = Math.ceil(days / 7)
  const expected = perWeek * weeks
  const closed = (closedDates || []).filter((d) => {
    const dd = parseYMD(d)
    return dd && dd >= start && dd <= end
  }).length
  return { expected, closed, ratio: expected > 0 ? Math.min(1, closed / expected) : 0 }
}

export function planTone(ratio) {
  if (ratio >= PLAN_TONE_THRESHOLDS.strong) return 'strong'
  if (ratio >= PLAN_TONE_THRESHOLDS.good) return 'good'
  return 'gentle'
}

// Hito de plan (criterio combinado):
//   a) weekMilestone es el de la semana que contiene expected_end_date → ya.
//   b) hoy es posterior a expected_end_date → al abrir la app.
// Solo asignaciones vivas: un plan reemplazado o cerrado antes de tiempo
// no se celebra como terminado.
export function detectPlanMilestone({ assignment, closedDates, today, weekMilestone } = {}) {
  const end = parseYMD(assignment?.expected_end_date)
  if (!assignment?.id || !end) return null
  if (assignment.closed_at && parseYMD(assignment.closed_at) < end) return null
  if (assignment.status && !['active', 'completed'].includes(assignment.status)) return null

  const now = parseYMD(today || new Date())
  const lastWeek = isoWeekKey(end)
  const closedLastWeek =
    weekMilestone?.kind === 'week_complete' && weekMilestone.periodKey === lastWeek
  const expired = now > end
  if (!closedLastWeek && !expired) return null

  const adh = planAdherence({ assignment, closedDates })
  return {
    kind: 'plan_complete',
    periodKey: String(assignment.id),
    assignmentId: assignment.id,
    payload: {
      trigger: closedLastWeek ? 'last_week' : 'expired',
      sessions_closed: adh?.closed ?? null,
      sessions_expected: adh?.expected ?? null,
      adherence: adh ? Math.round(adh.ratio * 100) / 100 : null,
      tone: adh ? planTone(adh.ratio) : 'good',
    },
  }
}

// ============================================================
// Mejores marcas
// ============================================================

// Métrica de un registro: peso si lleva peso; si no, reps o segundos según
// la unidad. Pasos y respiraciones no compiten por marca (no es un logro
// hacer más respiraciones que la vez pasada).
export function bestMetricOf(log) {
  const w = maxWeightOfLog(log)
  if (w > 0) return { metric: 'weight', value: w }
  const unit = log?.reps_unit || 'reps'
  const metric = unit === 'segundos' ? 'seconds' : unit === 'reps' ? 'reps' : null
  if (!metric) return null
  const r = repsMaxOfLog(log)
  if (r > 0) return { metric, value: r }
  return null
}

// Referencia previa en la misma métrica: registros hechos, del mismo
// ejercicio, distintos del actual y no anulados.
export function previousBestReference({ log, history, voidedLogIds, metric } = {}) {
  const voided = new Set(voidedLogIds || [])
  const values = []
  let sawOtherMetric = false
  for (const h of history || []) {
    if (!h || h.id === log?.id || voided.has(h.id) || !isLogDone(h)) continue
    const m = bestMetricOf(h)
    if (!m) continue
    if (m.metric !== metric) {
      sawOtherMetric = true
      continue
    }
    values.push(m.value)
  }
  return {
    count: values.length,
    max: values.length > 0 ? Math.max(...values) : null,
    sawOtherMetric,
  }
}

// ¿Este registro es mejor marca? Devuelve el candidato o null.
export function detectPersonalBest({
  log,
  history,
  voidedLogIds,
  minPrevious = MIN_PREVIOUS_FOR_BEST,
} = {}) {
  if (!log?.id || !isLogDone(log)) return null
  const current = bestMetricOf(log)
  if (!current) return null
  const ref = previousBestReference({ log, history, voidedLogIds, metric: current.metric })
  // Sin peso contra una historia con peso (u otra unidad): no comparable.
  if (current.metric !== 'weight' && ref.sawOtherMetric) return null
  if (ref.count < minPrevious || ref.max == null || !(current.value > ref.max)) return null
  return {
    kind: 'personal_best',
    periodKey: String(log.id),
    workoutLogId: log.id,
    payload: {
      metric: current.metric,
      value: current.value,
      previous_max: ref.max,
      previous_count: ref.count,
    },
  }
}

// Una celebración de marcas por día: solo la primera marca nueva del día
// se muestra; las siguientes suman al contador del día sin interrumpir.
export function bestCelebrationMode({ bestsAlreadyToday = 0 } = {}) {
  return bestsAlreadyToday > 0 ? 'silent' : 'toast'
}

// Aviso al cargar: ¿el valor se aleja más del 100% del máximo previo?
export function checkOutlierValue({
  value,
  metric,
  history,
  voidedLogIds,
  logId,
  minPrevious = MIN_PREVIOUS_FOR_BEST,
  ratio = OUTLIER_RATIO,
} = {}) {
  const v = parseFloat(value)
  if (!(v > 0) || !metric) return { warn: false }
  const ref = previousBestReference({
    log: { id: logId },
    history,
    voidedLogIds,
    metric,
  })
  if (ref.count < minPrevious || ref.max == null) return { warn: false }
  return v > ref.max * ratio ? { warn: true, previousMax: ref.max } : { warn: false }
}

// ============================================================
// Racha semanal
// ============================================================

// Estado de cada semana entre fromDate y today para la racha.
//   complete   → isWeekComplete con las fechas cerradas
//   neutral    → ninguna asignación vigente esa semana (o sin expectativa)
//   current    → semana en curso sin completar: no juzga todavía
//   incomplete → semana terminada sin completar
// Si varias asignaciones tocan la semana, gana la que la completa.
export function buildWeekStatuses({ assignments, closedDates, fromDate, today } = {}) {
  const now = today || new Date()
  const start = startOfWeekMonday(parseYMD(fromDate) || now)
  const currentWeek = isoWeekKey(now)
  const out = []
  for (let w = new Date(start); w <= now; w.setDate(w.getDate() + 7)) {
    const key = isoWeekKey(w)
    let status = 'neutral'
    for (const a of assignments || []) {
      const adh = computeWeekAdherence(a, closedDates || [], w, now)
      if (adh.mode === 'inactive' || !(adh.expectedCount > 0)) continue
      if (isWeekComplete(adh)) {
        status = 'complete'
        break
      }
      status = key === currentWeek ? 'current' : 'incomplete'
    }
    out.push({ weekKey: key, status })
  }
  return out
}

// Recorre las semanas en orden y devuelve la racha vigente, los comodines
// guardados y en qué semanas se usó un comodín.
export function computeWeeklyStreak(
  weeks,
  { weeksPerFreeze = WEEKS_PER_FREEZE, maxFreezes = MAX_FREEZES } = {}
) {
  let streak = 0
  let startWeek = null
  let freezes = 0
  let progress = 0 // semanas completas hacia el próximo comodín
  const freezeUsedWeeks = []
  for (const { weekKey, status } of weeks || []) {
    if (status === 'complete') {
      if (streak === 0) startWeek = weekKey
      streak += 1
      if (freezes < maxFreezes) {
        progress += 1
        if (progress >= weeksPerFreeze) {
          freezes += 1
          progress = 0
        }
      }
    } else if (status === 'incomplete') {
      if (freezes > 0 && streak > 0) {
        freezes -= 1
        freezeUsedWeeks.push(weekKey)
      } else {
        streak = 0
        startWeek = null
        progress = 0
      }
    }
    // neutral y current: no suman ni cortan
  }
  return { streak, startWeek, freezes, progress, freezeUsedWeeks }
}

export function isStreakCelebration(n) {
  if (!(n > 0)) return false
  if (STREAK_CELEBRATIONS.includes(n)) return true
  const last = STREAK_CELEBRATIONS[STREAK_CELEBRATIONS.length - 1]
  return n > last && (n - last) % STREAK_CELEBRATION_STEP === 0
}

// Candidatos de racha: el número alcanzado (si se celebra) y el comodín
// usado en la última semana juzgada (si hubo).
export function detectStreakMilestones(streakResult, weeks) {
  const out = []
  const { streak, startWeek, freezeUsedWeeks } = streakResult || {}
  if (isStreakCelebration(streak) && startWeek) {
    out.push({
      kind: 'streak',
      periodKey: streakKey(startWeek, streak),
      payload: { weeks: streak, start_week: startWeek },
    })
  }
  const judged = (weeks || []).filter((w) => w.status === 'complete' || w.status === 'incomplete')
  const lastJudged = judged[judged.length - 1]?.weekKey
  if (lastJudged && (freezeUsedWeeks || []).includes(lastJudged)) {
    out.push({
      kind: 'streak_freeze_used',
      periodKey: lastJudged,
      payload: { streak },
    })
  }
  return out
}

// ============================================================
// Candidato → argumentos de award_milestone (v55)
// ============================================================
export function toAwardArgs(studentId, candidate) {
  return {
    p_student_id: studentId,
    p_kind: candidate.kind,
    p_period_key: candidate.periodKey,
    p_payload: candidate.payload ?? {},
    p_assignment_id: candidate.assignmentId ?? null,
    p_workout_log_id: candidate.workoutLogId ?? null,
  }
}

// ============================================================
// Referencias de marca por ejercicio (Etapa 4)
// ------------------------------------------------------------
// Para el aviso al cargar: la pantalla ya tiene los registros recientes
// de la persona (cross-plan). Arma por exercise_id el máximo y la cantidad
// de registros previos en cada métrica. Excluye omitidos y logs de marcas
// anuladas. `exerciseIdOf` permite leer el id de catálogo según la forma
// de la fila (embebido o columna).
// ============================================================
export function buildBestReferences(logs, { voidedLogIds, exerciseIdOf } = {}) {
  const voided = new Set(voidedLogIds || [])
  const getEx = exerciseIdOf || ((l) => l?.exercise_id ?? l?.plan_exercise?.exercise_id ?? null)
  const refs = new Map()
  for (const l of logs || []) {
    if (!l || voided.has(l.id) || !isLogDone(l)) continue
    const exId = getEx(l)
    if (!exId) continue
    const m = bestMetricOf(l)
    if (!m) continue
    if (!refs.has(exId)) {
      refs.set(exId, {
        weight: { count: 0, max: null },
        reps: { count: 0, max: null },
        seconds: { count: 0, max: null },
      })
    }
    const r = refs.get(exId)[m.metric]
    r.count += 1
    r.max = r.max == null ? m.value : Math.max(r.max, m.value)
  }
  return refs
}

// Aviso al cargar contra una referencia ya armada ({count, max}).
export function outlierFromReference({
  value,
  reference,
  minPrevious = MIN_PREVIOUS_FOR_BEST,
  ratio = OUTLIER_RATIO,
} = {}) {
  const v = parseFloat(value)
  if (!(v > 0) || !reference || reference.count < minPrevious || reference.max == null) {
    return { warn: false }
  }
  return v > reference.max * ratio ? { warn: true, previousMax: reference.max } : { warn: false }
}
