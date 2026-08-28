// ============================================================
// Rango del heatmap de asistencia
// ------------------------------------------------------------
// La grilla de asistencia muestra un rango FIJO de semanas, independiente del
// filtro de período de los gráficos.
//
// Regresión que motivó separar esto (2026-08-28): el heatmap dibujaba 8
// semanas pero se pintaba con las fechas ya recortadas por el período. Con
// "1m" las semanas 5–8 salían siempre grises, como si la alumna no hubiera
// entrenado — el coach leía ausencias que no existían.
//
// La grilla y la fecha desde la que se piden los datos salen de la MISMA
// función a propósito: si se calcularan por separado podrían desincronizarse
// otra vez, y el síntoma serían días grises, no un error.
// ============================================================
import { format, startOfWeek, endOfWeek, subDays, eachDayOfInterval } from 'date-fns'

export const ATTENDANCE_WEEKS = 8

/**
 * Semanas de la grilla, de la más vieja a la más nueva.
 * Cada semana es un array de 7 Date (lunes a domingo).
 *
 * @param {Date} [today] - referencia; parametrizable para los tests.
 * @returns {Date[][]}
 */
export function attendanceWeeks(today = new Date()) {
  return Array.from({ length: ATTENDANCE_WEEKS }, (_, wi) => {
    const weekStart = startOfWeek(subDays(today, wi * 7), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) })
  }).reverse()
}

/**
 * Primer día de la grilla en formato yyyy-MM-dd: el `gte` con el que hay que
 * pedir los datos de asistencia para que ninguna celda quede sin cubrir.
 *
 * @param {Date} [today]
 * @returns {string}
 */
export function attendanceRangeStart(today = new Date()) {
  return format(attendanceWeeks(today)[0][0], 'yyyy-MM-dd')
}
