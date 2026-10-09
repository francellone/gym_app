// ============================================================
// Series por ejercicio para "Peso y reps" y "Volumen" (2026-10-09)
// ------------------------------------------------------------
// Pedido de coach: ver las reps del ejercicio elegido, no un número de
// volumen que mezclaba toda la sesión. Decisiones con Franco:
//   - Un punto por DÍA (si el mismo ejercicio se registró dos veces el mismo
//     día, se juntan las series; antes salían dos columnas con la misma fecha).
//   - Dos métricas de reps por sesión: la mejor serie y el promedio por serie.
//     NO el total: el total sube o baja según cuántas series se hicieron, no
//     según si la persona progresó.
//   - Kilos = máximo del día, solo si hay kilos cargados. Una sesión sin kilos
//     igual tiene sus reps (antes desaparecía del gráfico de peso).
//   - Unilateral: las reps son POR LADO, tal cual se cargaron. No se duplican.
//   - Volumen: kilos × reps SOLO de series con kilos reales de este ejercicio.
//     Nunca con profiles.weight_kg (valor actual sin historia, decisión
//     2026-08-28). Unilateral cuenta los dos lados (× 2).
// ============================================================
import { readLogReps, readLogWeights, getEffectiveUnilateral } from '@/features/plans/helpers'

const positive = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
const round1 = (x) => Math.round(x * 10) / 10

/**
 * Series de un registro como pares { reps, kg } (cualquiera puede ser null).
 * Se descartan las series sin ningún dato.
 */
export function setsOfLog(log) {
  const reps = readLogReps(log)
  const weights = readLogWeights(log)
  const n = Math.max(reps.length, weights.length)
  const out = []
  for (let i = 0; i < n; i++) {
    const r = positive(reps[i])
    const kg = positive(weights[i])
    if (r == null && kg == null) continue
    out.push({ reps: r, kg })
  }
  return out
}

export function logIsUnilateral(log) {
  return getEffectiveUnilateral({
    log,
    planExercise: log?.plan_exercise,
    exercise: log?.plan_exercise?.exercise,
  })
}

/** Ejercicio que se prescribe por tiempo: hoy no registra cuánto se sostuvo. */
export function logIsTimeBased(log) {
  return log?.plan_exercise?.exercise_mode === 'time'
}

/**
 * Un punto por fecha con las reps (mejor serie y promedio por serie), los
 * kilos máximos y el detalle de cada serie.
 *
 * @param {Array} logs - workout_logs de UN ejercicio
 * @returns {Array<{iso, best, avg, kg, sets: Array<{reps, kg}>}>} por fecha asc
 */
export function buildRepsWeightSeries(logs) {
  const byDate = new Map()
  for (const l of logs || []) {
    if (!l?.logged_date) continue
    const sets = setsOfLog(l)
    if (sets.length === 0) continue
    if (!byDate.has(l.logged_date)) byDate.set(l.logged_date, [])
    byDate.get(l.logged_date).push(...sets)
  }
  return [...byDate.keys()].sort().map((iso) => {
    const sets = byDate.get(iso)
    const reps = sets.map((s) => s.reps).filter((r) => r != null)
    const kgs = sets.map((s) => s.kg).filter((k) => k != null)
    return {
      iso,
      best: reps.length ? Math.max(...reps) : null,
      avg: reps.length ? round1(reps.reduce((a, b) => a + b, 0) / reps.length) : null,
      kg: kgs.length ? Math.max(...kgs) : null,
      sets,
    }
  })
}

/**
 * Qué se puede mostrar del ejercicio: si hay kilos, si es unilateral, en qué
 * unidad están las reps y si es un ejercicio por tiempo sin datos.
 */
export function describeExerciseSeries(logs, points) {
  const list = logs || []
  const pts = points || []
  const unitCounts = {}
  for (const l of list) {
    const u = l?.reps_unit || 'reps'
    unitCounts[u] = (unitCounts[u] || 0) + 1
  }
  const unit = Object.entries(unitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'reps'
  return {
    hasKg: pts.some((p) => p.kg != null),
    hasReps: pts.some((p) => p.best != null),
    unilateral: list.some(logIsUnilateral),
    unit,
    timeOnly: pts.length === 0 && list.some(logIsTimeBased),
  }
}

/**
 * Puntos para computeProgression: kilos si el ejercicio tiene kilos, si no la
 * mejor serie (misma métrica que ya usaba la progresión de peso corporal).
 */
export function progressionPoints(points, hasKg) {
  return (points || [])
    .map((p) => ({ date: p.iso, value: hasKg ? p.kg : p.best }))
    .filter((p) => p.value != null)
}

/**
 * Volumen del ejercicio por fecha: Σ reps × kg de las series con kilos reales
 * (× 2 si es unilateral). Las series sin kilos no suman.
 *
 * @returns {Array<{iso, volume}>} solo fechas con volumen > 0
 */
export function buildExerciseVolumeSeries(logs) {
  const byDate = new Map()
  for (const l of logs || []) {
    if (!l?.logged_date) continue
    const mult = logIsUnilateral(l) ? 2 : 1
    let vol = 0
    for (const s of setsOfLog(l)) {
      if (s.reps != null && s.kg != null) vol += s.reps * s.kg
    }
    if (vol > 0) byDate.set(l.logged_date, (byDate.get(l.logged_date) || 0) + vol * mult)
  }
  return [...byDate.keys()].sort().map((iso) => ({ iso, volume: Math.round(byDate.get(iso)) }))
}
