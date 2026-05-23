// ============================================================
// studentPanelLogic.js
// ------------------------------------------------------------
// Lógica PURA del "Panel del alumno" del CoachDashboard (Fase C.2).
// Sin Supabase, sin React. Computa KPIs + datos para el donut +
// mensaje motivacional, a partir de:
//   - plan_assignment seleccionado
//   - plan_exercises del plan
//   - workout_logs en la ventana del período
//   - expected dates calculadas afuera (via getExpectedSessionDates)
//
// Decisiones (doc 19 Opción C):
//   - El donut se agrupa por section (day_a..day_d) — único "tipo"
//     disponible hoy. Cuando llegue multi-tipo (plan 18 Fase 2)
//     se cambia el keyFn sin tocar el caller.
//   - % adherencia = días con al menos 1 log completed=true / días
//     esperados en la ventana. Si no hay días esperados, retorna null
//     y la UI muestra "—".
//   - Mensaje motivacional: 4 buckets simples. NO usa NLP — el
//     análisis de notas se reserva para Fase C.5 (alerta motivación).
// ============================================================

const SECTION_LABELS = {
  day_a: 'Día A',
  day_b: 'Día B',
  day_c: 'Día C',
  day_d: 'Día D',
}

const SECTION_COLORS = {
  day_a: '#7c3aed', // primary-600
  day_b: '#22c55e', // green-500
  day_c: '#f59e0b', // amber-500
  day_d: '#0ea5e9', // sky-500
}

// ============================================================
// computeDonutData
// ------------------------------------------------------------
// Agrupa los logs por section (día A/B/C/D) y cuenta fechas distintas
// con al menos 1 log completed=true. Sirve para el donut "cuántas
// veces hiciste cada día en el período".
//
// Inputs:
//   logs            [{ logged_date, plan_exercise_id, completed }]
//   planExercises   [{ id, section }]
//
// Output:
//   [{ key, label, value, color }]  ordenado por A..D
// ============================================================
export function computeDonutData({ logs, planExercises } = {}) {
  const exToSection = new Map()
  for (const pe of planExercises || []) {
    if (!pe?.section?.startsWith('day_')) continue
    exToSection.set(pe.id, pe.section)
  }

  const datesBySection = new Map() // section → Set<YMD>
  for (const log of logs || []) {
    if (!log?.completed) continue
    const section = exToSection.get(log.plan_exercise_id)
    if (!section) continue
    const date = String(log.logged_date || '').slice(0, 10)
    if (!date) continue
    if (!datesBySection.has(section)) datesBySection.set(section, new Set())
    datesBySection.get(section).add(date)
  }

  const out = []
  for (const section of Object.keys(SECTION_LABELS)) {
    const dates = datesBySection.get(section)
    const count = dates ? dates.size : 0
    if (count === 0) continue
    out.push({
      key: section,
      label: SECTION_LABELS[section],
      value: count,
      color: SECTION_COLORS[section],
    })
  }
  return out
}

// ============================================================
// computeCompletedDays
// ------------------------------------------------------------
// Cantidad de fechas distintas con al menos 1 log completed=true
// en la ventana del período (ya filtrado por el caller).
//
// Inputs:
//   logs  [{ logged_date, completed }]
//
// Output:
//   number
// ============================================================
export function computeCompletedDays(logs) {
  const dates = new Set()
  for (const l of logs || []) {
    if (!l?.completed) continue
    const d = String(l.logged_date || '').slice(0, 10)
    if (d) dates.add(d)
  }
  return dates.size
}

// ============================================================
// computeAveragePSE
// ------------------------------------------------------------
// Promedio de perceived_difficulty en logs con valor numérico válido.
// Retorna null si no hay ninguno.
// ============================================================
export function computeAveragePSE(logs) {
  let sum = 0
  let count = 0
  for (const l of logs || []) {
    const pd = Number(l?.perceived_difficulty)
    if (!Number.isFinite(pd) || pd <= 0) continue
    sum += pd
    count += 1
  }
  if (count === 0) return null
  return Math.round((sum / count) * 10) / 10
}

// ============================================================
// computeExpectedDaysInWindow
// ------------------------------------------------------------
// Cantidad de sesiones esperadas en un período dado para una
// asignación. Soporta ambos schedule_modes:
//
//   - 'fixed': el caller debe pasar `fixedExpectedDates` (calculado
//              fuera con getExpectedSessionDates(assignment, start, end))
//              y este helper devuelve su longitud. Si no se pasa,
//              cae a 0.
//   - 'flexible': se computa pro-rata como
//                 round((days_window / 7) * sessions_per_week).
//                 Sin sessions_per_week → 0.
//
// Inputs:
//   assignment           plan_assignment con { schedule_mode, plan: { sessions_per_week } }
//   periodRange          { start, end } YMD
//   fixedExpectedDates   array opcional (para fixed)
//
// Output:
//   number (>= 0)
// ============================================================
export function computeExpectedDaysInWindow({
  assignment,
  periodRange,
  fixedExpectedDates = null,
} = {}) {
  if (!assignment || !periodRange?.start || !periodRange?.end) return 0
  const mode = assignment.schedule_mode || 'fixed'

  if (mode === 'fixed') {
    if (Array.isArray(fixedExpectedDates)) return fixedExpectedDates.length
    return 0
  }

  if (mode === 'flexible') {
    const start = new Date(periodRange.start)
    const end = new Date(periodRange.end)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
    const ms = end.getTime() - start.getTime()
    const days = Math.max(1, Math.round(ms / 86400000) + 1)
    const spw = Number(
      assignment.plan?.sessions_per_week ?? assignment.sessions_per_week ?? 0
    )
    if (!spw) return 0
    return Math.round((days / 7) * spw)
  }

  return 0
}

// ============================================================
// computeExerciseProgress
// ------------------------------------------------------------
// Por ejercicio: compara max(actual_weight) en la primera mitad
// de la ventana vs la segunda mitad. Devuelve delta + status.
//
// Inputs:
//   logs         [{ logged_date, actual_weight, plan_exercise: { exercise: { id, name } } }]
//   periodRange  { start, end } YMD
//   minLogs      número mínimo de logs por ejercicio (default 3)
//
// Output:
//   [{
//     exerciseId, exerciseName,
//     firstMax, secondMax, delta,
//     status: 'up' | 'flat' | 'down' | 'insufficient',
//     logsCount
//   }]
//   Ordenado: up → flat → down → insufficient. Tie-break: más logs primero.
// ============================================================
export function computeExerciseProgress({ logs, periodRange, minLogs = 3 } = {}) {
  if (!logs || !logs.length || !periodRange?.start || !periodRange?.end) return []
  const startD = new Date(periodRange.start)
  const endD = new Date(periodRange.end)
  if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return []
  const midpoint = new Date((startD.getTime() + endD.getTime()) / 2)

  // exId → { exerciseName, firstMax, secondMax, count }
  const byEx = new Map()
  for (const log of logs) {
    const w = Number(log.actual_weight)
    if (!Number.isFinite(w) || w <= 0) continue
    const exId = log.plan_exercise?.exercise?.id
    const exName = log.plan_exercise?.exercise?.name
    if (!exId) continue
    const d = new Date(log.logged_date)
    if (isNaN(d.getTime()) || d < startD || d > endD) continue

    const prev = byEx.get(exId) || {
      exerciseName: exName || 'Ejercicio',
      firstMax: 0,
      secondMax: 0,
      count: 0,
    }
    prev.count += 1
    if (d < midpoint) {
      if (w > prev.firstMax) prev.firstMax = w
    } else {
      if (w > prev.secondMax) prev.secondMax = w
    }
    byEx.set(exId, prev)
  }

  const out = []
  for (const [exId, stats] of byEx) {
    if (stats.count < minLogs) continue
    let status
    let delta
    if (stats.firstMax === 0 || stats.secondMax === 0) {
      status = 'insufficient'
      delta = null
    } else {
      delta = stats.secondMax - stats.firstMax
      if (delta > 0) status = 'up'
      else if (delta < 0) status = 'down'
      else status = 'flat'
    }
    out.push({
      exerciseId: exId,
      exerciseName: stats.exerciseName,
      firstMax: stats.firstMax || null,
      secondMax: stats.secondMax || null,
      delta,
      status,
      logsCount: stats.count,
    })
  }

  const order = { up: 0, flat: 1, down: 2, insufficient: 3 }
  out.sort((a, b) => order[a.status] - order[b.status] || b.logsCount - a.logsCount)
  return out
}

// ============================================================
// computeAdherencePct
// ------------------------------------------------------------
// % de cumplimiento = completedDays / expectedDays * 100, capped a 200%.
// Si expectedDays = 0, retorna null (UI muestra "—").
// ============================================================
export function computeAdherencePct({ completedDays, expectedDays }) {
  if (!expectedDays || expectedDays === 0) return null
  const pct = (completedDays / expectedDays) * 100
  return Math.min(200, Math.round(pct))
}

// ============================================================
// motivationalMessage
// ------------------------------------------------------------
// Texto humano según el % de adherencia del alumno en la ventana.
// 4 buckets. Sin NLP — el análisis de notas vive en Fase C.5.
//
// Inputs:
//   completedDays  number
//   expectedDays   number | null
//
// Output:
//   { tone: 'great'|'good'|'meh'|'bad'|'empty', text }
// ============================================================
export function buildMotivationalMessage({ completedDays, expectedDays }) {
  if (completedDays === 0) {
    return {
      tone: 'empty',
      text: 'Sin entrenos registrados en el período seleccionado.',
    }
  }
  const pct = computeAdherencePct({ completedDays, expectedDays })
  if (pct === null) {
    return {
      tone: 'good',
      text: `Completó ${completedDays} entreno${completedDays === 1 ? '' : 's'} en el período.`,
    }
  }
  if (pct >= 90) {
    return {
      tone: 'great',
      text: `Excelente adherencia (${pct}%). La constancia está pagando.`,
    }
  }
  if (pct >= 60) {
    return {
      tone: 'good',
      text: `Buena constancia (${pct}%). Hay margen para subir.`,
    }
  }
  if (pct >= 30) {
    return {
      tone: 'meh',
      text: `Adherencia parcial (${pct}%). Conviene revisar barreras del alumno.`,
    }
  }
  return {
    tone: 'bad',
    text: `Adherencia baja (${pct}%). Es buen momento para conversar con el alumno.`,
  }
}
