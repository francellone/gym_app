// ============================================================
// helpers — tests de evals exercise-based (doc 38, fase 1)
// ------------------------------------------------------------
// Cubre: isExerciseBasedEval, agrupación por día, mapeo del jsonb de
// responses y la ida/vuelta UI ↔ DB de las filas de plan_exercises.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  isExerciseBasedEval,
  groupEvalExercisesByDay,
  buildExerciseResponseJson,
  uiEvalExerciseToDB,
  dbEvalExerciseToUI,
  emptyEvalExercise,
  EXERCISE_EVAL_TYPES,
  EVAL_TYPES,
  METHODS,
} from './helpers'

describe('isExerciseBasedEval', () => {
  it('true para los tipos exercise-based', () => {
    for (const t of ['one_rm', 'max_reps', 'custom', 'mixed']) {
      expect(isExerciseBasedEval(t)).toBe(true)
    }
  })
  it('false para los protocolos enteros', () => {
    for (const t of ['power', 'cardio', 'body_comp', 'scored']) {
      expect(isExerciseBasedEval(t)).toBe(false)
    }
  })
  it('false para tipo desconocido / vacío', () => {
    expect(isExerciseBasedEval('')).toBe(false)
    expect(isExerciseBasedEval(undefined)).toBe(false)
  })
})

describe('mixed type + EXERCISE_EVAL_TYPES', () => {
  it('mixed está en EVAL_TYPES con METHODS vacío', () => {
    expect(EVAL_TYPES.find((e) => e.key === 'mixed')).toBeTruthy()
    expect(METHODS.mixed).toEqual([])
  })
  it('EXERCISE_EVAL_TYPES es el subset one_rm/max_reps/custom', () => {
    expect(EXERCISE_EVAL_TYPES.map((e) => e.key)).toEqual(['one_rm', 'max_reps', 'custom'])
  })
})

describe('groupEvalExercisesByDay', () => {
  it('agrupa por section y ordena por order_index', () => {
    const rows = [
      { id: '1', section: 'day_a', order_index: 1 },
      { id: '2', section: 'day_b', order_index: 0 },
      { id: '3', section: 'day_a', order_index: 0 },
    ]
    const grouped = groupEvalExercisesByDay(rows)
    expect(grouped.day_a.map((r) => r.id)).toEqual(['3', '1'])
    expect(grouped.day_b.map((r) => r.id)).toEqual(['2'])
  })
  it('default a day_a cuando falta section', () => {
    const grouped = groupEvalExercisesByDay([{ id: 'x', order_index: 0 }])
    expect(grouped.day_a).toHaveLength(1)
  })
  it('lista vacía → objeto vacío', () => {
    expect(groupEvalExercisesByDay([])).toEqual({})
    expect(groupEvalExercisesByDay()).toEqual({})
  })
})

describe('buildExerciseResponseJson', () => {
  it('one_rm → weight_kg + reps + one_rm_estimated', () => {
    const json = buildExerciseResponseJson('one_rm', {
      weight_kg: '80',
      reps: '5',
      one_rm_estimated: 90,
    })
    expect(json).toEqual({ weight_kg: '80', reps: '5', one_rm_estimated: 90 })
  })
  it('max_reps → solo reps', () => {
    expect(buildExerciseResponseJson('max_reps', { reps: '20' })).toEqual({ reps: '20' })
  })
  it('custom → value + unit', () => {
    expect(buildExerciseResponseJson('custom', { value: '12', unit: 'cm' })).toEqual({
      value: '12',
      unit: 'cm',
    })
  })
  it('default (sin tipo) cae a value/unit vacíos', () => {
    expect(buildExerciseResponseJson(undefined, {})).toEqual({ value: '', unit: '' })
  })
})

describe('uiEvalExerciseToDB ↔ dbEvalExerciseToUI', () => {
  it('uiEvalExerciseToDB mapea los campos de evaluación', () => {
    const ui = emptyEvalExercise('day_b', 'max_reps')
    ui.exercise_id = 'ex-1'
    ui.suggested_sets = '3'
    ui.suggested_reps_array = ['10']
    ui.expected_value = '15'
    ui.expected_unit = 'reps'
    ui.mandatory = true
    ui.instructions = 'al fallo'
    const db = uiEvalExerciseToDB(ui, 'plan-1', 'day_b', 2)
    expect(db).toMatchObject({
      plan_id: 'plan-1',
      exercise_id: 'ex-1',
      section: 'day_b',
      order_index: 2,
      suggested_sets: 3,
      eval_type: 'max_reps',
      eval_method: 'pushup',
      expected_value: '15',
      expected_unit: 'reps',
      mandatory: true,
      instructions: 'al fallo',
      block_id: null,
    })
  })

  it('round-trip DB → UI preserva tipo/método/expected/mandatory', () => {
    const dbRow = {
      id: 'pe-1',
      exercise_id: 'ex-9',
      section: 'day_a',
      order_index: 0,
      suggested_sets: 2,
      suggested_reps: '5',
      suggested_weights: '60',
      eval_type: 'one_rm',
      eval_method: 'epley',
      expected_value: '100',
      expected_unit: 'kg',
      mandatory: true,
      instructions: 'calienta primero',
      exercises: { video_url: 'http://x' },
    }
    const ui = dbEvalExerciseToUI(dbRow)
    expect(ui.eval_type).toBe('one_rm')
    expect(ui.eval_method).toBe('epley')
    expect(ui.expected_value).toBe('100')
    expect(ui.mandatory).toBe(true)
    expect(ui.video_url).toBe('http://x')
    // y de vuelta a DB
    const back = uiEvalExerciseToDB(ui, 'plan-1', 'day_a', 0)
    expect(back.eval_type).toBe('one_rm')
    expect(back.eval_method).toBe('epley')
    expect(back.mandatory).toBe(true)
  })

  it('mandatory siempre boolean (NOT NULL en DB)', () => {
    const ui = emptyEvalExercise('day_a', 'custom')
    const db = uiEvalExerciseToDB(ui, 'p', 'day_a', 0)
    expect(typeof db.mandatory).toBe('boolean')
    expect(db.mandatory).toBe(false)
  })
})
