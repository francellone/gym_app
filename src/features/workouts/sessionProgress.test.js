// ============================================================
// sessionProgress.test.js
// ------------------------------------------------------------
// Caso testigo: el plan de Andrea (reporte 2026-08-27).
//   activación 8 ejercicios + Día A 4 + Día B 4 = 16 ítems en el plan.
//   Sesión de hoy (activación + Día A) = 12 ítems.
// Antes: completar la sesión daba 12/16 = 75% y banner AZUL.
// Ahora: 12/12 = 100% y banner VERDE.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  ACTIVATION_SECTION,
  sessionSections,
  computeSessionProgress,
  isSessionBanner,
  dayDotState,
  daysPendingPSE,
} from './sessionProgress'

// ── Helpers de fixture ───────────────────────────────────────
function strengthBlock(id, exIds) {
  return {
    id,
    block_type: 'strength',
    plan_exercises: exIds.map((exId) => ({ id: exId })),
  }
}
function circuitBlock(id) {
  return { id, block_type: 'circuit', plan_exercises: [] }
}
function completedMap(ids) {
  return Object.fromEntries(ids.map((id) => [id, { completed: true }]))
}

// Plan de Andrea: 8 de activación, 4 en Día A, 4 en Día B.
const ACT_EX = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']
const DAY_A_EX = ['pa1', 'pa2', 'pa3', 'pa4']
const DAY_B_EX = ['pb1', 'pb2', 'pb3', 'pb4']
const PLAN_ANDREA = {
  activation: [strengthBlock('blk-act', ACT_EX)],
  day_a: [strengthBlock('blk-a', DAY_A_EX)],
  day_b: [strengthBlock('blk-b', DAY_B_EX)],
}

describe('sessionSections', () => {
  it('la sesión es activación + día activo', () => {
    expect(sessionSections('day_b')).toEqual([ACTIVATION_SECTION, 'day_b'])
  })

  it('sin día activo queda solo la activación', () => {
    expect(sessionSections(null)).toEqual([ACTIVATION_SECTION])
    expect(sessionSections(undefined)).toEqual([ACTIVATION_SECTION])
  })
})

describe('computeSessionProgress', () => {
  it('el denominador NO incluye los otros días del plan', () => {
    const { totalCount } = computeSessionProgress({
      blocksBySection: PLAN_ANDREA,
      activeDay: 'day_a',
      logs: {},
      blockLogs: {},
    })
    expect(totalCount).toBe(12) // 8 + 4, NO 16
  })

  it('completar activación + día activo da 100%', () => {
    const { completedCount, totalCount } = computeSessionProgress({
      blocksBySection: PLAN_ANDREA,
      activeDay: 'day_a',
      logs: completedMap([...ACT_EX, ...DAY_A_EX]),
      blockLogs: {},
    })
    expect(completedCount).toBe(12)
    expect(totalCount).toBe(12)
  })

  it('los logs del otro día no suman al progreso de hoy', () => {
    const { completedCount, totalCount } = computeSessionProgress({
      blocksBySection: PLAN_ANDREA,
      activeDay: 'day_a',
      logs: completedMap([...ACT_EX, ...DAY_B_EX]),
      blockLogs: {},
    })
    expect(completedCount).toBe(8)
    expect(totalCount).toBe(12)
  })

  it('el caso de Andrea: solo activación = 8/12, no 8/16', () => {
    const { completedCount, totalCount } = computeSessionProgress({
      blocksBySection: PLAN_ANDREA,
      activeDay: 'day_a',
      logs: completedMap(ACT_EX),
      blockLogs: {},
    })
    expect(completedCount).toBe(8)
    expect(totalCount).toBe(12)
  })

  it('cada bloque aeróbico/circuito cuenta como 1 ítem vía blockLogs', () => {
    const plan = {
      activation: [strengthBlock('blk-act', ['a1', 'a2'])],
      day_a: [strengthBlock('blk-a', ['pa1']), circuitBlock('blk-tabata')],
    }
    const parcial = computeSessionProgress({
      blocksBySection: plan,
      activeDay: 'day_a',
      logs: completedMap(['a1', 'a2', 'pa1']),
      blockLogs: {},
    })
    expect(parcial).toEqual({ completedCount: 3, totalCount: 4 })

    const entero = computeSessionProgress({
      blocksBySection: plan,
      activeDay: 'day_a',
      logs: completedMap(['a1', 'a2', 'pa1']),
      blockLogs: { 'blk-tabata': { completed: true } },
    })
    expect(entero).toEqual({ completedCount: 4, totalCount: 4 })
  })

  it('plan sin activación: solo cuenta el día activo', () => {
    const plan = { day_a: [strengthBlock('blk-a', DAY_A_EX)] }
    expect(
      computeSessionProgress({ blocksBySection: plan, activeDay: 'day_a', logs: {}, blockLogs: {} })
    ).toEqual({ completedCount: 0, totalCount: 4 })
  })

  it('tolera inputs vacíos', () => {
    expect(computeSessionProgress()).toEqual({ completedCount: 0, totalCount: 0 })
    expect(computeSessionProgress({ blocksBySection: PLAN_ANDREA, activeDay: null })).toEqual({
      completedCount: 0,
      totalCount: 8,
    })
  })
})

describe('isSessionBanner', () => {
  it('verde para el día que se está entrenando', () => {
    expect(isSessionBanner('day_a', 'day_a')).toBe(true)
  })

  it('azul para un día completo que no es el activo', () => {
    expect(isSessionBanner('day_b', 'day_a')).toBe(false)
  })

  it('no depende de que el plan tenga los OTROS días completos', () => {
    // Regresión del bug: antes exigía activeDays.every(dayDoneMap).
    expect(isSessionBanner('day_a', 'day_a')).toBe(true)
  })

  it('tolera valores vacíos', () => {
    expect(isSessionBanner(null, null)).toBe(false)
    expect(isSessionBanner(undefined, 'day_a')).toBe(false)
  })
})

describe('dayDotState', () => {
  it('sin completar no hay punto', () => {
    expect(dayDotState({ isDone: false, hasPSE: false })).toBe('none')
    expect(dayDotState({ isDone: false, hasPSE: true })).toBe('none')
  })

  it('completo con PSE → verde relleno', () => {
    expect(dayDotState({ isDone: true, hasPSE: true })).toBe('done')
  })

  it('completo sin PSE → verde hueco (nunca naranja)', () => {
    expect(dayDotState({ isDone: true, hasPSE: false })).toBe('done_no_pse')
  })

  it('tolera inputs vacíos', () => {
    expect(dayDotState()).toBe('none')
  })
})

describe('daysPendingPSE', () => {
  const activeDays = ['day_a', 'day_b']

  it('lista los días completos sin PSE', () => {
    expect(
      daysPendingPSE({
        activeDays,
        dayDoneMap: { day_a: true, day_b: false },
        borgPerDay: {},
      })
    ).toEqual(['day_a'])
  })

  it('no lista días que ya tienen PSE (incluido PSE 0)', () => {
    expect(
      daysPendingPSE({
        activeDays,
        dayDoneMap: { day_a: true, day_b: true },
        borgPerDay: { day_a: 8, day_b: 0 },
      })
    ).toEqual([])
  })

  it('no lista días incompletos', () => {
    expect(
      daysPendingPSE({ activeDays, dayDoneMap: {}, borgPerDay: {} })
    ).toEqual([])
  })

  it('tolera inputs vacíos', () => {
    expect(daysPendingPSE()).toEqual([])
  })
})
