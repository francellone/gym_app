// ============================================================
// dashboardPeriods.js
// ------------------------------------------------------------
// Lógica PURA y testeable de períodos del CoachDashboard.
// Sin Supabase, sin React.
//
// Un periodKey describe el rango temporal con el que se filtra
// el dashboard. Acompaña a (studentId, planId) en
// useCoachDashboardFilters.
//
// Decisión 2026-05-23 (Franco, doc 19 D2):
//   - 'vigente'   → desde start_date del plan seleccionado hasta hoy
//                   (fallback a '30d' si no hay plan seleccionado)
//   - 'Nd'        → últimos N días terminando hoy
//   - 'all'       → sin filtro (start = 2000-01-01)
// ============================================================

export const PERIOD_OPTIONS = [
  { key: 'vigente', label: 'Plan vigente' },
  { key: '7d', label: 'Últimos 7 días' },
  { key: '14d', label: 'Últimos 14 días' },
  { key: '30d', label: 'Últimos 30 días' },
  { key: '90d', label: 'Últimos 90 días' },
  { key: 'all', label: 'Histórico completo' },
]

export const DEFAULT_PERIOD_WITH_PLAN = 'vigente'
export const DEFAULT_PERIOD_NO_PLAN = '30d'
export const FALLBACK_START = '2000-01-01'

function toYMD(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function subDays(date, n) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

// ============================================================
// computePeriodRange
// ------------------------------------------------------------
// Resuelve un periodKey a { start, end } en YMD.
//
// Inputs:
//   periodKey      string  ('vigente' | '7d' | '14d' | '30d' | '90d' | 'all')
//   planAssignment object opcional con { start_date }
//   today          Date    referencia (default new Date())
//
// Output:
//   { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
//
// Comportamiento:
//   - 'vigente' sin planAssignment → cae a DEFAULT_PERIOD_NO_PLAN ('30d')
//   - periodKey desconocido → cae a DEFAULT_PERIOD_NO_PLAN
// ============================================================
export function computePeriodRange({ periodKey, planAssignment, today = new Date() } = {}) {
  const endYMD = toYMD(today)

  if (periodKey === 'all') {
    return { start: FALLBACK_START, end: endYMD }
  }

  if (periodKey === 'vigente') {
    const start = planAssignment?.start_date
    if (start) return { start: String(start).slice(0, 10), end: endYMD }
    // Sin plan → fallback a '30d'
    return computePeriodRange({ periodKey: DEFAULT_PERIOD_NO_PLAN, today })
  }

  const match = /^(\d+)d$/.exec(periodKey || '')
  if (match) {
    const n = Number(match[1])
    return { start: toYMD(subDays(today, n - 1)), end: endYMD }
  }

  // Periodkey desconocido → fallback seguro
  return computePeriodRange({ periodKey: DEFAULT_PERIOD_NO_PLAN, today })
}

// ============================================================
// resolveDefaultPeriod
// ------------------------------------------------------------
// Para autoseleccionar periodKey cuando el coach no eligió uno:
//   - si hay plan activo de training del alumno seleccionado → 'vigente'
//   - sino → '30d'
// ============================================================
export function resolveDefaultPeriod({ hasActivePlan } = {}) {
  return hasActivePlan ? DEFAULT_PERIOD_WITH_PLAN : DEFAULT_PERIOD_NO_PLAN
}

// ============================================================
// findPeriodLabel
// ------------------------------------------------------------
// Helper de UI para mostrar el label de un periodKey.
// ============================================================
export function findPeriodLabel(periodKey) {
  return PERIOD_OPTIONS.find((p) => p.key === periodKey)?.label || PERIOD_OPTIONS[3].label
}
