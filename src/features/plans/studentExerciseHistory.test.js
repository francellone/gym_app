// ============================================================
// Historial por persona+ejercicio (contexto al armar el plan)
// ============================================================
import { describe, it, expect } from 'vitest'
import { buildExerciseHistoryMap, RECENT_SESSIONS } from './studentExerciseHistory'

const SENTADILLA = 'ex-sentadilla'
const PLANCHA = 'ex-plancha'

function log(exerciseId, date, { weights = null, reps = null, mode = 'with_weight' } = {}) {
  return {
    logged_date: date,
    weight_mode: mode,
    actual_weights_jsonb: weights,
    actual_reps_jsonb: reps,
    plan_exercise: { exercise_id: exerciseId },
  }
}

describe('buildExerciseHistoryMap', () => {
  it('resume kilos: qué viene cargando, su máximo y la última vez', () => {
    const map = buildExerciseHistoryMap([
      log(SENTADILLA, '2026-08-01', { weights: [30, 30, 32] }),
      log(SENTADILLA, '2026-08-15', { weights: [32, 32] }),
      log(SENTADILLA, '2026-08-29', { weights: [35] }),
    ])
    const h = map.get(SENTADILLA)
    expect(h.metric).toBe('kg')
    expect(h.max).toBe(35)
    expect(h.recentMin).toBe(30)
    expect(h.recentMax).toBe(35)
    expect(h.lastDate).toBe('2026-08-29')
    expect(h.sessions).toBe(3)
  })

  it('"viene cargando" mira solo las últimas sesiones, el máximo mira todo', () => {
    const viejas = [
      log(SENTADILLA, '2026-01-01', { weights: [60] }), // récord viejo
      log(SENTADILLA, '2026-08-01', { weights: [30] }),
      log(SENTADILLA, '2026-08-15', { weights: [32] }),
      log(SENTADILLA, '2026-08-29', { weights: [34] }),
    ]
    const h = buildExerciseHistoryMap(viejas).get(SENTADILLA)
    expect(h.max).toBe(60)
    expect(h.recentMin).toBe(30)
    expect(h.recentMax).toBe(34)
    expect(RECENT_SESSIONS).toBe(3)
  })

  it('el orden de llegada no importa: ordena por fecha', () => {
    const h = buildExerciseHistoryMap([
      log(SENTADILLA, '2026-08-15', { weights: [32] }),
      log(SENTADILLA, '2026-08-29', { weights: [35] }),
      log(SENTADILLA, '2026-08-01', { weights: [30] }),
    ]).get(SENTADILLA)
    expect(h.lastDate).toBe('2026-08-29')
  })

  it('sin peso (bodyweight) la métrica son las reps', () => {
    const h = buildExerciseHistoryMap([
      log(PLANCHA, '2026-08-01', { reps: [12], mode: 'bodyweight' }),
      log(PLANCHA, '2026-08-29', { reps: [15, 14], mode: 'bodyweight' }),
    ]).get(PLANCHA)
    expect(h.metric).toBe('reps')
    expect(h.max).toBe(15)
    expect(h.recentMin).toBe(12)
  })

  it('si el ejercicio cambió de modo, manda el más reciente (no mezcla kg con reps)', () => {
    const h = buildExerciseHistoryMap([
      log(PLANCHA, '2026-01-01', { reps: [20], mode: 'bodyweight' }),
      log(PLANCHA, '2026-08-29', { weights: [10], mode: 'with_weight' }),
    ]).get(PLANCHA)
    expect(h.metric).toBe('kg')
    expect(h.max).toBe(10)
    expect(h.sessions).toBe(1)
  })

  it('un log en %RM se trata como kilos reales (nunca se guarda ese modo)', () => {
    const h = buildExerciseHistoryMap([
      log(SENTADILLA, '2026-08-29', { weights: [42], mode: 'pct_1rm' }),
    ]).get(SENTADILLA)
    expect(h.metric).toBe('kg')
    expect(h.max).toBe(42)
  })

  it('ignora logs vacíos, ceros y filas rotas', () => {
    const map = buildExerciseHistoryMap([
      log(SENTADILLA, '2026-08-29', { weights: [] }),
      log(SENTADILLA, '2026-08-29', { weights: [0, null] }),
      { logged_date: '2026-08-29', actual_weights_jsonb: [10] }, // sin ejercicio
      {},
    ])
    expect(map.size).toBe(0)
  })

  it('lee el formato viejo (actual_weights como string JSON)', () => {
    const h = buildExerciseHistoryMap([
      {
        logged_date: '2026-08-29',
        weight_mode: 'with_weight',
        actual_weights: '[25, 27]',
        plan_exercise: { exercise_id: SENTADILLA },
      },
    ]).get(SENTADILLA)
    expect(h.max).toBe(27)
  })

  it('separa por ejercicio', () => {
    const map = buildExerciseHistoryMap([
      log(SENTADILLA, '2026-08-29', { weights: [35] }),
      log(PLANCHA, '2026-08-29', { reps: [15], mode: 'bodyweight' }),
    ])
    expect(map.size).toBe(2)
    expect(map.get(SENTADILLA).metric).toBe('kg')
    expect(map.get(PLANCHA).metric).toBe('reps')
  })
})
