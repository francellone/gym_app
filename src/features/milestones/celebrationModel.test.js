import { describe, it, expect } from 'vitest'
import {
  buildBlocksBySection,
  activeDaysOf,
  dayLetter,
  computeLiveCandidates,
  enrichPlanCandidate,
  pickTopCelebration,
  toCelebration,
} from './celebrationModel'

const d = (s) => new Date(`${s}T12:00:00`)
const planExercises = [
  { id: 'a1', section: 'activation', block_id: 'b0', order_index: 0 },
  { id: 'x1', section: 'day_a', block_id: 'b1', order_index: 0 },
  { id: 'x2', section: 'day_a', block_id: 'b1', order_index: 1 },
  { id: 'y1', section: 'day_b', block_id: 'b2', order_index: 0 },
]
const planBlocks = [
  { id: 'b0', section: 'activation', block_type: 'strength', order_index: 0 },
  { id: 'b1', section: 'day_a', block_type: 'strength', order_index: 1 },
  { id: 'b2', section: 'day_b', block_type: 'strength', order_index: 2 },
]
const blocksBySection = buildBlocksBySection(planExercises, planBlocks)
const done = (pe, date) => ({
  plan_exercise_id: pe,
  logged_date: date,
  completed: true,
  status: 'done',
})
const dayA = (date) => [done('a1', date), done('x1', date), done('x2', date)]
const dayB = (date) => [done('a1', date), done('y1', date)]
const assignment = {
  id: 'asg-1',
  plan_id: 'p1',
  start_date: '2026-09-07',
  expected_end_date: '2026-09-27',
  schedule_mode: 'flexible',
  status: 'active',
  plan: { sessions_per_week: 2, title: 'Plan Fuerza', completion_message: null },
}

describe('armado del plan', () => {
  it('bloques por sección y días activos', () => {
    expect(Object.keys(blocksBySection).sort()).toEqual(['activation', 'day_a', 'day_b'])
    expect(activeDaysOf(blocksBySection)).toEqual(['day_a', 'day_b'])
    expect(dayLetter('day_b')).toBe('B')
  })
})

describe('computeLiveCandidates', () => {
  it('día completo sin cerrar la semana: solo el hito de día', () => {
    const c = computeLiveCandidates({
      dayId: 'day_a',
      date: '2026-09-21',
      prevStates: { day_a: 'open' },
      nextStates: { day_a: 'complete' },
      assignment,
      blocksBySection,
      activity: { logs: dayA('2026-09-21'), blockLogs: [] },
      today: d('2026-09-21'),
    })
    expect(c.map((x) => x.kind)).toEqual(['day_complete'])
  })

  it('la segunda sesión de la semana suma el hito de semana', () => {
    const c = computeLiveCandidates({
      dayId: 'day_b',
      date: '2026-09-17',
      prevStates: { day_b: 'open' },
      nextStates: { day_b: 'complete' },
      assignment,
      blocksBySection,
      activity: { logs: [...dayA('2026-09-15'), ...dayB('2026-09-17')], blockLogs: [] },
      today: d('2026-09-17'),
    })
    expect(c.map((x) => x.kind)).toEqual(['day_complete', 'week_complete'])
    expect(c[1].periodKey).toBe('2026-W38')
  })

  it('completar la última semana del plan dispara también el plan, con payload para mostrarlo después', () => {
    const logs = [
      ...dayA('2026-09-08'),
      ...dayB('2026-09-10'),
      ...dayA('2026-09-15'),
      ...dayB('2026-09-17'),
      ...dayA('2026-09-22'),
      ...dayB('2026-09-24'),
    ]
    const c = computeLiveCandidates({
      dayId: 'day_b',
      date: '2026-09-24',
      prevStates: { day_b: 'open' },
      nextStates: { day_b: 'complete' },
      assignment,
      blocksBySection,
      activity: { logs, blockLogs: [] },
      today: d('2026-09-24'),
    })
    expect(c.map((x) => x.kind)).toEqual(['day_complete', 'week_complete', 'plan_complete'])
    expect(c[2].payload).toMatchObject({
      trigger: 'last_week',
      sessions_closed: 6,
      sessions_expected: 6,
      tone: 'strong',
      weeks_complete: 3,
      plan_title: 'Plan Fuerza',
    })
  })

  it('cerrar con una omisión cuenta para la semana pero no es hito de día', () => {
    const c = computeLiveCandidates({
      dayId: 'day_b',
      date: '2026-09-17',
      prevStates: { day_b: 'open' },
      nextStates: { day_b: 'partial' },
      assignment,
      blocksBySection,
      activity: { logs: dayA('2026-09-15'), blockLogs: [] },
      today: d('2026-09-17'),
    })
    expect(c.map((x) => x.kind)).toEqual(['week_complete'])
  })

  it('si el día ya estaba cerrado (parcial → completo) la semana no se vuelve a evaluar', () => {
    const c = computeLiveCandidates({
      dayId: 'day_b',
      date: '2026-09-17',
      prevStates: { day_b: 'partial' },
      nextStates: { day_b: 'complete' },
      assignment,
      blocksBySection,
      activity: { logs: [...dayA('2026-09-15'), ...dayB('2026-09-17')], blockLogs: [] },
      today: d('2026-09-17'),
    })
    expect(c).toEqual([])
  })

  it('si otro día de la misma fecha ya estaba cerrado, la fecha ya contaba', () => {
    const c = computeLiveCandidates({
      dayId: 'day_b',
      date: '2026-09-17',
      prevStates: { day_a: 'complete', day_b: 'open' },
      nextStates: { day_a: 'complete', day_b: 'complete' },
      assignment,
      blocksBySection,
      activity: {
        logs: [...dayA('2026-09-15'), ...dayA('2026-09-17'), ...dayB('2026-09-17')],
        blockLogs: [],
      },
      today: d('2026-09-17'),
    })
    expect(c.map((x) => x.kind)).toEqual(['day_complete'])
  })

  it('suma la fecha aunque la lectura de actividad todavía no la traiga (guardado en curso)', () => {
    const c = computeLiveCandidates({
      dayId: 'day_b',
      date: '2026-09-17',
      prevStates: { day_b: 'open' },
      nextStates: { day_b: 'complete' },
      assignment,
      blocksBySection,
      activity: { logs: dayA('2026-09-15'), blockLogs: [] },
      today: d('2026-09-17'),
    })
    expect(c.map((x) => x.kind)).toEqual(['day_complete', 'week_complete'])
  })
})

describe('enrichPlanCandidate', () => {
  it('guarda el mensaje de la coach tal como está al otorgar', () => {
    const a = { ...assignment, plan: { ...assignment.plan, completion_message: 'Bien ahí' } }
    const c = enrichPlanCandidate(
      { kind: 'plan_complete', payload: {} },
      { assignment: a, closedDates: [], today: d('2026-10-01') }
    )
    expect(c.payload).toMatchObject({ message: 'Bien ahí', weeks_complete: 0 })
  })
})

describe('toCelebration', () => {
  it('día: toast con la letra del día; si lo cargó la coach, otro texto', () => {
    const m = {
      id: 'm1',
      kind: 'day_complete',
      period_key: '2026-09-22',
      payload: { day_id: 'day_b' },
    }
    expect(toCelebration(m, { studentId: 's1' })).toMatchObject({
      level: 'toast',
      titleVars: { letter: 'B' },
      bodyKey: 'celebrations.day.body',
      fromCoach: false,
    })
    expect(toCelebration({ ...m, created_by: 'coach' }, { studentId: 's1' }).bodyKey).toBe(
      'celebrations.day.bodyFromCoach'
    )
  })

  it('semana: hoja con sesiones', () => {
    const c = toCelebration({
      id: 'm2',
      kind: 'week_complete',
      payload: { expected: 3, completed: 3, week_start: '2026-09-21' },
    })
    expect(c).toMatchObject({ level: 'sheet', weekStart: '2026-09-21', bodyVars: { count: 3 } })
    expect(c.stats[0].value).toBe('3/3')
  })

  it('plan: tono, "de cada 10", confeti según el tono y mensaje automático si no hay', () => {
    const strong = toCelebration({
      kind: 'plan_complete',
      payload: {
        tone: 'strong',
        adherence: 0.92,
        sessions_closed: 11,
        sessions_expected: 12,
        weeks_complete: 4,
      },
    })
    expect(strong).toMatchObject({
      level: 'full',
      tone: 'strong',
      confetti: 220,
      bodyVars: { n: 9 },
      titleKey: 'celebrations.plan.title.strong',
    })
    expect(strong.stats.map((s) => s.value)).toEqual(['11/12', '4'])
    const gentle = toCelebration({
      kind: 'plan_complete',
      payload: { tone: 'gentle', adherence: 0.25, sessions_closed: 3, sessions_expected: 12 },
    })
    expect(gentle).toMatchObject({
      confetti: 0,
      bodyKey: 'celebrations.plan.body.gentle',
      autoMessageKey: 'celebrations.plan.autoMessage.gentle',
    })
    const noData = toCelebration({ kind: 'plan_complete', payload: {} })
    expect(noData).toMatchObject({
      tone: 'good',
      bodyKey: 'celebrations.plan.bodyNoData',
      stats: [],
    })
  })

  it('tipos sin pantalla devuelven null', () => {
    expect(toCelebration({ kind: 'personal_best', payload: {} })).toBeNull()
  })
})

describe('pickTopCelebration', () => {
  it('gana el nivel más alto', () => {
    expect(
      pickTopCelebration([{ level: 'toast' }, { level: 'full' }, { level: 'sheet' }]).level
    ).toBe('full')
    expect(pickTopCelebration([])).toBeNull()
  })
})
