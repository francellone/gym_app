// ============================================================
// %RM (v39, etapa 2) — prescripción por porcentaje del máximo
// ------------------------------------------------------------
// Cubre las tres piezas que hacen que el % sobreviva el viaje
// UI → DB → UI, la herencia bloque → ejercicio, y la regla de que
// el alumno SIEMPRE registra kilos reales (nunca '%RM' en un log).
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  WEIGHT_MODES,
  WEIGHT_MODES_LOGGABLE,
  WEIGHT_MODE_BY_KEY,
  getEffectivePct1rm,
  getLoggingWeightMode,
  emptyPlanExercise,
  emptyCircuitBlock,
  emptyCircuitExercise,
  dbExToUIEx,
  uiExToDBEx,
  dbBlockToUI,
  uiBlockToDB,
} from './helpers'

describe('WEIGHT_MODES: %RM es modo de prescripción, no de registro', () => {
  it('pct_1rm existe y no muestra inputs de kilos en el plan', () => {
    const m = WEIGHT_MODE_BY_KEY['pct_1rm']
    expect(m).toBeTruthy()
    expect(m.showsWeightInputs).toBe(false)
    expect(m.usesPct).toBe(true)
    expect(m.planOnly).toBe(true)
  })

  it('WEIGHT_MODES_LOGGABLE excluye pct_1rm (catálogo y registro del alumno)', () => {
    expect(WEIGHT_MODES.map((m) => m.key)).toContain('pct_1rm')
    expect(WEIGHT_MODES_LOGGABLE.map((m) => m.key)).not.toContain('pct_1rm')
    expect(WEIGHT_MODES_LOGGABLE).toHaveLength(WEIGHT_MODES.length - 1)
  })

  it('getLoggingWeightMode mapea pct_1rm → with_weight y no toca el resto', () => {
    expect(getLoggingWeightMode('pct_1rm')).toBe('with_weight')
    expect(getLoggingWeightMode('bodyweight')).toBe('bodyweight')
    expect(getLoggingWeightMode('barbell_only')).toBe('barbell_only')
    expect(getLoggingWeightMode(null)).toBe('with_weight')
  })
})

describe('getEffectivePct1rm (herencia ejercicio > bloque)', () => {
  it('el % propio del ejercicio gana', () => {
    expect(
      getEffectivePct1rm({ planExercise: { pct_1rm: '70' }, block: { default_pct_1rm: '50' } })
    ).toBe(70)
  })

  it('sin % propio hereda el default del bloque', () => {
    expect(
      getEffectivePct1rm({ planExercise: { pct_1rm: '' }, block: { default_pct_1rm: '50' } })
    ).toBe(50)
  })

  it('sin nada devuelve null (no inventa un porcentaje)', () => {
    expect(getEffectivePct1rm({ planExercise: {}, block: {} })).toBeNull()
    expect(getEffectivePct1rm()).toBeNull()
  })
})

describe('round-trip del ejercicio: UI → DB → UI', () => {
  it('conserva pct_1rm y el ejercicio de referencia', () => {
    const ui = {
      ...emptyPlanExercise('day_a'),
      exercise_id: 'ex-1',
      suggested_sets: '3',
      weight_mode: 'pct_1rm',
      pct_1rm: '65',
      rm_reference_exercise_id: 'ref-1',
    }
    const db = uiExToDBEx(ui, 'plan-1', 'day_a', 0, 'block-1')
    expect(db.weight_mode).toBe('pct_1rm')
    expect(db.pct_1rm).toBe(65)
    expect(db.rm_reference_exercise_id).toBe('ref-1')

    const back = dbExToUIEx({ ...db, id: 'pe-1', block_label: 'A1' })
    expect(back.weight_mode).toBe('pct_1rm')
    expect(back.pct_1rm).toBe('65')
    expect(back.rm_reference_exercise_id).toBe('ref-1')
  })

  it('cambiar de modo limpia el % (sin prescripción fantasma)', () => {
    const ui = {
      ...emptyPlanExercise('day_a'),
      weight_mode: 'with_weight',
      pct_1rm: '65',
      rm_reference_exercise_id: 'ref-1',
    }
    const db = uiExToDBEx(ui, 'plan-1', 'day_a', 0)
    expect(db.pct_1rm).toBeNull()
    expect(db.rm_reference_exercise_id).toBeNull()
  })

  it('modo %RM sin porcentaje propio guarda null (hereda del bloque)', () => {
    const ui = { ...emptyCircuitExercise(), weight_mode: 'pct_1rm', pct_1rm: '' }
    const db = uiExToDBEx(ui, 'plan-1', 'day_a', 0, 'block-1')
    expect(db.weight_mode).toBe('pct_1rm')
    expect(db.pct_1rm).toBeNull()
  })
})

describe('round-trip del bloque circuito: default_pct_1rm', () => {
  it('el circuito persiste el default y vuelve como string', () => {
    const block = { ...emptyCircuitBlock('day_a'), default_pct_1rm: '50' }
    const db = uiBlockToDB(block, 'plan-1', 0)
    expect(db.default_pct_1rm).toBe(50)

    const back = dbBlockToUI({ ...db, id: 'b-1' }, [])
    expect(back.default_pct_1rm).toBe('50')
  })

  it('vacío → null (no 0)', () => {
    const db = uiBlockToDB({ ...emptyCircuitBlock('day_a'), default_pct_1rm: '' }, 'plan-1', 0)
    expect(db.default_pct_1rm).toBeNull()
  })

  it('un bloque de fuerza no manda default_pct_1rm', () => {
    const db = uiBlockToDB(
      { section: 'day_a', block_type: 'strength', default_pct_1rm: '50' },
      'plan-1',
      0
    )
    expect(db.default_pct_1rm).toBeNull()
  })
})
