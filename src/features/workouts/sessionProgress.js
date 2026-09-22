// ============================================================
// sessionProgress.js — qué cuenta como "la sesión de hoy"
// ------------------------------------------------------------
// Fix 2026-08-27 (reporte de Andrea: "completo y no me queda en verde").
// Los 3 indicadores de cierre de la pantalla de Entrenar trataban al
// "plan entero" como si fuera "la sesión de hoy":
//
//   1. La barra de progreso sumaba activación + TODOS los días del plan.
//      Plan de 2 días (8 + 4 + 4 = 16 ítems): entrenar el Día A completo
//      daba 12/16 = 75%. Nunca 100%, ningún día.
//   2. El banner de cierre se ponía verde solo si TODOS los días del plan
//      estaban completos EN LA MISMA FECHA — imposible en la práctica.
//   3. El punto del tab del día era verde con PSE y naranja sin PSE: el
//      color mezclaba "entrenaste" con "me contaste cómo te fue".
//
// Regla única: la sesión de hoy = activación + el día activo. Nada más.
// El PSE no decide el color: decide la FORMA del punto (relleno/hueco).
//
// Decisiones de Franco 2026-08-27 al cerrar el fix:
//   - La activación es obligatoria para cerrar CUALQUIER día (antes solo el
//     primero del plan: la misma alumna cerraba el Día B y no el Día A).
//   - El día completado dice "✅ Día X completado". El 🎉 se reserva para
//     cuando cerró todos los entrenamientos ESPERADOS DE LA SEMANA
//     (adherencia semanal, ver isWeekComplete).
//
// Funciones puras (sin React ni Supabase) para poder testearlas.
// ============================================================

import { sectionResolution } from './helpers'
import {
  dayStateFromTally,
  isDayStateClosed,
  isTrainingActivity,
  mergeTallies,
} from './completionRules'

export const ACTIVATION_SECTION = 'activation'

// ============================================================
// sessionSections
// ------------------------------------------------------------
// Secciones que forman la sesión de hoy: activación + día activo.
// Sin día activo (plan sin días), solo la activación.
// ============================================================
export function sessionSections(activeDay) {
  return activeDay ? [ACTIVATION_SECTION, activeDay] : [ACTIVATION_SECTION]
}

// ============================================================
// computeSessionProgress
// ------------------------------------------------------------
// Totales de la barra de progreso, contando SOLO la sesión de hoy.
// Unidades: cada ejercicio de un bloque 'strength' cuenta 1 (vía
// workout_logs.completed); cada bloque aeróbico/circuito cuenta 1
// (vía workout_block_logs.completed). Mismo criterio que dayTalliesLogic.
//
// v54: suma `skippedCount` (ítems que la persona declaró no hechos). La
// barra sigue mostrando hechos/total; el texto "4 de 5" sale de acá.
//
// @returns {{completedCount: number, totalCount: number, skippedCount: number}}
// ============================================================
export function computeSessionProgress({ blocksBySection, activeDay, logs, blockLogs } = {}) {
  const t = sessionTally({ blocksBySection, activeDay, logs, blockLogs })
  return { completedCount: t.done, totalCount: t.total, skippedCount: t.skipped }
}

// Tally {total, done, skipped, resolved} de la sesión de hoy
// (activación + día). Compartido por el progreso y el estado del día.
function sessionTally({ blocksBySection, activeDay, logs, blockLogs } = {}) {
  const bySection = blocksBySection || {}
  return mergeTallies(
    ...sessionSections(activeDay).map((section) =>
      sectionResolution(bySection[section] || [], logs || {}, blockLogs || {})
    )
  )
}

// ============================================================
// isSessionBanner
// ------------------------------------------------------------
// ¿El banner de este día es el de cierre de la sesión (verde,
// "¡Entrenamiento completo!") o el de un día suelto (azul)?
// Verde = el día que estás entrenando hoy quedó completo.
// ============================================================
export function isSessionBanner(dayId, activeDay) {
  return !!dayId && dayId === activeDay
}

// ============================================================
// dayDotState
// ------------------------------------------------------------
// Estado del puntito al lado del tab del día:
//   'none'           → el día no cerró (no se dibuja)
//   'done'           → completo y con PSE del día → verde relleno
//   'done_no_pse'    → completo, falta el PSE → verde HUECO (sigue verde:
//                      el logro es haber entrenado, el PSE es un dato aparte)
//   'partial'        → v54: cerró con una omisión, con PSE
//   'partial_no_pse' → v54: cerró con una omisión, falta el PSE
// ============================================================
export function dayDotState({ isDone, hasPSE, isPartial } = {}) {
  if (!isDone) return 'none'
  const base = isPartial ? 'partial' : 'done'
  return hasPSE ? base : `${base}_no_pse`
}

// ============================================================
// daysPendingPSE
// ------------------------------------------------------------
// Días ya completos que todavía no tienen PSE cargado. Alimentan el
// chip "Registrar esfuerzo", que es la segunda puerta al modal: el
// automático se dispara una sola vez por día (pseTriggeredRef) y si el
// alumno lo cierra sin querer se quedaba sin forma de volver salvo el
// botón del banner.
// ============================================================
export function daysPendingPSE({ activeDays, dayDoneMap, borgPerDay } = {}) {
  const done = dayDoneMap || {}
  const borg = borgPerDay || {}
  return (activeDays || []).filter((id) => done[id] && borg[id] === undefined)
}

// ============================================================
// computeDayStateMap (v54)
// ------------------------------------------------------------
// Mapa día → 'none' | 'open' | 'partial' | 'complete' (ver completionRules).
// El tally del día suma la activación (si el plan la tiene) y el día:
// las omisiones de la activación cuentan en el mismo conteo, y la
// activación sigue siendo requisito porque sus ítems entran en el total.
//
// 2026-08-27: antes el gate de activación era `id === activeDays[0]`,
// o sea solo el primer día del plan. Con el verde inalcanzable eso no se
// veía; al arreglar el banner quedaba a la vista una asimetría absurda
// (misma alumna, misma conducta, el Día B cerraba y el Día A no).
// Ahora la activación es requisito de todos los días, coherente con la
// barra de progreso, que la suma en el denominador de cualquier día.
//
// Si el plan no tiene activación, no hay gate (se considera cumplida).
// ============================================================
export function computeDayStateMap({ activeDays, blocksBySection, logs, blockLogs } = {}) {
  const bySection = blocksBySection || {}
  const activation = sectionResolution(bySection[ACTIVATION_SECTION] || [], logs, blockLogs)

  const map = {}
  for (const id of activeDays || []) {
    const day = sectionResolution(bySection[id] || [], logs, blockLogs)
    // Sin bloques en el día no hay nada que cerrar (mismo comportamiento
    // que antes: isSectionCompleted([]) era false). Y si no se tocó ningún
    // ítem PROPIO del día, es 'none' aunque la activación esté hecha: la
    // activación es compartida por todos los días y no dice nada de este.
    if (day.total === 0 || day.resolved === 0) {
      map[id] = 'none'
      continue
    }
    map[id] = dayStateFromTally(mergeTallies(activation, day))
  }
  return map
}

// ============================================================
// computeDayDoneMap
// ------------------------------------------------------------
// Mapa día → cerrado (boolean). Compatibilidad con los consumidores de
// antes de v54: cerrado = 'complete' o 'partial'.
// ============================================================
export function computeDayDoneMap(args = {}) {
  const states = computeDayStateMap(args)
  const map = {}
  for (const id of Object.keys(states)) map[id] = isDayStateClosed(states[id])
  return map
}

// ============================================================
// sessionDatesFromLogs
// ------------------------------------------------------------
// Fechas YMD distintas con actividad registrada, para alimentar
// computeWeekAdherence. Mismo criterio que usa el resto de la app para
// "entrenó ese día" (calendario del coach, adherencia): existe registro.
//
// `extraDate` cubre el hueco del día en curso: recentLogs se trae en el
// fetch inicial, así que lo que el alumno acaba de cargar HOY todavía no
// está ahí. El llamador pasa selectedDate cuando el día ya está cerrado.
// ============================================================
export function sessionDatesFromLogs({ logs, extraDate } = {}) {
  const set = new Set()
  for (const l of logs || []) {
    // v54: una omisión declarada no es actividad; un día con solo
    // omisiones no es una sesión.
    if (!isTrainingActivity(l)) continue
    if (l?.logged_date) set.add(String(l.logged_date).slice(0, 10))
  }
  if (extraDate) set.add(String(extraDate).slice(0, 10))
  return [...set]
}

// ============================================================
// isWeekComplete
// ------------------------------------------------------------
// ¿Cerró todos los entrenamientos esperados de la semana?
// Toma la salida de computeWeekAdherence (features/plans/assignmentHelpers).
// Sin expectativa definida (expectedCount 0: plan sin sessions_per_week ni
// preferred_days) NO se celebra: preferimos no felicitar de más.
// ============================================================
export function isWeekComplete(adherence) {
  if (!adherence) return false
  const expected = Number(adherence.expectedCount) || 0
  const completed = Number(adherence.completedCount) || 0
  return expected > 0 && completed >= expected
}
