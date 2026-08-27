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
// Funciones puras (sin React ni Supabase) para poder testearlas.
// ============================================================

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
