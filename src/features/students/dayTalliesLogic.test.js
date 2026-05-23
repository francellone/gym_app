// ============================================================
// dayTalliesLogic.test.js — Q2 (tildes por día completado)
// ------------------------------------------------------------
// Cubre el agrupado por section + decisión entero/parcial al 100%
// estricto y la regla de display (tildes < 5, colapso ×N a partir
// de 5).
// ============================================================
import { describe, it, expect } from 'vitest'
import { computeDayTallies, formatTallyForDisplay } from './dayTalliesLogic'

// Plan fixture típico: 3 ejercicios en day_a, 2 en day_b, 1 en activación.
const plan = [
  { id: 'pe1', section: 'day_a' },
  { id: 'pe2', section: 'day_a' },
  { id: 'pe3', section: 'day_a' },
  { id: 'pe4', section: 'day_b' },
  { id: 'pe5', section: 'day_b' },
  { id: 'pe_act', section: 'activation' },
]

describe('computeDayTallies', () => {
  it('logs vacíos → tallies vacíos', () => {
    expect(computeDayTallies({ logs: [], planExercises: plan })).toEqual({})
  })

  it('inputs null/undefined no rompen', () => {
    expect(computeDayTallies({})).toEqual({})
    expect(computeDayTallies({ logs: null, planExercises: null })).toEqual({})
    expect(computeDayTallies()).toEqual({})
  })

  it('día A 100% completado en 1 fecha → 1 entero', () => {
    const logs = [
      { logged_date: '2026-05-13', plan_exercise_id: 'pe1', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe2', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe3', completed: true },
    ]
    const out = computeDayTallies({ logs, planExercises: plan })
    expect(out.day_a).toMatchObject({ entero: 1, parcial: 0, total: 1 })
    expect(out.day_a.days.has('2026-05-13')).toBe(true)
  })

  it('día A 2 de 3 completados → 1 parcial (umbral 100% estricto)', () => {
    const logs = [
      { logged_date: '2026-05-13', plan_exercise_id: 'pe1', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe2', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe3', completed: false },
    ]
    const out = computeDayTallies({ logs, planExercises: plan })
    expect(out.day_a).toMatchObject({ entero: 0, parcial: 1, total: 1 })
  })

  it('mismo section en distintas fechas → cuenta veces separadas', () => {
    const logs = [
      // 13/05 entero
      { logged_date: '2026-05-13', plan_exercise_id: 'pe1', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe2', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe3', completed: true },
      // 18/05 parcial
      { logged_date: '2026-05-18', plan_exercise_id: 'pe1', completed: true },
      { logged_date: '2026-05-18', plan_exercise_id: 'pe2', completed: true },
      // 23/05 entero
      { logged_date: '2026-05-23', plan_exercise_id: 'pe1', completed: true },
      { logged_date: '2026-05-23', plan_exercise_id: 'pe2', completed: true },
      { logged_date: '2026-05-23', plan_exercise_id: 'pe3', completed: true },
    ]
    const out = computeDayTallies({ logs, planExercises: plan })
    expect(out.day_a.entero).toBe(2)
    expect(out.day_a.parcial).toBe(1)
    expect(out.day_a.total).toBe(3)
    expect(out.day_a.days.size).toBe(3)
  })

  it('activation no genera tally (forma parte de cualquier día)', () => {
    const logs = [{ logged_date: '2026-05-13', plan_exercise_id: 'pe_act', completed: true }]
    const out = computeDayTallies({ logs, planExercises: plan })
    expect(out.activation).toBeUndefined()
    expect(out).toEqual({})
  })

  it('logs de ejercicios fuera del plan se ignoran (silenciosamente)', () => {
    const logs = [
      { logged_date: '2026-05-13', plan_exercise_id: 'pe_ghost', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe1', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe2', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe3', completed: true },
    ]
    const out = computeDayTallies({ logs, planExercises: plan })
    expect(out.day_a.entero).toBe(1)
  })

  it('logs con completed=false aislados no aparecen', () => {
    const logs = [
      { logged_date: '2026-05-13', plan_exercise_id: 'pe1', completed: false },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe2', completed: false },
    ]
    const out = computeDayTallies({ logs, planExercises: plan })
    expect(out).toEqual({})
  })

  it('día A entero + día B parcial en distintas fechas conviven', () => {
    const logs = [
      // 13/05 day_a entero
      { logged_date: '2026-05-13', plan_exercise_id: 'pe1', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe2', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe3', completed: true },
      // 14/05 day_b parcial (pe5 incompleto)
      { logged_date: '2026-05-14', plan_exercise_id: 'pe4', completed: true },
    ]
    const out = computeDayTallies({ logs, planExercises: plan })
    expect(out.day_a).toMatchObject({ entero: 1, parcial: 0 })
    expect(out.day_b).toMatchObject({ entero: 0, parcial: 1 })
  })

  it('logged_date como timestamp ISO se normaliza a YMD', () => {
    const logs = [
      { logged_date: '2026-05-13T18:00:00Z', plan_exercise_id: 'pe1', completed: true },
      { logged_date: '2026-05-13T18:00:00Z', plan_exercise_id: 'pe2', completed: true },
      { logged_date: '2026-05-13T18:00:00Z', plan_exercise_id: 'pe3', completed: true },
    ]
    const out = computeDayTallies({ logs, planExercises: plan })
    expect(out.day_a.days.has('2026-05-13')).toBe(true)
    expect(out.day_a.entero).toBe(1)
  })
})

describe('formatTallyForDisplay', () => {
  it('tally vacío → string vacío', () => {
    expect(formatTallyForDisplay({ entero: 0, parcial: 0, total: 0, days: new Set() })).toBe('')
    expect(formatTallyForDisplay(null)).toBe('')
    expect(formatTallyForDisplay(undefined)).toBe('')
  })

  it('total < 5 → tildes literales (entero=✓, parcial=◐)', () => {
    expect(formatTallyForDisplay({ entero: 3, parcial: 0 })).toBe('✓✓✓')
    expect(formatTallyForDisplay({ entero: 2, parcial: 1 })).toBe('✓✓◐')
    expect(formatTallyForDisplay({ entero: 0, parcial: 2 })).toBe('◐◐')
    expect(formatTallyForDisplay({ entero: 1, parcial: 0 })).toBe('✓')
  })

  it('total >= 5 sin parciales → "×N"', () => {
    expect(formatTallyForDisplay({ entero: 5, parcial: 0 })).toBe('×5')
    expect(formatTallyForDisplay({ entero: 12, parcial: 0 })).toBe('×12')
  })

  it('total >= 5 con parciales → "×N (M◐)"', () => {
    expect(formatTallyForDisplay({ entero: 6, parcial: 1 })).toBe('×7 (1◐)')
    expect(formatTallyForDisplay({ entero: 4, parcial: 1 })).toBe('×5 (1◐)')
    expect(formatTallyForDisplay({ entero: 8, parcial: 3 })).toBe('×11 (3◐)')
  })

  it('exactamente 4 sigue siendo tildes (límite del < 5)', () => {
    expect(formatTallyForDisplay({ entero: 3, parcial: 1 })).toBe('✓✓✓◐')
    expect(formatTallyForDisplay({ entero: 4, parcial: 0 })).toBe('✓✓✓✓')
  })
})
