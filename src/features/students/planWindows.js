// ─────────────────────────────────────────────────────────────
// Ventanas de plan dentro de un período
//
// La pestaña Progreso muestra un rango de fechas que puede abarcar VARIOS
// planes (el vigente y los anteriores). Estas funciones responden, a partir
// de los registros que ya están en memoria:
//   · qué planes tocó el alumno en el período y entre qué fechas
//   · en qué fechas arranca un plan nuevo (los "cortes" que se dibujan)
//
// Se derivan de los propios registros y no de plan_assignments a propósito:
// las asignaciones no tienen fecha de fin, y lo que importa acá es cuándo
// la persona efectivamente entrenó con cada plan.
// ─────────────────────────────────────────────────────────────

export const NO_PLAN = '__sin_plan__'

/**
 * Ventana de fechas por plan, ordenada por fecha de inicio.
 * @param {Array<{plan_id?: string|null, logged_date?: string|null}>} logs
 * @returns {Array<{planId: string, from: string, to: string, count: number}>}
 */
export function planWindowsFromLogs(logs = []) {
  const map = new Map()
  for (const log of logs) {
    const date = log?.logged_date
    if (!date) continue
    const planId = log.plan_id || NO_PLAN
    const win = map.get(planId)
    if (!win) {
      map.set(planId, { planId, from: date, to: date, count: 1 })
      continue
    }
    if (date < win.from) win.from = date
    if (date > win.to) win.to = date
    win.count += 1
  }
  return [...map.values()].sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1
    return a.planId < b.planId ? -1 : 1
  })
}

/**
 * Fecha en la que arranca cada plan del período, el primero incluido. Cada una
 * es una marca a dibujar: sirve tanto para separar dos planes como para decir
 * "acá empieza este plan" cuando en el período hay uno solo visible.
 * Los registros sin plan (datos viejos que perdieron el vínculo) no cuentan
 * como plan y no generan marca.
 * @returns {Array<{date: string, planId: string}>} ascendente, sin repetir fecha
 */
export function planStartMarks(windows = []) {
  const real = windows.filter((w) => w.planId !== NO_PLAN)
  const out = []
  for (const w of real) {
    if (out.some((m) => m.date === w.from)) continue
    out.push({ date: w.from, planId: w.planId })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Ventanas que corresponden a un plan de verdad. */
export function realPlanWindows(windows = []) {
  return windows.filter((w) => w.planId !== NO_PLAN)
}

/**
 * Dónde cae cada marca en la grilla de fechas visible. Si la fecha exacta no
 * está (porque se recortó la cantidad de sesiones que se muestran), la marca
 * cae en la primera fecha posterior; si el plan arranca antes de la primera
 * columna visible, no se dibuja.
 * @param {string[]} dates fechas ISO ascendentes que se muestran como columnas
 * @param {Array<{date: string, planId: string}>} marks
 * @returns {Map<number, string>} índice de columna → planId
 */
export function markIndexes(dates = [], marks = []) {
  const out = new Map()
  for (const mark of marks) {
    const idx = dates.findIndex((d) => d >= mark.date)
    if (idx < 0) continue
    // La primera columna solo lleva marca si el plan realmente arranca ahí, no
    // si viene de antes y quedó recortado.
    if (idx === 0 && dates[0] !== mark.date) continue
    if (!out.has(idx)) out.set(idx, mark.planId)
  }
  return out
}

/** ¿Hay más de un plan de verdad en el período? */
export function hasMultiplePlans(windows = []) {
  return realPlanWindows(windows).length > 1
}

/**
 * Inicio del plan anterior, para el botón "Desde el plan anterior": el más
 * reciente de los planes que YA NO están vigentes. Mira `active` en lugar de
 * contar posiciones, porque un alumno puede tener más de una asignación
 * vigente a la vez y un mismo plan puede haberse asignado dos veces.
 * @param {Array<{plan_id?: string, active?: boolean, created_at?: string, start_date?: string|null}>} assignments
 * @returns {string|null} fecha ISO (yyyy-MM-dd), o null si no hay plan anterior
 */
export function previousPlanStart(assignments = []) {
  const byPlan = new Map()
  for (const a of assignments) {
    if (!a || a.active) continue
    const start = (a.start_date || a.created_at || '').slice(0, 10)
    if (!start) continue
    const key = a.plan_id || start
    const prev = byPlan.get(key)
    if (!prev || start > prev) byPlan.set(key, start)
  }
  const starts = [...byPlan.values()].sort()
  return starts.length > 0 ? starts[starts.length - 1] : null
}
