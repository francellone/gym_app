// ============================================================
// calendarLogic.test.js — estado de día por alumno en el calendario
// ------------------------------------------------------------
// Foco: completo vs parcial (2026-08-27). Antes cualquier día con
// sesión registrada se pintaba "Cumplido" en verde, así que Andrea
// —que entrenaba solo la activación— le figuraba cumplida a la coach.
// ============================================================
import { describe, it, expect } from 'vitest'
import { computeStudentDayStatus, STUDENT_DAY_STYLE } from './calendarLogic'

const TODAY = new Date(2026, 7, 27) // jueves 2026-08-27
const YMD = '2026-08-24'

describe('computeStudentDayStatus — modo flexible', () => {
  const opts = { scheduleMode: 'flexible' }

  it('día entrenado y completo → Cumplido', () => {
    expect(computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, opts)).toBe('planned_done')
  })

  it('día entrenado a medias → Parcial', () => {
    expect(
      computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, {
        ...opts,
        partialSet: new Set([YMD]),
      })
    ).toBe('planned_partial')
  })

  it('día extra a medias → Día extra parcial', () => {
    expect(
      computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, {
        ...opts,
        flexibleOverflowSet: new Set([YMD]),
        partialSet: new Set([YMD]),
      })
    ).toBe('unplanned_partial')
  })

  it('sin partialSet mantiene el comportamiento anterior', () => {
    expect(computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, opts)).toBe('planned_done')
  })

  it('un día sin sesión sigue siendo descanso aunque esté en partialSet', () => {
    expect(
      computeStudentDayStatus(YMD, new Set(), new Set(), TODAY, {
        ...opts,
        partialSet: new Set([YMD]),
      })
    ).toBe('rest')
  })
})

describe('computeStudentDayStatus — modo fixed', () => {
  const opts = { scheduleMode: 'fixed' }

  it('día esperado y entrenado a medias → Parcial', () => {
    expect(
      computeStudentDayStatus(YMD, new Set([YMD]), new Set([YMD]), TODAY, {
        ...opts,
        partialSet: new Set([YMD]),
      })
    ).toBe('planned_partial')
  })

  it('día NO esperado entrenado a medias → Día extra parcial', () => {
    expect(
      computeStudentDayStatus(YMD, new Set(), new Set([YMD]), TODAY, {
        ...opts,
        partialSet: new Set([YMD]),
      })
    ).toBe('unplanned_partial')
  })

  it('el parcial no pisa a "no asistió" ni a "próximo"', () => {
    const partialSet = new Set(['2026-08-25', '2026-08-31'])
    expect(
      computeStudentDayStatus('2026-08-25', new Set(['2026-08-25']), new Set(), TODAY, {
        ...opts,
        partialSet,
      })
    ).toBe('planned_missed')
    expect(
      computeStudentDayStatus('2026-08-31', new Set(['2026-08-31']), new Set(), TODAY, {
        ...opts,
        partialSet,
      })
    ).toBe('planned_future')
  })
})

describe('STUDENT_DAY_STYLE', () => {
  it('todos los estados que devuelve la función tienen estilo y etiqueta', () => {
    for (const status of [
      'planned_done',
      'planned_partial',
      'planned_missed',
      'planned_future',
      'unplanned_done',
      'unplanned_partial',
      'rest',
    ]) {
      expect(STUDENT_DAY_STYLE[status]).toBeTruthy()
      expect(STUDENT_DAY_STYLE[status].label).toBeTruthy()
    }
  })
})
