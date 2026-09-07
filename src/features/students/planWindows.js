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
 * Fechas en las que empieza un plan distinto del anterior: son las marcas
 * de corte. La primera ventana no genera corte (no hay nada antes).
 * @returns {string[]} fechas ISO ascendentes, sin repetir
 */
export function planCutDates(windows = []) {
  // Los registros sin plan (datos viejos a los que el borrado del plan les
  // soltó la mano) no son "otro plan": no deben dibujar un corte ni contar
  // como plan en la UI.
  const real = windows.filter((w) => w.planId !== NO_PLAN)
  const out = []
  real.forEach((w, i) => {
    if (i === 0) return
    if (!out.includes(w.from)) out.push(w.from)
  })
  return out.sort()
}

/** Ventanas que corresponden a un plan de verdad. */
export function realPlanWindows(windows = []) {
  return windows.filter((w) => w.planId !== NO_PLAN)
}

/**
 * Índices de la grilla de fechas donde hay que dibujar el corte. Si la fecha
 * exacta del corte no está en la grilla (por ejemplo porque se recortó la
 * cantidad de sesiones visibles), la marca cae en la primera fecha posterior.
 * @param {string[]} dates fechas ISO ascendentes que se muestran como columnas
 * @param {string[]} cutDates fechas ISO de corte
 * @returns {Set<number>}
 */
export function cutIndexes(dates = [], cutDates = []) {
  const out = new Set()
  for (const cut of cutDates) {
    const idx = dates.findIndex((d) => d >= cut)
    if (idx > 0) out.add(idx)
  }
  return out
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
