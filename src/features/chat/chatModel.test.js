import { describe, it, expect } from 'vitest'
import {
  buildTimeline,
  filterTimeline,
  linkKindOf,
  dayLetter,
  isoWeekMonday,
  weekStartOfEvent,
  weeklyWellbeing,
  wellbeingRangeFor,
  weekQuestionKey,
  prepareCatalog,
  detectExercise,
  searchCatalog,
  sortThreads,
  lastItemByThread,
  countPrivate,
  suggestReplyTarget,
} from './chatModel'

const note = (id, at, extra = {}) => ({
  id,
  created_at: at,
  thread_id: 't1',
  visibility: 'shared',
  context_type: 'free',
  deleted_at: null,
  source_note_id: null,
  ...extra,
})

describe('buildTimeline', () => {
  it('mezcla notas y eventos en orden ascendente y cuelga las copias del original', () => {
    const notes = [
      note('m2', '2026-10-16T10:27:00Z', { author_role: 'coach' }),
      note('m1', '2026-10-16T10:26:00Z', { author_role: 'student' }),
      note('c1', '2026-10-16T10:28:00Z', { source_note_id: 'm2', context_type: 'exercise' }),
      note('c2', '2026-10-16T10:29:00Z', { source_note_id: 'm2', context_type: 'plan_exercise' }),
      note('gone', '2026-10-16T10:30:00Z', { deleted_at: '2026-10-16T11:00:00Z' }),
    ]
    const events = [{ id: 'e1', occurred_at: '2026-10-16T10:24:00Z', kind: 'week_complete' }]
    const tl = buildTimeline({ notes, events })
    expect(tl.map((i) => i.id)).toEqual(['e1', 'm1', 'm2'])
    expect(tl[2].links.map((l) => l.id)).toEqual(['c2', 'c1'])
  })
})

describe('filterTimeline', () => {
  const notes = [
    note('a', '2026-10-01T10:00:00Z'),
    note('p', '2026-10-02T10:00:00Z', { visibility: 'coach_private' }),
    note('b', '2026-10-03T10:00:00Z'),
    note('cb', '2026-10-03T10:01:00Z', { source_note_id: 'b', context_type: 'exercise' }),
    note('pc', '2026-10-03T10:02:00Z', { source_note_id: 'a', visibility: 'coach_private' }),
  ]
  const tl = buildTimeline({ notes, events: [{ id: 'e', occurred_at: '2026-10-04T00:00:00Z' }] })
  it('mensajes excluye privadas y eventos', () => {
    expect(filterTimeline(tl, 'messages').map((i) => i.id)).toEqual(['a', 'b'])
  })
  it('eventos', () => {
    expect(filterTimeline(tl, 'events').map((i) => i.id)).toEqual(['e'])
  })
  it('guardado en el plan = mensajes con copia no privada', () => {
    expect(filterTimeline(tl, 'plan').map((i) => i.id)).toEqual(['b'])
  })
  it('privadas incluye directas y copias privadas', () => {
    const r = filterTimeline(tl, 'private', { notes })
    expect(r.map((i) => i.id)).toEqual(['p', 'pc'])
    expect(r[1].fromCopy).toBe(true)
    expect(countPrivate(notes)).toBe(2)
  })
})

describe('linkKindOf y dayLetter', () => {
  it('clasifica copias', () => {
    expect(linkKindOf({ visibility: 'coach_private', context_type: 'free' })).toBe('private')
    expect(linkKindOf({ visibility: 'shared', context_type: 'exercise' })).toBe('exercise')
    expect(linkKindOf({ visibility: 'shared', context_type: 'plan_exercise' })).toBe(
      'plan_exercise'
    )
    expect(linkKindOf({ visibility: 'shared', context_type: 'plan' })).toBe('plan_day')
  })
  it('letra del día', () => {
    expect(dayLetter('day_b')).toBe('B')
    expect(dayLetter('activation')).toBe(null)
  })
})

describe('semana y bienestar', () => {
  it('lunes de la semana ISO (incluye fin de año)', () => {
    expect(isoWeekMonday('2026-W42')).toBe('2026-10-12')
    expect(isoWeekMonday('2026-W53')).toBe('2026-12-28')
    expect(isoWeekMonday('2027-W01')).toBe('2027-01-04')
    expect(isoWeekMonday('nada')).toBe(null)
  })
  it('usa week_start si viene en el payload', () => {
    expect(
      weekStartOfEvent({ payload: { week_start: '2026-10-12', period_key: '2026-W01' } })
    ).toBe('2026-10-12')
    expect(weekStartOfEvent({ payload: { period_key: '2026-W42' } })).toBe('2026-10-12')
  })
  it('promedia la semana y compara con la anterior', () => {
    const logs = [
      { date: '2026-10-05', sleep_quality: 6, stress_level: 6 },
      { date: '2026-10-13', sleep_quality: 7, stress_level: 4 },
      { date: '2026-10-15', sleep_quality: 8, stress_level: 5 },
      { date: '2026-10-19', sleep_quality: 1 },
    ]
    const r = weeklyWellbeing(logs, '2026-10-12')
    expect(r.count).toBe(2)
    const sleep = r.metrics.find((m) => m.key === 'sleep_quality')
    expect(sleep).toEqual({ key: 'sleep_quality', value: 7.5, delta: 1.5, better: true })
    const stress = r.metrics.find((m) => m.key === 'stress_level')
    expect(stress).toEqual({ key: 'stress_level', value: 4.5, delta: -1.5, better: true })
    expect(r.metrics.find((m) => m.key === 'energy_level')).toBeUndefined()
  })
  it('sin registros en la semana devuelve null', () => {
    expect(weeklyWellbeing([{ date: '2026-10-01', sleep_quality: 5 }], '2026-10-12')).toBe(null)
  })
  it('rango a pedir cubre la semana anterior', () => {
    const r = wellbeingRangeFor([
      { kind: 'week_complete', payload: { week_start: '2026-10-12' } },
      { kind: 'day_complete', payload: {} },
      { kind: 'week_complete', payload: { period_key: '2026-W40' } },
    ])
    expect(r).toEqual({ from: '2026-09-21', to: '2026-10-18' })
  })
  it('clave de la pregunta según la variante', () => {
    expect(weekQuestionKey({ payload: { variant: 3 } })).toBe('chat.weekQuestion.v3')
    expect(weekQuestionKey({ payload: { variant: 8 } })).toBe('chat.weekQuestion.v2')
    expect(weekQuestionKey({ payload: {} })).toBe('chat.weekQuestion.v0')
  })
})

describe('detectExercise', () => {
  const catalog = prepareCatalog([
    { id: 'rdl', name: 'Peso muerto rumano con barra', name_en: 'Barbell Romanian Deadlift' },
    { id: 'rdlm', name: 'Peso muerto rumano con mancuernas' },
    { id: 'pm', name: 'Peso muerto' },
    { id: 'gob', name: 'Sentadilla Goblet' },
    { id: 'x', name: 'Ab' },
  ])
  it('encuentra el nombre más largo, sin acentos ni mayúsculas', () => {
    const r = detectExercise('En PESO MUERTO RUMANO con barra: separá más las rodillas', catalog)
    expect(r.match).toEqual({ id: 'rdl', name: 'Peso muerto rumano con barra' })
    expect(r.alternatives.map((a) => a.id)).toContain('rdlm')
  })
  it('acepta el nombre en inglés', () => {
    expect(
      detectExercise('On the barbell romanian deadlift keep knees soft', catalog).match.id
    ).toBe('rdl')
  })
  it('palabras enteras: no confunde partes de palabras', () => {
    expect(detectExercise('sentadillas goblets', catalog).match).toBe(null)
    expect(detectExercise('en la sentadilla goblet bajá más', catalog).match.id).toBe('gob')
  })
  it('sin coincidencias', () => {
    expect(detectExercise('hola, ¿cómo estás?', catalog)).toEqual({ match: null, alternatives: [] })
  })
  it('buscador por palabras', () => {
    expect(searchCatalog('rumano manc', catalog).map((r) => r.id)).toEqual(['rdlm'])
  })
})

describe('lista de conversaciones', () => {
  it('ordena por última novedad', () => {
    const r = sortThreads([
      { id: 'a', last_message_at: '2026-10-01T00:00:00Z' },
      { id: 'b', last_message_at: '2026-10-05T00:00:00Z' },
      { id: 'c', last_message_at: null, created_at: '2026-09-01T00:00:00Z' },
    ])
    expect(r.map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })
  it('última novedad por hilo ignora copias y privadas', () => {
    const map = lastItemByThread({
      notes: [
        note('n1', '2026-10-01T10:00:00Z'),
        note('n2', '2026-10-03T10:00:00Z', { visibility: 'coach_private' }),
        note('n3', '2026-10-04T10:00:00Z', { source_note_id: 'n1' }),
      ],
      events: [{ id: 'e', thread_id: 't1', occurred_at: '2026-10-02T00:00:00Z' }],
    })
    expect(map.get('t1').type).toBe('event')
  })
})

describe('suggestReplyTarget', () => {
  const log = (id, at, extra = {}) =>
    note(id, at, {
      author_role: 'student',
      context_type: 'workout_log',
      context_id: 'wl',
      ...extra,
    })
  it('sugiere el último comentario asociado del otro lado sin responder', () => {
    const notes = [
      log('s1', '2026-10-16T10:00:00Z'),
      note('c1', '2026-10-16T10:05:00Z', { author_role: 'coach' }),
    ]
    expect(suggestReplyTarget(notes, 'coach').id).toBe('s1')
  })
  it('nada si ya tiene respuesta', () => {
    const notes = [
      log('s1', '2026-10-16T10:00:00Z'),
      note('c1', '2026-10-16T10:05:00Z', { author_role: 'coach', parent_note_id: 's1' }),
    ]
    expect(suggestReplyTarget(notes, 'coach')).toBe(null)
  })
  it('nada si el último del otro lado es general', () => {
    const notes = [
      log('s1', '2026-10-16T10:00:00Z'),
      note('s2', '2026-10-16T10:01:00Z', { author_role: 'student' }),
    ]
    expect(suggestReplyTarget(notes, 'coach')).toBe(null)
  })
  it('la persona: sugiere la nota de la coach sobre un ejercicio', () => {
    const notes = [
      note('c1', '2026-10-16T10:00:00Z', {
        author_role: 'coach',
        context_type: 'exercise',
        context_id: 'ex',
      }),
    ]
    expect(suggestReplyTarget(notes, 'student').id).toBe('c1')
  })
  it('ignora privadas y copias', () => {
    const notes = [
      log('s1', '2026-10-16T10:00:00Z', { author_role: 'coach', visibility: 'coach_private' }),
      note('cp', '2026-10-16T10:01:00Z', {
        author_role: 'coach',
        context_type: 'exercise',
        source_note_id: 'x',
      }),
    ]
    expect(suggestReplyTarget(notes, 'student')).toBe(null)
  })
})
