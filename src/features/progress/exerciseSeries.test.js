import { describe, expect, it } from 'vitest'
import {
  setsOfLog,
  buildRepsWeightSeries,
  describeExerciseSeries,
  progressionPoints,
  buildExerciseVolumeSeries,
} from './exerciseSeries'

const log = (date, reps, weights, extra = {}) => ({
  logged_date: date,
  actual_reps_jsonb: reps,
  actual_weights_jsonb: weights,
  ...extra,
})

describe('setsOfLog', () => {
  it('empareja reps y kilos por serie y descarta series vacías', () => {
    expect(setsOfLog(log('2026-10-01', [12, '10', ''], [40, null, null]))).toEqual([
      { reps: 12, kg: 40 },
      { reps: 10, kg: null },
    ])
  })
  it('lee el formato viejo (actual_weight replicado)', () => {
    expect(
      setsOfLog({ logged_date: 'x', actual_reps: '["8","8"]', actual_weight: 20, actual_sets: 2 })
    ).toEqual([
      { reps: 8, kg: 20 },
      { reps: 8, kg: 20 },
    ])
  })
})

describe('buildRepsWeightSeries', () => {
  it('mejor serie, promedio por serie y kilos máximos', () => {
    const [p] = buildRepsWeightSeries([log('2026-10-01', [12, 12, 10], [40, 40, 42.5])])
    expect(p).toMatchObject({ iso: '2026-10-01', best: 12, avg: 11.3, kg: 42.5 })
    expect(p.sets).toHaveLength(3)
  })
  it('una sesión sin kilos igual tiene reps (no desaparece)', () => {
    const pts = buildRepsWeightSeries([
      log('2026-10-01', [10], [30]),
      log('2026-10-03', [12, 11], []),
    ])
    expect(pts.map((p) => [p.iso, p.best, p.kg])).toEqual([
      ['2026-10-01', 10, 30],
      ['2026-10-03', 12, null],
    ])
  })
  it('el mismo ejercicio dos veces el mismo día queda en un solo punto', () => {
    const pts = buildRepsWeightSeries([
      log('2026-10-02', [8], [50]),
      log('2026-10-01', [10], [45]),
      log('2026-10-02', [6], [55]),
    ])
    expect(pts.map((p) => p.iso)).toEqual(['2026-10-01', '2026-10-02'])
    expect(pts[1]).toMatchObject({ best: 8, avg: 7, kg: 55 })
  })
  it('registros sin datos no generan puntos', () => {
    expect(buildRepsWeightSeries([log('2026-10-01', [], [])])).toEqual([])
  })
})

describe('describeExerciseSeries', () => {
  it('detecta kilos, unilateral y unidad', () => {
    const logs = [
      log('2026-10-01', [10], [], { reps_unit: 'pasos', unilateral: true }),
      log('2026-10-02', [12], [], { reps_unit: 'pasos' }),
    ]
    const d = describeExerciseSeries(logs, buildRepsWeightSeries(logs))
    expect(d).toMatchObject({ hasKg: false, hasReps: true, unilateral: true, unit: 'pasos' })
  })
  it('ejercicio por tiempo sin datos', () => {
    const logs = [{ logged_date: '2026-10-01', plan_exercise: { exercise_mode: 'time' } }]
    expect(describeExerciseSeries(logs, buildRepsWeightSeries(logs)).timeOnly).toBe(true)
  })
})

describe('progressionPoints', () => {
  const pts = [
    { iso: 'a', best: 10, kg: null },
    { iso: 'b', best: 12, kg: 40 },
  ]
  it('con kilos usa kilos y salta las sesiones sin kilos', () => {
    expect(progressionPoints(pts, true)).toEqual([{ date: 'b', value: 40 }])
  })
  it('sin kilos usa la mejor serie', () => {
    expect(progressionPoints(pts, false).map((p) => p.value)).toEqual([10, 12])
  })
})

describe('buildExerciseVolumeSeries', () => {
  it('solo series con kilos reales; unilateral × 2; suma el mismo día', () => {
    const v = buildExerciseVolumeSeries([
      log('2026-10-01', [10, 10], [20, null]),
      log('2026-10-01', [5], [10]),
      log('2026-10-02', [8], [15], { unilateral: true }),
      log('2026-10-03', [20], []),
    ])
    expect(v).toEqual([
      { iso: '2026-10-01', volume: 250 },
      { iso: '2026-10-02', volume: 240 },
    ])
  })
  it('nunca usa el peso corporal del perfil', () => {
    expect(
      buildExerciseVolumeSeries([log('2026-10-01', [15], [], { weight_mode: 'bodyweight' })])
    ).toEqual([])
  })
})
