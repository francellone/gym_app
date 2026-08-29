// ============================================================
// Resolvedor de 1RM / kilos derivados (%RM)
// ------------------------------------------------------------
// La regla que cuidan estos tests: los kilos se DERIVAN (1RM × %),
// nunca se inscriben, y cuando no hay evaluación la degradación es
// limpia (se muestra el %), sin inventar un peso.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  buildOneRmMap,
  resolvePrescribedWeight,
  isOneRmStale,
  roundWeightKg,
  ONE_RM_STALE_DAYS,
} from './oneRm'

const SENTADILLA = 'ex-sentadilla'
const ESTOCADA = 'ex-estocada'

function response(exerciseId, oneRm, date) {
  return {
    student_response: { one_rm_estimated: oneRm },
    plan_exercise: { exercise_id: exerciseId },
    evaluation_result: { eval_date: date },
  }
}

function legacy(date, exercises) {
  return { eval_date: date, results: { exercises } }
}

describe('buildOneRmMap', () => {
  it('lee el modelo por ejercicio (evaluation_test_responses)', () => {
    const map = buildOneRmMap({ responses: [response(SENTADILLA, '60', '2026-07-06')] })
    expect(map.get(SENTADILLA)).toEqual({
      oneRm: 60,
      date: '2026-07-06',
      source: 'exercise_eval',
    })
  })

  it('lee el modelo viejo (results.exercises[] con exercise_id)', () => {
    const map = buildOneRmMap({
      legacyResults: [legacy('2026-05-27', [{ exercise_id: SENTADILLA, best_one_rm: 111.7 }])],
    })
    expect(map.get(SENTADILLA).oneRm).toBe(111.7)
    expect(map.get(SENTADILLA).source).toBe('legacy')
  })

  it('por ejercicio gana la evaluación MÁS RECIENTE, sea del modelo que sea', () => {
    const map = buildOneRmMap({
      responses: [response(SENTADILLA, '43.2', '2026-06-01'), response(SENTADILLA, '60', '2026-07-06')],
      legacyResults: [legacy('2026-05-27', [{ exercise_id: SENTADILLA, best_one_rm: 111.7 }])],
    })
    expect(map.get(SENTADILLA).oneRm).toBe(60)
    expect(map.get(SENTADILLA).date).toBe('2026-07-06')
  })

  it('una evaluación vieja NO pisa a una nueva aunque venga después en la lista', () => {
    const map = buildOneRmMap({
      responses: [response(SENTADILLA, '60', '2026-07-06'), response(SENTADILLA, '43.2', '2026-06-01')],
    })
    expect(map.get(SENTADILLA).oneRm).toBe(60)
  })

  it('ignora ejercicios sin 1RM (los que se evalúan por reps quedan afuera)', () => {
    const map = buildOneRmMap({
      responses: [response(SENTADILLA, null, '2026-07-06'), response(ESTOCADA, '', '2026-07-06')],
      legacyResults: [legacy('2026-05-27', [{ exercise_id: 'ex-chin', best_one_rm: null }])],
    })
    expect(map.size).toBe(0)
  })

  it('tolera entradas rotas sin explotar', () => {
    const map = buildOneRmMap({
      responses: [{}, response(null, '60', '2026-07-06')],
      legacyResults: [{ eval_date: '2026-01-01', results: null }, { eval_date: '2026-01-01' }],
    })
    expect(map.size).toBe(0)
  })
})

describe('resolvePrescribedWeight — cadena de resolución', () => {
  const map = buildOneRmMap({ responses: [response(SENTADILLA, '60', '2026-03-10')] })

  it('deriva los kilos del máximo propio', () => {
    const r = resolvePrescribedWeight({
      planExercise: { exercise_id: SENTADILLA, weight_mode: 'pct_1rm', pct_1rm: '70' },
      oneRmMap: map,
      today: '2026-04-01',
    })
    expect(r.status).toBe('derived')
    expect(r.kg).toBe(42)
    expect(r.oneRm).toBe(60)
    expect(r.oneRmDate).toBe('2026-03-10')
    expect(r.usedReference).toBe(false)
  })

  it('sin máximo propio, cae al ejercicio de referencia', () => {
    const r = resolvePrescribedWeight({
      planExercise: {
        exercise_id: ESTOCADA,
        weight_mode: 'pct_1rm',
        pct_1rm: '50',
        rm_reference_exercise_id: SENTADILLA,
      },
      oneRmMap: map,
    })
    expect(r.status).toBe('derived')
    expect(r.kg).toBe(30)
    expect(r.usedReference).toBe(true)
    expect(r.oneRmExerciseId).toBe(SENTADILLA)
  })

  it('el máximo propio le gana al de referencia', () => {
    const r = resolvePrescribedWeight({
      planExercise: {
        exercise_id: SENTADILLA,
        weight_mode: 'pct_1rm',
        pct_1rm: '50',
        rm_reference_exercise_id: ESTOCADA,
      },
      oneRmMap: map,
    })
    expect(r.usedReference).toBe(false)
    expect(r.oneRmExerciseId).toBe(SENTADILLA)
  })

  it('sin evaluación: degradación limpia, se muestra el % y NO se inventa peso', () => {
    const r = resolvePrescribedWeight({
      planExercise: { exercise_id: ESTOCADA, weight_mode: 'pct_1rm', pct_1rm: '70' },
      oneRmMap: map,
    })
    expect(r.status).toBe('missing_1rm')
    expect(r.pct).toBe(70)
    expect(r.kg).toBeNull()
  })

  it('sin mapa de 1RM (plantilla sin persona elegida) también degrada limpio', () => {
    const r = resolvePrescribedWeight({
      planExercise: { exercise_id: SENTADILLA, weight_mode: 'pct_1rm', pct_1rm: '70' },
    })
    expect(r.status).toBe('missing_1rm')
    expect(r.kg).toBeNull()
  })

  it('modo %RM sin porcentaje → missing_pct (le falta al coach, no a la alumna)', () => {
    const r = resolvePrescribedWeight({
      planExercise: { exercise_id: SENTADILLA, weight_mode: 'pct_1rm', pct_1rm: '' },
      oneRmMap: map,
    })
    expect(r.status).toBe('missing_pct')
  })

  it('el % del bloque (circuito) se hereda cuando el ejercicio no tiene el suyo', () => {
    const r = resolvePrescribedWeight({
      planExercise: { exercise_id: SENTADILLA, weight_mode: 'pct_1rm', pct_1rm: '' },
      block: { default_pct_1rm: '50' },
      oneRmMap: map,
    })
    expect(r.status).toBe('derived')
    expect(r.pct).toBe(50)
    expect(r.kg).toBe(30)
  })

  it('el % propio le gana al del bloque', () => {
    const r = resolvePrescribedWeight({
      planExercise: { exercise_id: SENTADILLA, weight_mode: 'pct_1rm', pct_1rm: '80' },
      block: { default_pct_1rm: '50' },
      oneRmMap: map,
    })
    expect(r.kg).toBe(48)
  })

  it('un ejercicio que no es %RM no toca nada', () => {
    const r = resolvePrescribedWeight({
      planExercise: { exercise_id: SENTADILLA, weight_mode: 'with_weight', pct_1rm: '70' },
      oneRmMap: map,
    })
    expect(r.status).toBe('not_pct')
    expect(r.kg).toBeNull()
  })

  it('acepta el modo efectivo ya resuelto por afuera', () => {
    const r = resolvePrescribedWeight({
      planExercise: { exercise_id: SENTADILLA, pct_1rm: '70' },
      weightMode: 'pct_1rm',
      oneRmMap: map,
    })
    expect(r.status).toBe('derived')
  })

  it('marca el 1RM viejo pero igual deriva los kilos', () => {
    const viejo = buildOneRmMap({ responses: [response(SENTADILLA, '60', '2025-01-01')] })
    const r = resolvePrescribedWeight({
      planExercise: { exercise_id: SENTADILLA, weight_mode: 'pct_1rm', pct_1rm: '70' },
      oneRmMap: viejo,
      today: '2026-08-29',
    })
    expect(r.stale).toBe(true)
    expect(r.kg).toBe(42)
  })
})

describe('redondeo y antigüedad', () => {
  it('los kilos caen en escalones de 0.5 (cargables tal cual)', () => {
    expect(roundWeightKg(30.24)).toBe(30)
    expect(roundWeightKg(30.3)).toBe(30.5)
    expect(roundWeightKg(42)).toBe(42)
  })

  it('un 1RM del día no es viejo; uno de hace más de ONE_RM_STALE_DAYS sí', () => {
    expect(isOneRmStale('2026-08-29', '2026-08-29')).toBe(false)
    expect(isOneRmStale('2026-08-01', '2026-08-29')).toBe(false)
    expect(isOneRmStale('2025-08-01', '2026-08-29')).toBe(true)
    expect(ONE_RM_STALE_DAYS).toBe(180)
  })

  it('sin fecha no se marca nada', () => {
    expect(isOneRmStale(null, '2026-08-29')).toBe(false)
    expect(isOneRmStale('2026-01-01', null)).toBe(false)
  })
})
