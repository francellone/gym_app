import { describe, it, expect } from 'vitest'
import { exerciseMessageTarget, pickPlanExercise, lastConversation } from './exerciseChatContext'

const n = (id, author_role, extra = {}) => ({
  id,
  author_role,
  visibility: 'shared',
  deleted_at: null,
  source_note_id: null,
  ...extra,
})

describe('exerciseMessageTarget', () => {
  it('responde al último mensaje del otro lado', () => {
    const notes = [n('c1', 'coach'), n('s1', 'student'), n('c2', 'coach'), n('s2', 'student')]
    expect(exerciseMessageTarget(notes, 'student')).toEqual({ kind: 'reply', parentId: 'c2' })
    expect(exerciseMessageTarget(notes, 'coach')).toEqual({ kind: 'reply', parentId: 's2' })
  })
  it('sin mensajes del otro lado (o solo copias/privadas) → comentario nuevo', () => {
    expect(exerciseMessageTarget([n('s1', 'student')], 'student')).toEqual({ kind: 'new' })
    expect(
      exerciseMessageTarget(
        [
          n('cp', 'coach', { source_note_id: 'x' }),
          n('pr', 'coach', { visibility: 'coach_private' }),
        ],
        'student'
      )
    ).toEqual({ kind: 'new' })
    expect(exerciseMessageTarget([], 'coach')).toEqual({ kind: 'new' })
  })
})

describe('pickPlanExercise', () => {
  const pes = [
    { id: 'a', exercise_id: 'sq', section: 'day_a' },
    { id: 'b', exercise_id: 'sq', section: 'day_b' },
    { id: 'm', exercise_id: 'mob', section: 'activation' },
  ]
  it('prefiere el del día que se ve', () => {
    expect(pickPlanExercise(pes, 'sq', 'day_b').id).toBe('b')
    expect(pickPlanExercise(pes, 'sq', 'day_c').id).toBe('a')
    expect(pickPlanExercise(pes, 'mob', 'day_a').id).toBe('m')
    expect(pickPlanExercise(pes, 'nada', 'day_a')).toBe(null)
  })
})

describe('lastConversation', () => {
  it('los últimos N sin copias ni borrados', () => {
    const notes = [
      n('1', 'coach'),
      n('2', 'student', { source_note_id: 'x' }),
      n('3', 'student', { deleted_at: '2026-01-01' }),
      n('4', 'student'),
      n('5', 'coach'),
    ]
    expect(lastConversation(notes, 2).map((x) => x.id)).toEqual(['4', '5'])
  })
})

describe('lastConversation — primero la del otro', () => {
  it('si los últimos son todos propios, trae el último del otro lado', () => {
    const notes = [n('c1', 'coach'), n('s1', 'student'), n('s2', 'student')]
    expect(lastConversation(notes, 2, 'student').map((x) => x.id)).toEqual(['c1', 's2'])
  })
  it('si ya hay uno del otro lado entre los últimos, quedan los últimos', () => {
    const notes = [n('s0', 'student'), n('c1', 'coach'), n('s1', 'student')]
    expect(lastConversation(notes, 2, 'student').map((x) => x.id)).toEqual(['c1', 's1'])
  })
})
