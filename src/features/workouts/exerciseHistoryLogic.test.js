// ============================================================
// exerciseHistoryLogic.test.js — Q1
// ------------------------------------------------------------
// Tests de las funciones puras que alimentan el preview "Última
// vez" + chat del ejercicio en TodayWorkoutPage.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  pickLastLogPerExercise,
  pickLastBlockLogPerBlock,
  pickLastCoachNotePerExercise,
  pickLastPreviewNotePerExercise,
  countNotesByExercise,
  groupNotesByExercise,
  formatLastLogSummary,
  formatLastBlockLogSummary,
  formatRelativeDate,
} from './exerciseHistoryLogic'

// Helpers de fixture
const PE = [
  { id: 'pe-a-day-a', exercise_id: 'ex-press', section: 'day_a' },
  { id: 'pe-a-day-b', exercise_id: 'ex-press', section: 'day_b' }, // Mismo ejercicio en día B
  { id: 'pe-b', exercise_id: 'ex-squat', section: 'day_a' },
  { id: 'pe-c', exercise_id: 'ex-dead', section: 'day_a' },
]

describe('pickLastLogPerExercise', () => {
  it('agrupa por exercise_id global, no por plan_exercise_id', () => {
    const logs = [
      // Mismo ejercicio (Press), dos plan_exercise_id distintos, distintas fechas
      { id: 'l1', plan_exercise_id: 'pe-a-day-a', logged_date: '2026-05-20', completed: true },
      { id: 'l2', plan_exercise_id: 'pe-a-day-b', logged_date: '2026-05-22', completed: true },
      // Otro ejercicio
      { id: 'l3', plan_exercise_id: 'pe-b', logged_date: '2026-05-19', completed: true },
    ]
    const map = pickLastLogPerExercise(logs, PE)
    expect(map.size).toBe(2)
    // Press: gana el más reciente (l2 de día B)
    expect(map.get('ex-press').id).toBe('l2')
    expect(map.get('ex-press')._exercise_id).toBe('ex-press')
    expect(map.get('ex-squat').id).toBe('l3')
  })

  it('doc 49: agrupa cross-plan usando exercise_id embebido en el join', () => {
    // Logs de un plan anterior cuyos plan_exercise_id NO están en PE
    // (simula el plan activo). El reductor debe resolver el exercise_id
    // desde log.plan_exercise.exercise_id (join embebido).
    const logs = [
      // Plan activo (pe-b está en PE) — más viejo
      { id: 'l1', plan_exercise_id: 'pe-b', logged_date: '2026-05-10', completed: true },
      // Plan anterior (pe-old NO está en PE) pero mismo ejercicio ex-squat — más reciente
      {
        id: 'l2',
        plan_exercise_id: 'pe-old',
        logged_date: '2026-05-20',
        completed: true,
        plan_exercise: { exercise_id: 'ex-squat' },
      },
    ]
    const map = pickLastLogPerExercise(logs, PE)
    // Gana l2 (más reciente) y se agrupa bajo ex-squat aunque pe-old no esté en PE
    expect(map.get('ex-squat').id).toBe('l2')
    expect(map.get('ex-squat')._exercise_id).toBe('ex-squat')
  })

  it('omite logs no completados cuando completedOnly=true (default)', () => {
    const logs = [
      { id: 'l1', plan_exercise_id: 'pe-b', logged_date: '2026-05-22', completed: false },
      { id: 'l2', plan_exercise_id: 'pe-b', logged_date: '2026-05-20', completed: true },
    ]
    const map = pickLastLogPerExercise(logs, PE)
    expect(map.get('ex-squat').id).toBe('l2')
  })

  it('respeta excludeDate (no muestra la sesión que estoy cargando hoy)', () => {
    const logs = [
      { id: 'l1', plan_exercise_id: 'pe-b', logged_date: '2026-05-23', completed: true },
      { id: 'l2', plan_exercise_id: 'pe-b', logged_date: '2026-05-20', completed: true },
    ]
    const map = pickLastLogPerExercise(logs, PE, { excludeDate: '2026-05-23' })
    expect(map.get('ex-squat').id).toBe('l2')
  })

  it('ignora logs con plan_exercise_id desconocido (plan_exercise borrado)', () => {
    const logs = [
      {
        id: 'huerfano',
        plan_exercise_id: 'pe-no-existe',
        logged_date: '2026-05-22',
        completed: true,
      },
    ]
    const map = pickLastLogPerExercise(logs, PE)
    expect(map.size).toBe(0)
  })

  it('tiebreak por id cuando misma fecha', () => {
    const logs = [
      { id: 'lA', plan_exercise_id: 'pe-b', logged_date: '2026-05-22', completed: true },
      { id: 'lZ', plan_exercise_id: 'pe-b', logged_date: '2026-05-22', completed: true },
    ]
    const map = pickLastLogPerExercise(logs, PE)
    // 'lZ' > 'lA' lexicográficamente, así que gana lZ
    expect(map.get('ex-squat').id).toBe('lZ')
  })

  it('inputs vacíos / nulos devuelven Map vacío', () => {
    expect(pickLastLogPerExercise([], PE).size).toBe(0)
    expect(pickLastLogPerExercise(null, PE).size).toBe(0)
    expect(pickLastLogPerExercise([{ id: 'l' }], []).size).toBe(0)
  })
})

describe('pickLastBlockLogPerBlock', () => {
  it('agrupa por plan_block_id, omite no completados, respeta excludeDate', () => {
    const blockLogs = [
      { id: 'bl1', plan_block_id: 'bk-1', logged_date: '2026-05-22', completed: true },
      { id: 'bl2', plan_block_id: 'bk-1', logged_date: '2026-05-23', completed: true },
      { id: 'bl3', plan_block_id: 'bk-2', logged_date: '2026-05-22', completed: false },
      { id: 'bl4', plan_block_id: 'bk-3', logged_date: '2026-05-20', completed: true },
    ]
    const map = pickLastBlockLogPerBlock(blockLogs, { excludeDate: '2026-05-23' })
    expect(map.size).toBe(2)
    expect(map.get('bk-1').id).toBe('bl1') // bl2 excluido por fecha
    expect(map.get('bk-3').id).toBe('bl4')
    expect(map.has('bk-2')).toBe(false) // bl3 no completado
  })

  it('inputs vacíos / nulos no rompen', () => {
    expect(pickLastBlockLogPerBlock([]).size).toBe(0)
    expect(pickLastBlockLogPerBlock(null).size).toBe(0)
  })
})

describe('pickLastCoachNotePerExercise', () => {
  const notes = [
    {
      id: 'n1',
      author_role: 'coach',
      context_type: 'exercise',
      exercise_id: 'ex-press',
      visibility: 'shared',
      created_at: '2026-05-18T12:00:00Z',
      body: 'antigua',
    },
    {
      id: 'n2',
      author_role: 'coach',
      context_type: 'exercise',
      exercise_id: 'ex-press',
      visibility: 'shared',
      created_at: '2026-05-20T12:00:00Z',
      body: 'reciente',
    },
    {
      id: 'n3',
      author_role: 'student',
      context_type: 'exercise',
      exercise_id: 'ex-press',
      visibility: 'shared',
      created_at: '2026-05-21T12:00:00Z',
      body: 'del alumno (más nueva pero no cuenta)',
    },
    {
      id: 'n4',
      author_role: 'coach',
      context_type: 'workout_log',
      exercise_id: 'ex-press',
      visibility: 'shared',
      created_at: '2026-05-22T12:00:00Z',
      body: 'workout_log (doc 52: ahora SÍ cuenta, es la más reciente)',
    },
    {
      id: 'n5',
      author_role: 'coach',
      context_type: 'exercise',
      exercise_id: 'ex-squat',
      visibility: 'shared',
      created_at: '2026-05-15T12:00:00Z',
      body: 'squat note',
    },
    {
      id: 'n6',
      author_role: 'coach',
      context_type: 'exercise',
      exercise_id: 'ex-press',
      visibility: 'coach_private',
      created_at: '2026-05-23T12:00:00Z',
      body: 'privada — no contar',
    },
    {
      id: 'n7',
      author_role: 'coach',
      context_type: 'exercise',
      exercise_id: 'ex-press',
      visibility: 'shared',
      deleted_at: '2026-05-19T00:00:00Z',
      created_at: '2026-05-19T00:00:00Z',
      body: 'borrada — no contar',
    },
  ]

  it('toma la nota MÁS reciente del coach (cualquier context_type con exercise_id), ignorando alumno/privada/borrada', () => {
    const map = pickLastCoachNotePerExercise(notes)
    // doc 52: n4 (workout_log, coach, 05-22) ahora gana sobre n2 (exercise, 05-20)
    expect(map.get('ex-press').id).toBe('n4')
    expect(map.get('ex-squat').id).toBe('n5')
  })

  it('no devuelve entries cuando solo hay notas del alumno', () => {
    const onlyStudent = [
      {
        id: 's',
        author_role: 'student',
        context_type: 'exercise',
        exercise_id: 'ex-press',
        visibility: 'shared',
        created_at: '2026-05-22T00:00:00Z',
      },
    ]
    expect(pickLastCoachNotePerExercise(onlyStudent).size).toBe(0)
  })

  it('inputs vacíos / nulos no rompen', () => {
    expect(pickLastCoachNotePerExercise([]).size).toBe(0)
    expect(pickLastCoachNotePerExercise(null).size).toBe(0)
  })
})

describe('countNotesByExercise', () => {
  it('cuenta todas las notas shared con exercise_id, ambos roles y cualquier context_type', () => {
    const notes = [
      {
        id: 'a',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'coach',
      },
      {
        id: 'b',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'student',
      },
      {
        id: 'c',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'coach_private',
        author_role: 'coach',
      },
      {
        id: 'd',
        context_type: 'exercise',
        exercise_id: 'ex-2',
        visibility: 'shared',
        author_role: 'coach',
      },
      {
        id: 'e',
        context_type: 'workout_log',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'student',
      },
      {
        id: 'f',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'coach',
        deleted_at: 'x',
      },
    ]
    const map = countNotesByExercise(notes)
    // doc 52: 'e' (workout_log) ahora cuenta → a + b + e (c privada, f borrada)
    expect(map.get('ex-1')).toBe(3)
    expect(map.get('ex-2')).toBe(1)
  })

  it('inputs vacíos devuelven map vacío', () => {
    expect(countNotesByExercise([]).size).toBe(0)
    expect(countNotesByExercise(null).size).toBe(0)
  })
})

describe('groupNotesByExercise', () => {
  it('agrupa por exercise_id, orden ASC cronológico', () => {
    const notes = [
      {
        id: 'late',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'coach',
        created_at: '2026-05-22T10:00:00Z',
      },
      {
        id: 'mid',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'student',
        created_at: '2026-05-20T10:00:00Z',
      },
      {
        id: 'early',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'coach',
        created_at: '2026-05-18T10:00:00Z',
      },
      {
        id: 'other',
        context_type: 'exercise',
        exercise_id: 'ex-2',
        visibility: 'shared',
        author_role: 'coach',
        created_at: '2026-05-15T10:00:00Z',
      },
    ]
    const map = groupNotesByExercise(notes)
    expect(map.get('ex-1').map((n) => n.id)).toEqual(['early', 'mid', 'late'])
    expect(map.get('ex-2').length).toBe(1)
  })

  it('excluye coach_private + deleted, pero incluye workout_log con exercise_id (doc 52)', () => {
    const notes = [
      {
        id: 'priv',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'coach_private',
        author_role: 'coach',
        created_at: '2026-05-22T10:00:00Z',
      },
      {
        id: 'del',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'coach',
        created_at: '2026-05-21T10:00:00Z',
        deleted_at: 'x',
      },
      {
        id: 'wlog',
        context_type: 'workout_log',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'coach',
        created_at: '2026-05-21T10:00:00Z',
      },
      {
        id: 'ok',
        context_type: 'exercise',
        exercise_id: 'ex-1',
        visibility: 'shared',
        author_role: 'student',
        created_at: '2026-05-20T10:00:00Z',
      },
    ]
    const map = groupNotesByExercise(notes)
    // doc 52: 'wlog' (workout_log) ahora entra; orden ASC → ok (05-20), wlog (05-21)
    expect(map.get('ex-1').map((n) => n.id)).toEqual(['ok', 'wlog'])
  })
})

describe('formatLastLogSummary', () => {
  it('extrae peso máximo + reps máximo + PSE del jsonb', () => {
    const log = {
      actual_weights_jsonb: [20, 20, 22.5],
      actual_reps_jsonb: [8, 8, 6],
      actual_sets: 3,
      perceived_difficulty: 8,
    }
    expect(formatLastLogSummary(log)).toBe('22.5kg · 8r · PSE 8')
  })

  it('fallback a legacy actual_weights string', () => {
    const log = {
      actual_weights: '[20, 22.5]',
      actual_reps: '[8, 8]',
      actual_sets: 2,
    }
    expect(formatLastLogSummary(log)).toBe('22.5kg · 8r')
  })

  it('bodyweight: solo reps (toma el máximo del array)', () => {
    const log = {
      actual_weights_jsonb: null,
      actual_reps_jsonb: [12, 10],
      actual_sets: 2,
    }
    expect(formatLastLogSummary(log)).toBe('12r')
  })

  it('sin peso ni reps, cae a sets', () => {
    const log = { actual_sets: 3, perceived_difficulty: 7 }
    expect(formatLastLogSummary(log)).toBe('3s · PSE 7')
  })

  it('null no rompe', () => {
    expect(formatLastLogSummary(null)).toBe('')
    expect(formatLastLogSummary(undefined)).toBe('')
  })

  it('formato numérico: enteros sin decimales, decimales sin trailing 0', () => {
    const log = { actual_weights_jsonb: [22.5], actual_reps_jsonb: [10] }
    expect(formatLastLogSummary(log)).toBe('22.5kg · 10r')

    const log2 = { actual_weights_jsonb: [22.0], actual_reps_jsonb: [10] }
    expect(formatLastLogSummary(log2)).toBe('22kg · 10r')
  })
})

describe('formatLastBlockLogSummary', () => {
  it('min + rondas + PSE', () => {
    const bl = { actual_minutes: 20, actual_rounds: 3, perceived_difficulty: 7 }
    expect(formatLastBlockLogSummary(bl)).toBe('20 min · 3 rondas · PSE 7')
  })

  it('omite partes faltantes', () => {
    expect(formatLastBlockLogSummary({ actual_minutes: 15 })).toBe('15 min')
    expect(formatLastBlockLogSummary({ perceived_difficulty: 6 })).toBe('PSE 6')
  })

  it('null no rompe', () => {
    expect(formatLastBlockLogSummary(null)).toBe('')
  })
})

describe('formatRelativeDate', () => {
  const today = new Date('2026-05-23T15:00:00Z')

  it('hoy / ayer / hace N días / DD/MM', () => {
    expect(formatRelativeDate('2026-05-23', today)).toBe('hoy')
    expect(formatRelativeDate('2026-05-22', today)).toBe('ayer')
    expect(formatRelativeDate('2026-05-20', today)).toBe('hace 3 días')
    expect(formatRelativeDate('2026-05-18', today)).toBe('hace 5 días')
    expect(formatRelativeDate('2026-05-15', today)).toBe('15/05')
    expect(formatRelativeDate('2025-12-30', today)).toBe('30/12')
  })

  it('vacío / null devuelve string vacío', () => {
    expect(formatRelativeDate('', today)).toBe('')
    expect(formatRelativeDate(null, today)).toBe('')
  })
})

describe('pickLastPreviewNotePerExercise', () => {
  const base = { context_type: 'exercise', visibility: 'shared' }

  it('prioriza la nota del coach aunque el alumno haya comentado después', () => {
    const notes = [
      { ...base, id: 'c1', author_role: 'coach', exercise_id: 'ex-press', created_at: '2026-07-20T10:00:00Z', body: 'coach vieja' },
      { ...base, id: 'c2', author_role: 'coach', exercise_id: 'ex-press', created_at: '2026-07-21T10:00:00Z', body: 'coach nueva' },
      { ...base, id: 's1', author_role: 'student', exercise_id: 'ex-press', created_at: '2026-07-23T10:00:00Z', body: 'alumno más nueva' },
    ]
    const map = pickLastPreviewNotePerExercise(notes)
    expect(map.get('ex-press').id).toBe('c2')
    expect(map.get('ex-press').author_role).toBe('coach')
  })

  it('cae al último comentario del alumno cuando no hay nota del coach', () => {
    const notes = [
      { ...base, id: 's1', author_role: 'student', exercise_id: 'ex-row', created_at: '2026-07-20T10:00:00Z', body: 'alumno vieja' },
      { ...base, id: 's2', author_role: 'student', exercise_id: 'ex-row', created_at: '2026-07-22T10:00:00Z', body: 'alumno nueva' },
    ]
    const map = pickLastPreviewNotePerExercise(notes)
    expect(map.get('ex-row').id).toBe('s2')
    expect(map.get('ex-row').author_role).toBe('student')
  })

  // v35 — en modo coach la prioridad se invierte: la coach ya sabe lo que
  // escribió ella, lo que necesita ver es el comentario de la alumna.
  it('prefer="student" invierte la prioridad (vista de la coach)', () => {
    const notes = [
      { ...base, id: 'c1', author_role: 'coach', exercise_id: 'ex-press', created_at: '2026-07-25T10:00:00Z', body: 'coach nueva' },
      { ...base, id: 's1', author_role: 'student', exercise_id: 'ex-press', created_at: '2026-07-20T10:00:00Z', body: 'alumna vieja' },
    ]
    const map = pickLastPreviewNotePerExercise(notes, { prefer: 'student' })
    expect(map.get('ex-press').id).toBe('s1')
    expect(map.get('ex-press').author_role).toBe('student')
  })

  it('prefer="student" cae al coach si la alumna no comentó ese ejercicio', () => {
    const notes = [
      { ...base, id: 'c1', author_role: 'coach', exercise_id: 'ex-press', created_at: '2026-07-25T10:00:00Z', body: 'coach' },
    ]
    const map = pickLastPreviewNotePerExercise(notes, { prefer: 'student' })
    expect(map.get('ex-press').author_role).toBe('coach')
  })

  it('mezcla por ejercicio: coach en uno, alumno en otro', () => {
    const notes = [
      { ...base, id: 'c1', author_role: 'coach', exercise_id: 'ex-press', created_at: '2026-07-20T10:00:00Z', body: 'coach press' },
      { ...base, id: 's1', author_role: 'student', exercise_id: 'ex-squat', created_at: '2026-07-20T10:00:00Z', body: 'alumno squat' },
    ]
    const map = pickLastPreviewNotePerExercise(notes)
    expect(map.get('ex-press').author_role).toBe('coach')
    expect(map.get('ex-squat').author_role).toBe('student')
  })

  it('ignora coach_private, borradas y notas sin exercise_id (cae al alumno)', () => {
    const notes = [
      { ...base, id: 'p1', author_role: 'coach', exercise_id: 'ex-press', visibility: 'coach_private', created_at: '2026-07-25T10:00:00Z', body: 'privada' },
      { ...base, id: 'd1', author_role: 'coach', exercise_id: 'ex-press', deleted_at: '2026-07-24T10:00:00Z', created_at: '2026-07-24T10:00:00Z', body: 'borrada' },
      { ...base, id: 's1', author_role: 'student', exercise_id: 'ex-press', created_at: '2026-07-20T10:00:00Z', body: 'alumno visible' },
      { ...base, id: 'f1', author_role: 'coach', exercise_id: null, created_at: '2026-07-26T10:00:00Z', body: 'libre sin ejercicio' },
    ]
    const map = pickLastPreviewNotePerExercise(notes)
    expect(map.get('ex-press').id).toBe('s1')
    expect(map.size).toBe(1)
  })

  it('inputs vacíos / nulos no rompen', () => {
    expect(pickLastPreviewNotePerExercise([]).size).toBe(0)
    expect(pickLastPreviewNotePerExercise(null).size).toBe(0)
  })
})
