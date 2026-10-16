import { describe, it, expect } from 'vitest'
import { notesForPlan, dayNotesFor } from './planNotes'

const n = (id, extra) => ({
  id,
  created_at: `2026-10-16T10:0${id.length}:00Z`,
  visibility: 'shared',
  deleted_at: null,
  ...extra,
})

describe('notesForPlan', () => {
  it('una sola copia por mensaje y ejercicio, prefiriendo la del plan', () => {
    const notes = [
      n('a', { context_type: 'exercise', exercise_id: 'ex', source_note_id: 'm' }),
      n('b', {
        context_type: 'plan_exercise',
        exercise_id: 'ex',
        plan_id: 'p1',
        source_note_id: 'm',
      }),
      n('c', { context_type: 'workout_log', exercise_id: 'ex' }),
    ]
    expect(notesForPlan(notes, { planId: 'p1' }).map((x) => x.id)).toEqual(['b', 'c'])
  })
  it('descarta las de otro plan y las de día', () => {
    const notes = [
      n('a', {
        context_type: 'plan_exercise',
        exercise_id: 'ex',
        plan_id: 'viejo',
        source_note_id: 'm',
      }),
      n('b', { context_type: 'exercise', exercise_id: 'ex', source_note_id: 'm' }),
      n('c', { context_type: 'plan', plan_id: 'p1', plan_section: 'day_a' }),
    ]
    expect(notesForPlan(notes, { planId: 'p1' }).map((x) => x.id)).toEqual(['b'])
  })
})

describe('dayNotesFor', () => {
  it('filtra por plan y día, más nueva primero', () => {
    const notes = [
      {
        id: '1',
        context_type: 'plan',
        plan_id: 'p1',
        plan_section: 'day_b',
        visibility: 'shared',
        created_at: '2026-10-01T00:00:00Z',
      },
      {
        id: '2',
        context_type: 'plan',
        plan_id: 'p1',
        plan_section: 'day_b',
        visibility: 'shared',
        created_at: '2026-10-05T00:00:00Z',
      },
      {
        id: '3',
        context_type: 'plan',
        plan_id: 'p1',
        plan_section: 'day_a',
        visibility: 'shared',
        created_at: '2026-10-06T00:00:00Z',
      },
      {
        id: '4',
        context_type: 'plan',
        plan_id: 'p2',
        plan_section: 'day_b',
        visibility: 'shared',
        created_at: '2026-10-07T00:00:00Z',
      },
    ]
    expect(dayNotesFor(notes, { planId: 'p1', section: 'day_b' }).map((x) => x.id)).toEqual([
      '2',
      '1',
    ])
    expect(dayNotesFor(notes, { planId: null, section: 'day_b' })).toEqual([])
  })
})
