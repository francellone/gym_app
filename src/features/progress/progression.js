// ============================================================
// Progresión calculada — definición única para toda la app
// ------------------------------------------------------------
// Hasta 2026-08-28 la única progresión calculada vivía en la vista Tabla del
// coach (StudentProgressTableView): % entre el PRIMER y el ÚLTIMO log del
// período. Esa definición es frágil por dos lados:
//   - un solo día atípico en cualquiera de las dos puntas (entró suave, día
//     de descarga) mueve el número entero;
//   - depende del filtro de período: la misma alumna "progresa" distinto
//     según se mire 1m o 3m, sin que haya cambiado nada.
//
// La definición de acá: promedio de la PRIMERA SEMANA de datos vs promedio de
// la ÚLTIMA SEMANA (ventanas de 7 días ancladas al primer y último registro).
// Sigue siendo explicable en una frase y un día raro pesa 1/N en vez de todo.
// Si el rango es más corto que dos semanas (las ventanas se pisarían), cae a
// primer vs último valor, que ahí es lo único honesto que se puede decir.
//
// La métrica es agnóstica: los puntos traen `value` y da igual si son kg o
// reps. Para ejercicios de peso corporal la progresión son las reps — mismo
// criterio que la tabla ya usaba como fallback. NO se reconstruye carga
// total con profiles.weight_kg: es un único valor actual, sin historia, y
// usarlo hacia atrás fabricaría una progresión que serían ediciones del
// perfil (decisión 2026-08-28 con Franco).
// ============================================================
import { parseISO, differenceInCalendarDays } from 'date-fns'
import { readLogReps } from '@/features/plans/helpers'

/**
 * Máximo de reps de un log (jsonb o legacy). En unilateral el valor sigue
 * siendo "por lado": acá medimos progresión de reps, no volumen.
 * @param {Object} log - workout_log
 * @returns {number} 0 si no hay reps numéricas
 */
export function repsMaxOfLog(log) {
  const arr = readLogReps(log)
    .map((r) => parseFloat(r))
    .filter((n) => !isNaN(n) && n > 0)
  return arr.length > 0 ? Math.max(...arr) : 0
}

const avg = (pts) => pts.reduce((a, p) => a + p.value, 0) / pts.length

/**
 * Progresión % entre el arranque y el final de una serie de puntos.
 *
 * @param {Array<{date: string, value: number}>} points - fecha yyyy-MM-dd +
 *   valor (kg, reps, lo que sea). Se descartan valores <= 0. No hace falta
 *   que vengan ordenados; puede haber varios puntos por fecha.
 * @returns {{pct: number, firstAvg: number, lastAvg: number,
 *   basis: 'weeks'|'points'} | null} null si no hay al menos 2 puntos.
 *   basis dice qué se comparó: 'weeks' = promedios de primera vs última
 *   semana; 'points' = primer vs último valor (rango < 14 días).
 */
export function computeProgression(points) {
  const pts = (points || [])
    .filter((p) => p && p.date && typeof p.value === 'number' && p.value > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  if (pts.length < 2) return null

  const firstDate = parseISO(pts[0].date)
  const lastDate = parseISO(pts[pts.length - 1].date)
  const spanDays = differenceInCalendarDays(lastDate, firstDate)

  let firstAvg
  let lastAvg
  let basis
  if (spanDays < 14) {
    firstAvg = pts[0].value
    lastAvg = pts[pts.length - 1].value
    basis = 'points'
  } else {
    firstAvg = avg(pts.filter((p) => differenceInCalendarDays(parseISO(p.date), firstDate) < 7))
    lastAvg = avg(pts.filter((p) => differenceInCalendarDays(lastDate, parseISO(p.date)) < 7))
    basis = 'weeks'
  }
  if (!firstAvg) return null

  return {
    pct: Math.round(((lastAvg - firstAvg) / firstAvg) * 100),
    firstAvg: Math.round(firstAvg * 10) / 10,
    lastAvg: Math.round(lastAvg * 10) / 10,
    basis,
  }
}
