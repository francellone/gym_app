// ============================================================
// wellbeingSummaryLogic.js
// ------------------------------------------------------------
// Lógica PURA para mostrarle al coach el wellbeing de sus alumnos
// FUERA de la pestaña Wellbeing (pedido de Franco 2026-08-27):
//   - Lista de Alumnos  → semáforo compacto por fila
//   - Panel del alumno  → promedios del período + último registro
//                         con tendencia + semáforo
//
// Sin Supabase, sin React: recibe filas crudas de `wellbeing_logs`
// y devuelve todo listo para pintar.
//
// Decisiones:
//   - Promedios y tendencia se calculan sobre el rango que pide el
//     consumidor (el período del dashboard, o los últimos N días en
//     la lista).
//   - El SEMÁFORO, en cambio, mira siempre los últimos
//     ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS días del rango, con los
//     MISMOS umbrales que las alertas de fatiga/estrés del dashboard
//     (features/dashboard/alerts.js). Así el color de acá y la alerta
//     de allá nunca se contradicen.
//   - La tendencia del último registro se compara contra el promedio
//     de los días PREVIOS del rango (no contra el promedio total, que
//     ya incluye al último dato y lo diluye).
//   - "Mejor/peor" respeta el signo de cada métrica: en estrés y
//     fatiga muscular, bajar es mejorar (WELLBEING_METRICS.positive).
// ============================================================

import { ALERT_THRESHOLDS } from '@/features/dashboard/alerts'
import { WELLBEING_METRICS } from './wellbeingMetrics'

export const WELLBEING_METRIC_KEYS = WELLBEING_METRICS.map((m) => m.key)

// Métricas que definen el semáforo (las mismas que disparan alertas).
export const RISK_METRIC_KEYS = ['energy_level', 'muscle_fatigue', 'stress_level']

// Cambio mínimo (en puntos de la escala 1–10) para llamarlo tendencia
// y no ruido.
export const TREND_MIN_DELTA = 0.5

// ── Estados del semáforo ────────────────────────────────────
export const WELLBEING_STATUS = {
  good: {
    key: 'good',
    label: 'Bien',
    emoji: '🟢',
    dotClass: 'bg-green-500',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
    textClass: 'text-green-700',
  },
  warn: {
    key: 'warn',
    label: 'Atención',
    emoji: '🟡',
    dotClass: 'bg-amber-400',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    textClass: 'text-amber-700',
  },
  bad: {
    key: 'bad',
    label: 'Alerta',
    emoji: '🔴',
    dotClass: 'bg-red-500',
    badgeClass: 'bg-red-50 text-red-700 border-red-200',
    textClass: 'text-red-700',
  },
  none: {
    key: 'none',
    label: 'Sin datos',
    emoji: '⚪',
    dotClass: 'bg-gray-300',
    badgeClass: 'bg-gray-50 text-gray-500 border-gray-200',
    textClass: 'text-gray-500',
  },
}

export function wellbeingStatusConfig(status) {
  return WELLBEING_STATUS[status] || WELLBEING_STATUS.none
}

// ── Helpers de fecha (YMD, sin timezone) ────────────────────
function parseYMD(s) {
  if (!s) return null
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function formatYMD(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date, n) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + n)
  return d
}

function diffInDays(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86400000)
}

// Las métricas van de 1 a 10; 0/null/undefined = sin cargar.
function isScore(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0
}

function average(nums) {
  if (!nums.length) return null
  return nums.reduce((acc, n) => acc + n, 0) / nums.length
}

function round1(n) {
  return n === null || n === undefined ? null : Math.round(n * 10) / 10
}

// ============================================================
// normalizeLogs
// ------------------------------------------------------------
// Ordena por fecha ascendente, descarta filas sin fecha y recorta al
// rango [from, to] (YMD inclusive; null = sin límite de ese lado).
// ============================================================
export function normalizeLogs(logs, { from = null, to = null } = {}) {
  return (logs || [])
    .filter((l) => l && l.date)
    .map((l) => ({ ...l, date: String(l.date).slice(0, 10) }))
    .filter((l) => (from ? l.date >= from : true) && (to ? l.date <= to : true))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// ============================================================
// computeWellbeingStatus
// ------------------------------------------------------------
// Semáforo con los umbrales de las alertas del dashboard, sobre los
// últimos WELLBEING_WINDOW_DAYS días del rango.
//
//   bad  → señal SOSTENIDA (>= FATIGUE_MIN_DAYS / LOW_MOTIVATION_MIN_DAYS
//          días malos): lo mismo que dispara la alerta del dashboard.
//   warn → al menos un día malo, sin llegar al mínimo de días.
//   good → hay registros y ninguno cruza umbral.
//   none → no hay registros en la ventana.
//
// Devuelve { status, reasons[], daysWithData }.
// ============================================================
export function computeWellbeingStatus(logs, { to = null, today = new Date() } = {}) {
  const end = to ? parseYMD(to) : startOfDay(today)
  if (!end) return { status: 'none', reasons: [], daysWithData: 0 }
  const start = addDays(end, -ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS)

  const inWindow = normalizeLogs(logs, { from: formatYMD(start), to: formatYMD(end) })
  if (!inWindow.length) return { status: 'none', reasons: [], daysWithData: 0 }

  let lowEnergyDays = 0
  let highFatigueDays = 0
  let highStressDays = 0
  for (const l of inWindow) {
    if (
      isScore(l.energy_level) &&
      Number(l.energy_level) <= ALERT_THRESHOLDS.LOW_ENERGY_THRESHOLD
    ) {
      lowEnergyDays += 1
    }
    if (Number(l.muscle_fatigue) >= ALERT_THRESHOLDS.HIGH_MUSCLE_FATIGUE_THRESHOLD) {
      highFatigueDays += 1
    }
    if (Number(l.stress_level) >= ALERT_THRESHOLDS.HIGH_STRESS_THRESHOLD) {
      highStressDays += 1
    }
  }

  const reasons = []
  let status = 'good'
  const dayWord = (n) => `${n} día${n === 1 ? '' : 's'}`

  const signals = [
    { days: lowEnergyDays, min: ALERT_THRESHOLDS.FATIGUE_MIN_DAYS, label: 'energía baja' },
    { days: highFatigueDays, min: ALERT_THRESHOLDS.FATIGUE_MIN_DAYS, label: 'fatiga alta' },
    { days: highStressDays, min: ALERT_THRESHOLDS.LOW_MOTIVATION_MIN_DAYS, label: 'estrés alto' },
  ]

  for (const s of signals) {
    if (s.days === 0) continue
    reasons.push(`${s.label} ${dayWord(s.days)}`)
    if (s.days >= s.min) status = 'bad'
    else if (status !== 'bad') status = 'warn'
  }

  return { status, reasons, daysWithData: inWindow.length }
}

// ============================================================
// computeWellbeingAverages
// ------------------------------------------------------------
// Promedio por métrica en el rango + cuántos registros lo sostienen.
// Devuelve { [metricKey]: { avg, count } } (avg null si no hay datos).
// ============================================================
export function computeWellbeingAverages(logs) {
  const rows = normalizeLogs(logs)
  const out = {}
  for (const key of WELLBEING_METRIC_KEYS) {
    const values = rows.map((l) => Number(l[key])).filter((n) => isScore(n))
    out[key] = { avg: round1(average(values)), count: values.length }
  }
  return out
}

// ============================================================
// computeLastEntryTrend
// ------------------------------------------------------------
// Último registro del rango + tendencia por métrica contra el
// promedio de los días previos (dentro del mismo rango).
//
// direction: 'better' | 'worse' | 'flat' | null (sin base de comparación)
// delta: cambio crudo (positivo = subió el número), 1 decimal.
// ============================================================
export function computeLastEntryTrend(logs, { today = new Date() } = {}) {
  const rows = normalizeLogs(logs)
  if (!rows.length) return null

  const last = rows[rows.length - 1]
  const previous = rows.slice(0, -1)

  const metrics = {}
  for (const metric of WELLBEING_METRICS) {
    const key = metric.key
    const value = isScore(last[key]) ? Number(last[key]) : null
    const base = average(previous.map((l) => Number(l[key])).filter((n) => isScore(n)))

    let direction = null
    let delta = null
    if (value !== null && base !== null) {
      delta = round1(value - base)
      if (Math.abs(delta) < TREND_MIN_DELTA) direction = 'flat'
      else if (delta > 0) direction = metric.positive ? 'better' : 'worse'
      else direction = metric.positive ? 'worse' : 'better'
    }
    metrics[key] = { value, base: round1(base), delta, direction }
  }

  return {
    date: last.date,
    daysAgo: Math.max(0, diffInDays(today, parseYMD(last.date))),
    source: last.source || 'student',
    notes: last.notes || null,
    metrics,
    previousCount: previous.length,
  }
}

// ============================================================
// computeWellbeingSummary
// ------------------------------------------------------------
// Lo que consumen las vistas: promedios del período + último registro
// con tendencia + semáforo, en un solo cálculo.
//
// Inputs:
//   logs   filas crudas de wellbeing_logs de UN alumno
//   from   YMD inicio del rango (opcional)
//   to     YMD fin del rango (opcional; default hoy)
//   today  para daysAgo (inyectable en tests)
// ============================================================
export function computeWellbeingSummary({ logs, from = null, to = null, today = new Date() } = {}) {
  const end = to || formatYMD(startOfDay(today))
  const rows = normalizeLogs(logs, { from, to: end })
  // OJO: el semáforo se calcula sobre TODOS los logs recibidos (no sobre
  // `rows`), porque su ventana son los últimos WELLBEING_WINDOW_DAYS días
  // hasta `to`. Si el período pedido es más corto que esa ventana (p. ej.
  // "esta semana"), el consumidor puede traer logs anteriores a `from` y el
  // semáforo los aprovecha sin ensuciar los promedios del período.
  const { status, reasons, daysWithData } = computeWellbeingStatus(logs, { to: end, today })

  return {
    hasData: rows.length > 0,
    entries: rows.length,
    averages: computeWellbeingAverages(rows),
    last: computeLastEntryTrend(rows, { today }),
    status,
    statusReasons: reasons,
    daysWithData,
    windowDays: ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS,
  }
}

// ============================================================
// summarizeByStudent
// ------------------------------------------------------------
// Versión bulk para la lista de Alumnos: agrupa por user_id y
// devuelve Map<studentId, summary>.
// ============================================================
export function summarizeByStudent(logs, { from = null, to = null, today = new Date() } = {}) {
  const byStudent = new Map()
  for (const l of logs || []) {
    if (!l?.user_id) continue
    if (!byStudent.has(l.user_id)) byStudent.set(l.user_id, [])
    byStudent.get(l.user_id).push(l)
  }
  const out = new Map()
  for (const [studentId, rows] of byStudent) {
    out.set(studentId, computeWellbeingSummary({ logs: rows, from, to, today }))
  }
  return out
}

// ============================================================
// describeLastEntry
// ------------------------------------------------------------
// "hoy" / "ayer" / "hace 5 días" — texto corto para el badge.
// ============================================================
export function describeLastEntry(daysAgo) {
  if (daysAgo === null || daysAgo === undefined) return 'sin registros'
  if (daysAgo <= 0) return 'hoy'
  if (daysAgo === 1) return 'ayer'
  return `hace ${daysAgo} días`
}
