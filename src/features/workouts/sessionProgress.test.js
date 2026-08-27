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
  computeDayDoneMap,
  isSessionBanner,
  dayDotState,
  daysPendingPSE,
  sessionDatesFromLogs,
  isWeekComplete,
} from './sessionProgress'
import { computeWeekAdherence } from '@/features/plans/assignmentHelpers'

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

describe('computeDayDoneMap', () => {
  const ACTIVE_DAYS = ['day_a', 'day_b']

  it('la activación es requisito de TODOS los días, no solo del primero', () => {
    // Regresión del gate viejo (id === activeDays[0]): con el Día B completo
    // y la activación a medias, el Día B se daba por cerrado y el Día A no.
    const map = computeDayDoneMap({
      activeDays: ACTIVE_DAYS,
      blocksBySection: PLAN_ANDREA,
      logs: completedMap([...DAY_A_EX, ...DAY_B_EX]), // activación sin tocar
      blockLogs: {},
    })
    expect(map).toEqual({ day_a: false, day_b: false })
  })

  it('cierra el día cuando están la activación y el bloque del día', () => {
    const map = computeDayDoneMap({
      activeDays: ACTIVE_DAYS,
      blocksBySection: PLAN_ANDREA,
      logs: completedMap([...ACT_EX, ...DAY_A_EX]),
      blockLogs: {},
    })
    expect(map).toEqual({ day_a: true, day_b: false })
  })

  it('la activación sola no cierra ningún día (caso Andrea)', () => {
    const map = computeDayDoneMap({
      activeDays: ACTIVE_DAYS,
      blocksBySection: PLAN_ANDREA,
      logs: completedMap(ACT_EX),
      blockLogs: {},
    })
    expect(map).toEqual({ day_a: false, day_b: false })
  })

  it('plan sin activación: no hay gate', () => {
    const plan = { day_a: [strengthBlock('blk-a', DAY_A_EX)] }
    expect(
      computeDayDoneMap({
        activeDays: ['day_a'],
        blocksBySection: plan,
        logs: completedMap(DAY_A_EX),
        blockLogs: {},
      })
    ).toEqual({ day_a: true })
  })

  it('cuenta los bloques aeróbico/circuito vía blockLogs', () => {
    const plan = {
      activation: [strengthBlock('blk-act', ['a1'])],
      day_a: [circuitBlock('blk-tabata')],
    }
    const base = { activeDays: ['day_a'], blocksBySection: plan, logs: completedMap(['a1']) }
    expect(computeDayDoneMap({ ...base, blockLogs: {} })).toEqual({ day_a: false })
    expect(computeDayDoneMap({ ...base, blockLogs: { 'blk-tabata': { completed: true } } })).toEqual(
      { day_a: true }
    )
  })

  it('tolera inputs vacíos', () => {
    expect(computeDayDoneMap()).toEqual({})
  })
})

describe('sessionDatesFromLogs', () => {
  it('deduplica fechas y normaliza a YMD', () => {
    const dates = sessionDatesFromLogs({
      logs: [
        { logged_date: '2026-08-24' },
        { logged_date: '2026-08-24' },
        { logged_date: '2026-08-21T00:00:00+00:00' },
      ],
    })
    expect(dates.sort()).toEqual(['2026-08-21', '2026-08-24'])
  })

  it('suma extraDate (el día en curso, que aún no está en recentLogs)', () => {
    expect(
      sessionDatesFromLogs({ logs: [{ logged_date: '2026-08-24' }], extraDate: '2026-08-27' }).sort()
    ).toEqual(['2026-08-24', '2026-08-27'])
  })

  it('no duplica si extraDate ya estaba', () => {
    expect(
      sessionDatesFromLogs({ logs: [{ logged_date: '2026-08-27' }], extraDate: '2026-08-27' })
    ).toEqual(['2026-08-27'])
  })

  it('ignora filas sin fecha y tolera inputs vacíos', () => {
    expect(sessionDatesFromLogs({ logs: [{}, { logged_date: null }] })).toEqual([])
    expect(sessionDatesFromLogs()).toEqual([])
  })
})

describe('isWeekComplete', () => {
  it('celebra al alcanzar las sesiones esperadas de la semana', () => {
    expect(isWeekComplete({ expectedCount: 3, completedCount: 3 })).toBe(true)
  })

  it('también si entrenó de más', () => {
    expect(isWeekComplete({ expectedCount: 3, completedCount: 4 })).toBe(true)
  })

  it('no celebra a mitad de semana', () => {
    expect(isWeekComplete({ expectedCount: 3, completedCount: 2 })).toBe(false)
  })

  it('sin expectativa definida no se celebra (no felicitar de más)', () => {
    expect(isWeekComplete({ expectedCount: 0, completedCount: 5 })).toBe(false)
    expect(isWeekComplete(null)).toBe(false)
    expect(isWeekComplete()).toBe(false)
  })
})

// ── Integración con la adherencia semanal real ───────────────
// Todas las asignaciones activas hoy son schedule_mode='flexible' con
// sessions_per_week, así que este es EL camino que se ejecuta en producción.
describe('isWeekComplete + computeWeekAdherence (flexible, 3 sesiones/semana)', () => {
  const assignment = {
    schedule_mode: 'flexible',
    start_date: '2026-07-27',
    end_date: null,
    plan: { sessions_per_week: 3 },
  }
  // Jueves 2026-08-27 → semana lunes 24/08 a domingo 30/08.
  const anchor = new Date(2026, 7, 27)

  function week(dates) {
    return computeWeekAdherence(assignment, dates, anchor, anchor)
  }

  it('3 de 3 en la semana → celebra', () => {
    expect(isWeekComplete(week(['2026-08-24', '2026-08-26', '2026-08-27']))).toBe(true)
  })

  it('2 de 3 → todavía no', () => {
    expect(isWeekComplete(week(['2026-08-24', '2026-08-26']))).toBe(false)
  })

  it('las sesiones de la semana pasada no cuentan para esta', () => {
    expect(isWeekComplete(week(['2026-08-17', '2026-08-19', '2026-08-21', '2026-08-24']))).toBe(
      false
    )
  })
})
