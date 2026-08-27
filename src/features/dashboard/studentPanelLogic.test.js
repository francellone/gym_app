import { describe, it, expect } from 'vitest'
import {
  computeDonutData,
  computeCompletedDays,
  computeAveragePSE,
  computeAdherencePct,
  buildMotivationalMessage,
  computeExpectedDaysInWindow,
  computeClosedWeeksAdherence,
  computeExerciseProgress,
} from './studentPanelLogic'

const plan = [
  { id: 'pe1', section: 'day_a' },
  { id: 'pe2', section: 'day_a' },
  { id: 'pe3', section: 'day_b' },
  { id: 'pe4', section: 'day_b' },
  { id: 'pe5', section: 'day_c' },
  { id: 'pe_act', section: 'activation' },
]

describe('computeClosedWeeksAdherence', () => {
  // Martes 16/06/2026 → lunes de la semana en curso = 15/06.
  // Última semana cerrada = 08/06–14/06.
  const today = new Date(2026, 5, 16)

  it('excluye la semana en curso (caso Franco: 3/3 la semana cerrada)', () => {
    const out = computeClosedWeeksAdherence({
      trainingDates: ['2026-06-10', '2026-06-11', '2026-06-13', '2026-06-15', '2026-06-16'],
      target: 3,
      periodStart: '2026-06-02',
      periodEnd: '2026-06-16',
      today,
    })
    expect(out).toEqual({ expectedDays: 3, completedDays: 3, weeks: 1 })
    expect(computeAdherencePct(out)).toBe(100)
  })

  it('suma varias semanas cerradas dentro del período', () => {
    const out = computeClosedWeeksAdherence({
      trainingDates: ['2026-06-02', '2026-06-04', '2026-06-10'], // 2 en sem1, 1 en sem2
      target: 3,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-16',
      today,
    })
    expect(out).toEqual({ expectedDays: 6, completedDays: 3, weeks: 2 })
    expect(computeAdherencePct(out)).toBe(50)
  })

  it('capea por semana: extras de una semana no tapan otra', () => {
    const out = computeClosedWeeksAdherence({
      trainingDates: ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'], // 5 días, target 3
      target: 3,
      periodStart: '2026-06-08',
      periodEnd: '2026-06-16',
      today,
    })
    expect(out.completedDays).toBe(3) // capeado
    expect(out.weeks).toBe(1)
  })

  it('clampStartToFirstTraining: histórico completo cuenta desde el primer log', () => {
    // Período "all" (start ficticio 2000-01-01). Primer log: lunes 01/06.
    // Sin clamp, todas las semanas desde el 2000 contarían como esperadas.
    const out = computeClosedWeeksAdherence({
      trainingDates: ['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-08', '2026-06-10'],
      target: 3,
      periodStart: '2000-01-01',
      periodEnd: '2026-06-16',
      today,
      clampStartToFirstTraining: true,
    })
    // Semanas cerradas desde el primer log: 01-07/06 (3 logs) y 08-14/06 (2 logs).
    expect(out).toEqual({ expectedDays: 6, completedDays: 5, weeks: 2 })
    expect(computeAdherencePct(out)).toBe(83)
  })

  it('clampStartToFirstTraining: la semana parcial del primer log no cuenta', () => {
    // Primer log un miércoles → la semana que lo contiene no quedó completa
    // dentro del período efectivo y se excluye (ni penaliza ni ayuda).
    const out = computeClosedWeeksAdherence({
      trainingDates: ['2026-06-03', '2026-06-08', '2026-06-09', '2026-06-11'],
      target: 3,
      periodStart: '2000-01-01',
      periodEnd: '2026-06-16',
      today,
      clampStartToFirstTraining: true,
    })
    // Solo cuenta 08-14/06 (3 logs); la semana del 01/06 queda afuera.
    expect(out).toEqual({ expectedDays: 3, completedDays: 3, weeks: 1 })
    expect(computeAdherencePct(out)).toBe(100)
  })

  it('clampStartToFirstTraining sin logs no rompe (todo 0)', () => {
    const out = computeClosedWeeksAdherence({
      trainingDates: [],
      target: 3,
      periodStart: '2000-01-01',
      periodEnd: '2026-06-16',
      today,
      clampStartToFirstTraining: true,
    })
    expect(out).toEqual({ expectedDays: 0, completedDays: 0, weeks: 0 })
  })

  it('clampStartToFirstTraining no achica períodos con inicio real posterior', () => {
    // Si el período ya empieza DESPUÉS del primer log, no cambia nada.
    const conClamp = computeClosedWeeksAdherence({
      trainingDates: ['2026-05-04', '2026-06-08', '2026-06-10', '2026-06-12'],
      target: 3,
      periodStart: '2026-06-08',
      periodEnd: '2026-06-16',
      today,
      clampStartToFirstTraining: true,
    })
    const sinClamp = computeClosedWeeksAdherence({
      trainingDates: ['2026-05-04', '2026-06-08', '2026-06-10', '2026-06-12'],
      target: 3,
      periodStart: '2026-06-08',
      periodEnd: '2026-06-16',
      today,
    })
    expect(conClamp).toEqual(sinClamp)
  })

  it('sin semanas cerradas dentro del período → todo 0', () => {
    const out = computeClosedWeeksAdherence({
      trainingDates: ['2026-06-15', '2026-06-16'],
      target: 3,
      periodStart: '2026-06-15',
      periodEnd: '2026-06-16',
      today,
    })
    expect(out).toEqual({ expectedDays: 0, completedDays: 0, weeks: 0 })
  })

  it('sin target → 0', () => {
    const out = computeClosedWeeksAdherence({
      trainingDates: ['2026-06-10'],
      target: 0,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-16',
      today,
    })
    expect(out).toEqual({ expectedDays: 0, completedDays: 0, weeks: 0 })
  })
})

describe('computeDonutData', () => {
  it('vacío → []', () => {
    expect(computeDonutData({ logs: [], planExercises: plan })).toEqual([])
    expect(computeDonutData({})).toEqual([])
  })

  it('agrupa fechas distintas por section', () => {
    const logs = [
      { logged_date: '2026-05-13', plan_exercise_id: 'pe1', completed: true },
      { logged_date: '2026-05-13', plan_exercise_id: 'pe2', completed: true },
      { logged_date: '2026-05-15', plan_exercise_id: 'pe3', completed: true },
      { logged_date: '2026-05-17', plan_exercise_id: 'pe5', completed: true },
      { logged_date: '2026-05-20', plan_exercise_id: 'pe1', completed: true },
    ]
    const out = computeDonutData({ logs, planExercises: plan })
    // day_a: 13 + 20 = 2 fechas; day_b: 15 = 1; day_c: 17 = 1
    expect(out).toEqual([
      { key: 'day_a', label: 'Día A', value: 2, color: expect.any(String) },
      { key: 'day_b', label: 'Día B', value: 1, color: expect.any(String) },
      { key: 'day_c', label: 'Día C', value: 1, color: expect.any(String) },
    ])
  })

  it('excluye activation y logs incompletos', () => {
    const logs = [
      { logged_date: '2026-05-13', plan_exercise_id: 'pe_act', completed: true },
      { logged_date: '2026-05-14', plan_exercise_id: 'pe1', completed: false },
    ]
    expect(computeDonutData({ logs, planExercises: plan })).toEqual([])
  })

  it('orden A→D', () => {
    const logs = [
      { logged_date: '2026-05-13', plan_exercise_id: 'pe5', completed: true },
      { logged_date: '2026-05-14', plan_exercise_id: 'pe1', completed: true },
    ]
    const out = computeDonutData({ logs, planExercises: plan })
    expect(out.map((s) => s.key)).toEqual(['day_a', 'day_c'])
  })
})

describe('computeCompletedDays', () => {
  it('cuenta fechas distintas con completed=true', () => {
    const logs = [
      { logged_date: '2026-05-13', completed: true },
      { logged_date: '2026-05-13', completed: true }, // mismo día, no duplica
      { logged_date: '2026-05-14', completed: true },
      { logged_date: '2026-05-15', completed: false }, // no cuenta
    ]
    expect(computeCompletedDays(logs)).toBe(2)
  })

  it('inputs vacíos no rompen', () => {
    expect(computeCompletedDays([])).toBe(0)
    expect(computeCompletedDays(null)).toBe(0)
    expect(computeCompletedDays()).toBe(0)
  })
})

describe('computeAveragePSE', () => {
  it('promedia valores válidos', () => {
    const logs = [
      { perceived_difficulty: 6 },
      { perceived_difficulty: 8 },
      { perceived_difficulty: 7 },
    ]
    expect(computeAveragePSE(logs)).toBe(7)
  })

  it('redondea a 1 decimal', () => {
    const logs = [{ perceived_difficulty: 7 }, { perceived_difficulty: 8 }]
    expect(computeAveragePSE(logs)).toBe(7.5)
  })

  it('ignora valores no numéricos o ≤ 0', () => {
    const logs = [
      { perceived_difficulty: 0 },
      { perceived_difficulty: null },
      { perceived_difficulty: 'foo' },
      { perceived_difficulty: 6 },
    ]
    expect(computeAveragePSE(logs)).toBe(6)
  })

  it('sin logs válidos → null', () => {
    expect(computeAveragePSE([{ perceived_difficulty: null }])).toBe(null)
    expect(computeAveragePSE([])).toBe(null)
  })
})

describe('computeExpectedDaysInWindow', () => {
  it('flexible: pro-rata sessions_per_week * (days/7)', () => {
    expect(
      computeExpectedDaysInWindow({
        assignment: { schedule_mode: 'flexible', plan: { sessions_per_week: 3 } },
        periodRange: { start: '2026-05-01', end: '2026-05-28' }, // 28 días
      })
    ).toBe(12) // 28/7 * 3 = 12
  })

  it('flexible: ventana de 1 semana ⇒ sessions_per_week', () => {
    expect(
      computeExpectedDaysInWindow({
        assignment: { schedule_mode: 'flexible', plan: { sessions_per_week: 4 } },
        periodRange: { start: '2026-05-01', end: '2026-05-07' }, // 7 días
      })
    ).toBe(4)
  })

  it('flexible sin sessions_per_week → 0', () => {
    expect(
      computeExpectedDaysInWindow({
        assignment: { schedule_mode: 'flexible' },
        periodRange: { start: '2026-05-01', end: '2026-05-28' },
      })
    ).toBe(0)
  })

  it('fixed: si recibe fixedExpectedDates devuelve su length', () => {
    expect(
      computeExpectedDaysInWindow({
        assignment: { schedule_mode: 'fixed' },
        periodRange: { start: '2026-05-01', end: '2026-05-07' },
        fixedExpectedDates: ['2026-05-02', '2026-05-04', '2026-05-06'],
      })
    ).toBe(3)
  })

  it('fixed: sin fixedExpectedDates → 0', () => {
    expect(
      computeExpectedDaysInWindow({
        assignment: { schedule_mode: 'fixed' },
        periodRange: { start: '2026-05-01', end: '2026-05-07' },
      })
    ).toBe(0)
  })

  it('inputs vacíos no rompen', () => {
    expect(computeExpectedDaysInWindow({})).toBe(0)
    expect(computeExpectedDaysInWindow()).toBe(0)
  })
})

describe('computeAdherencePct', () => {
  it('porcentaje normal', () => {
    expect(computeAdherencePct({ completedDays: 3, expectedDays: 4 })).toBe(75)
    expect(computeAdherencePct({ completedDays: 4, expectedDays: 4 })).toBe(100)
  })

  it('completedDays > expectedDays se cap a 200', () => {
    expect(computeAdherencePct({ completedDays: 10, expectedDays: 4 })).toBe(200)
  })

  it('expectedDays=0 o falsy → null', () => {
    expect(computeAdherencePct({ completedDays: 3, expectedDays: 0 })).toBe(null)
    expect(computeAdherencePct({ completedDays: 3, expectedDays: null })).toBe(null)
    expect(computeAdherencePct({ completedDays: 3 })).toBe(null)
  })
})

describe('computeExerciseProgress', () => {
  const range = { start: '2026-05-01', end: '2026-05-21' } // midpoint = 2026-05-11

  function log(date, exId, exName, weight) {
    return {
      logged_date: date,
      actual_weight: weight,
      plan_exercise: { exercise: { id: exId, name: exName } },
    }
  }

  it('empty → []', () => {
    expect(computeExerciseProgress({ logs: [], periodRange: range })).toEqual([])
    expect(computeExerciseProgress({})).toEqual([])
  })

  it('up: max segunda > primera', () => {
    const logs = [
      log('2026-05-02', 'e1', 'Sentadilla', 80),
      log('2026-05-04', 'e1', 'Sentadilla', 82),
      log('2026-05-15', 'e1', 'Sentadilla', 85),
      log('2026-05-18', 'e1', 'Sentadilla', 88),
    ]
    const out = computeExerciseProgress({ logs, periodRange: range })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      status: 'up',
      firstMax: 82,
      secondMax: 88,
      delta: 6,
    })
  })

  it('flat: max segunda == primera', () => {
    const logs = [
      log('2026-05-02', 'e1', 'Sentadilla', 80),
      log('2026-05-05', 'e1', 'Sentadilla', 80),
      log('2026-05-15', 'e1', 'Sentadilla', 80),
      log('2026-05-18', 'e1', 'Sentadilla', 80),
    ]
    const out = computeExerciseProgress({ logs, periodRange: range })
    expect(out[0].status).toBe('flat')
    expect(out[0].delta).toBe(0)
  })

  it('down: max segunda < primera', () => {
    const logs = [
      log('2026-05-02', 'e1', 'Sentadilla', 90),
      log('2026-05-05', 'e1', 'Sentadilla', 90),
      log('2026-05-15', 'e1', 'Sentadilla', 80),
    ]
    const out = computeExerciseProgress({ logs, periodRange: range })
    expect(out[0].status).toBe('down')
    expect(out[0].delta).toBeLessThan(0)
  })

  it('insufficient: una mitad sin logs', () => {
    const logs = [
      log('2026-05-02', 'e1', 'Sentadilla', 80),
      log('2026-05-03', 'e1', 'Sentadilla', 80),
      log('2026-05-04', 'e1', 'Sentadilla', 80),
    ]
    const out = computeExerciseProgress({ logs, periodRange: range })
    expect(out[0].status).toBe('insufficient')
    expect(out[0].delta).toBeNull()
  })

  it('ignora ejercicios con menos de minLogs', () => {
    const logs = [
      log('2026-05-02', 'e1', 'Sentadilla', 80),
      log('2026-05-15', 'e1', 'Sentadilla', 85),
    ]
    expect(computeExerciseProgress({ logs, periodRange: range, minLogs: 3 })).toEqual([])
  })

  it('orden: up → flat → down → insufficient', () => {
    const logs = [
      // e_up: subió
      log('2026-05-02', 'e_up', 'A', 50),
      log('2026-05-04', 'e_up', 'A', 50),
      log('2026-05-15', 'e_up', 'A', 60),
      // e_down: bajó
      log('2026-05-02', 'e_down', 'B', 100),
      log('2026-05-03', 'e_down', 'B', 100),
      log('2026-05-15', 'e_down', 'B', 80),
      // e_flat: plano
      log('2026-05-02', 'e_flat', 'C', 70),
      log('2026-05-03', 'e_flat', 'C', 70),
      log('2026-05-15', 'e_flat', 'C', 70),
    ]
    const out = computeExerciseProgress({ logs, periodRange: range })
    expect(out.map((e) => e.exerciseName)).toEqual(['A', 'C', 'B'])
  })

  it('ignora logs fuera del rango', () => {
    const logs = [
      log('2026-04-15', 'e1', 'Sentadilla', 100), // antes
      log('2026-05-02', 'e1', 'Sentadilla', 80),
      log('2026-05-15', 'e1', 'Sentadilla', 85),
      log('2026-06-01', 'e1', 'Sentadilla', 200), // después
    ]
    const out = computeExerciseProgress({ logs, periodRange: range, minLogs: 2 })
    expect(out[0].firstMax).toBe(80)
    expect(out[0].secondMax).toBe(85)
  })
})

describe('buildMotivationalMessage', () => {
  it('sin entrenos → tone empty', () => {
    expect(buildMotivationalMessage({ completedDays: 0, expectedDays: 5 }).tone).toBe('empty')
  })

  it('sin expected (null) pero con entrenos → tone good genérico', () => {
    const msg = buildMotivationalMessage({ completedDays: 3, expectedDays: null })
    expect(msg.tone).toBe('good')
    expect(msg.text).toContain('3 entrenos')
  })

  it('90%+ → tone great', () => {
    expect(buildMotivationalMessage({ completedDays: 9, expectedDays: 10 }).tone).toBe('great')
  })

  it('60-89% → tone good', () => {
    expect(buildMotivationalMessage({ completedDays: 6, expectedDays: 10 }).tone).toBe('good')
  })

  it('30-59% → tone meh', () => {
    expect(buildMotivationalMessage({ completedDays: 4, expectedDays: 10 }).tone).toBe('meh')
  })

  it('<30% → tone bad', () => {
    expect(buildMotivationalMessage({ completedDays: 2, expectedDays: 10 }).tone).toBe('bad')
  })

  it('texto incluye el porcentaje', () => {
    expect(buildMotivationalMessage({ completedDays: 9, expectedDays: 10 }).text).toContain('90%')
  })
})
