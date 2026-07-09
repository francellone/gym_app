// ============================================================
// workouts/api — tests del builder de save_workout_log
// ------------------------------------------------------------
// Foco en buildSaveWorkoutLogArgs: el shape de los 16 p_* y el
// stripping de keys "_internas". Es el contract test entre el front
// y la RPC `save_workout_log` del back.
// ============================================================
import { describe, it, expect } from 'vitest'
import { buildSaveWorkoutLogArgs, extractNoteBody } from './api'

const baseInputs = {
  profile: { id: 'student-1' },
  assignment: { plan_id: 'plan-1' },
  planExerciseId: 'pe-1',
  selectedDate: '2026-05-21',
  isToday: true,
  data: {
    p_reps: [10, 8, 6],
    p_weights: [60, 65, 70],
    p_weight_mode: 'global',
    p_unilateral: false,
    p_reps_unit: 'reps',
    p_actual_sets: 3,
    p_perceived_difficulty: 7,
    p_perceived_difficulty_label: 'Difícil',
    p_notes: null,
    p_completed: true,
  },
  existingLog: null,
}

describe('buildSaveWorkoutLogArgs', () => {
  it('INSERT: p_log_id es null cuando no hay existingLog', () => {
    const args = buildSaveWorkoutLogArgs(baseInputs)
    expect(args.p_log_id).toBeNull()
  })

  it('UPDATE: p_log_id viene del existingLog', () => {
    const args = buildSaveWorkoutLogArgs({
      ...baseInputs,
      existingLog: { id: 'log-existing' },
    })
    expect(args.p_log_id).toBe('log-existing')
  })

  it('arma los 6 p_* base + spread del data', () => {
    const args = buildSaveWorkoutLogArgs(baseInputs)
    expect(args).toMatchObject({
      p_log_id: null,
      p_student_id: 'student-1',
      p_plan_id: 'plan-1',
      p_plan_exercise_id: 'pe-1',
      p_logged_date: '2026-05-21',
      p_logged_late: false, // isToday=true → late=false
      p_reps: [10, 8, 6],
      p_weights: [60, 65, 70],
      p_weight_mode: 'global',
      p_unilateral: false,
      p_reps_unit: 'reps',
      p_actual_sets: 3,
      p_perceived_difficulty: 7,
      p_perceived_difficulty_label: 'Difícil',
      p_notes: null,
      p_completed: true,
    })
  })

  it('p_logged_late es true cuando isToday=false (registro retroactivo)', () => {
    const args = buildSaveWorkoutLogArgs({ ...baseInputs, isToday: false })
    expect(args.p_logged_late).toBe(true)
  })

  // v33 — modo coach: el dueño del log es studentId (alumno), no el
  // usuario logueado. La autoría real (logged_by/source) la deriva la RPC
  // de auth.uid() server-side, no viaja en los args.
  describe('modo coach (studentId override)', () => {
    it('sin studentId, p_student_id = profile.id (modo alumno, backcompat)', () => {
      const args = buildSaveWorkoutLogArgs(baseInputs)
      expect(args.p_student_id).toBe('student-1')
    })

    it('con studentId, p_student_id = studentId (coach registra por el alumno)', () => {
      const args = buildSaveWorkoutLogArgs({
        ...baseInputs,
        profile: { id: 'coach-1' },
        studentId: 'student-9',
      })
      expect(args.p_student_id).toBe('student-9')
    })

    it('no expone p_logged_by ni p_source (autoría solo server-side)', () => {
      const args = buildSaveWorkoutLogArgs({
        ...baseInputs,
        profile: { id: 'coach-1' },
        studentId: 'student-9',
      })
      expect(args).not.toHaveProperty('p_logged_by')
      expect(args).not.toHaveProperty('p_source')
    })
  })

  it('filtra keys con prefijo "_" (no llegan a la RPC)', () => {
    const args = buildSaveWorkoutLogArgs({
      ...baseInputs,
      data: {
        ...baseInputs.data,
        _noteBody: 'observación interna',
        _otroInterno: 'whatever',
      },
    })
    expect(args).not.toHaveProperty('_noteBody')
    expect(args).not.toHaveProperty('_otroInterno')
    // pero los p_* sí están
    expect(args.p_reps).toEqual([10, 8, 6])
  })

  it('preserva claves que NO empiezan con "_" aunque tengan underscore en el medio', () => {
    const args = buildSaveWorkoutLogArgs({
      ...baseInputs,
      data: {
        ...baseInputs.data,
        actual_reps_unit: 'reps_per_side', // no empieza con _
      },
    })
    expect(args.actual_reps_unit).toBe('reps_per_side')
  })

  it('data vacío o null produce sólo los 6 p_* base', () => {
    const args = buildSaveWorkoutLogArgs({ ...baseInputs, data: null })
    expect(Object.keys(args).sort()).toEqual(
      [
        'p_log_id',
        'p_logged_date',
        'p_logged_late',
        'p_plan_exercise_id',
        'p_plan_id',
        'p_student_id',
      ].sort()
    )
  })

  describe('validación de inputs requeridos', () => {
    it('tira si falta profile.id', () => {
      expect(() => buildSaveWorkoutLogArgs({ ...baseInputs, profile: {} })).toThrow(/profile.id/)
    })

    it('tira si falta assignment.plan_id', () => {
      expect(() => buildSaveWorkoutLogArgs({ ...baseInputs, assignment: {} })).toThrow(
        /assignment.plan_id/
      )
    })

    it('tira si falta planExerciseId', () => {
      expect(() => buildSaveWorkoutLogArgs({ ...baseInputs, planExerciseId: null })).toThrow(
        /planExerciseId/
      )
    })

    it('tira si falta selectedDate', () => {
      expect(() => buildSaveWorkoutLogArgs({ ...baseInputs, selectedDate: '' })).toThrow(
        /selectedDate/
      )
    })
  })
})

describe('extractNoteBody', () => {
  it('extrae _noteBody si existe', () => {
    expect(extractNoteBody({ _noteBody: 'observación' })).toBe('observación')
  })

  it('devuelve "" si no hay _noteBody', () => {
    expect(extractNoteBody({})).toBe('')
    expect(extractNoteBody(null)).toBe('')
    expect(extractNoteBody(undefined)).toBe('')
  })

  it('devuelve "" si _noteBody es falsy', () => {
    expect(extractNoteBody({ _noteBody: '' })).toBe('')
    expect(extractNoteBody({ _noteBody: null })).toBe('')
  })
})
