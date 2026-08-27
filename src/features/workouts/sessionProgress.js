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

import { isSectionCompleted } from './helpers'

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
// @returns {{completedCount: number, totalCount: number}}
// ============================================================
export function computeSessionProgress({ blocksBySection, activeDay, logs, blockLogs } = {}) {
  const bySection = blocksBySection || {}
  const logMap = logs || {}
  const blockLogMap = blockLogs || {}
  let done = 0
  let total = 0
  for (const section of sessionSections(activeDay)) {
    for (const block of bySection[section] || []) {
      if (block.block_type === 'strength') {
        const exs = block.plan_exercises || []
        total += exs.length
        done += exs.filter((ex) => logMap[ex.id]?.completed).length
      } else {
        total += 1
        if (blockLogMap[block.id]?.completed) done += 1
      }
    }
  }
  return { completedCount: done, totalCount: total }
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
//   'none'        → el día no está completo (no se dibuja)
//   'done'        → completo y con PSE del día → verde relleno
//   'done_no_pse' → completo, falta el PSE → verde HUECO (sigue verde:
//                   el logro es haber entrenado, el PSE es un dato aparte)
// ============================================================
export function dayDotState({ isDone, hasPSE } = {}) {
  if (!isDone) return 'none'
  return hasPSE ? 'done' : 'done_no_pse'
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
// computeDayDoneMap
// ------------------------------------------------------------
// Mapa día → completado. Un día está cerrado cuando están completos
// TODOS sus bloques Y la activación.
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
export function computeDayDoneMap({ activeDays, blocksBySection, logs, blockLogs } = {}) {
  const bySection = blocksBySection || {}
  const activationBlocks = bySection[ACTIVATION_SECTION] || []
  const activationDone =
    activationBlocks.length === 0 || isSectionCompleted(activationBlocks, logs, blockLogs)

  const map = {}
  for (const id of activeDays || []) {
    map[id] = isSectionCompleted(bySection[id] || [], logs, blockLogs) && activationDone
  }
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
