import { describe, it, expect } from 'vitest'
import {
  closedDatesAcrossPlans,
  computeStreakState,
  streakWindowStart,
  isTrainingAssignment,
} from './streak'

const d = (s) => new Date(`${s}T12:00:00`)

// Dos planes con estructura distinta: el registro se evalúa contra el suyo.
const planExercises = [
  { id: 'a1', plan_id: 'p1', section: 'day_a', block_id: 'b1', order_index: 0 },
  { id: 'a2', plan_id: 'p1', section: 'day_a', block_id: 'b1', order_index: 1 },
  { id: 'c1', plan_id: 'p2', section: 'day_a', block_id: 'b2', order_index: 0 },
]
const planBlocks = [
  { id: 'b1', plan_id: 'p1', section: 'day_a', block_type: 'strength', order_index: 0 },
  { id: 'b2', plan_id: 'p2', section: 'day_a', block_type: 'strength', order_index: 0 },
]
const log = (plan, pe, date, extra = {}) => ({
  plan_id: plan,
  plan_exercise_id: pe,
  logged_date: date,
  completed: true,
  status: 'done',
  ...extra,
})

describe('closedDatesAcrossPlans', () => {
  it('cada plan con su estructura; un día a medias no cuenta', () => {
    const dates = closedDatesAcrossPlans({
      planExercises,
      planBlocks,
      logs: [
        log('p1', 'a1', '2026-09-01'),
        log('p1', 'a2', '2026-09-01'), // p1 completo
        log('p1', 'a1', '2026-09-02'), // p1 a medias
        log('p2', 'c1', '2026-09-20'), // p2 completo (un solo ejercicio)
      ],
      blockLogs: [],
    })
    expect(dates).toEqual(['2026-09-01', '2026-09-20'])
  })
})

const flex = (id, start, extra = {}) => ({
  id,
  plan_id: id,
  start_date: start,
  schedule_mode: 'flexible',
  plan: { plan_type: 'training', sessions_per_week: 2 },
  ...extra,
})

describe('computeStreakState', () => {
  it('cuenta semanas completas seguidas y no juzga la semana en curso', () => {
    const s = computeStreakState({
      assignments: [flex('p1', '2026-09-07')],
      closedDates: ['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17', '2026-09-22'],
      today: d('2026-09-24'),
    })
    expect(s.streak).toBe(2)
    expect(s.currentWeekComplete).toBe(false)
  })

  it('una semana sin plan en el medio no corta', () => {
    const s = computeStreakState({
      assignments: [
        flex('p1', '2026-08-31', { closed_at: '2026-09-06' }),
        flex('p2', '2026-09-14'),
      ],
      closedDates: ['2026-09-01', '2026-09-03', '2026-09-15', '2026-09-17'],
      today: d('2026-09-21'),
    })
    expect(s.weeks.map((w) => w.status)).toEqual(['complete', 'neutral', 'complete', 'current'])
    expect(s.streak).toBe(2)
  })

  it('avisa cuando ESTA semana ganó el comodín (cuarta completa)', () => {
    const dates = []
    for (const mon of ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']) {
      const m = d(mon)
      for (const add of [0, 2]) {
        const x = new Date(m)
        x.setDate(x.getDate() + add)
        dates.push(x.toISOString().slice(0, 10))
      }
    }
    const s = computeStreakState({
      assignments: [flex('p1', '2026-08-31')],
      closedDates: dates,
      today: d('2026-09-24'),
    })
    expect(s).toMatchObject({
      streak: 4,
      freezes: 1,
      currentWeekComplete: true,
      freezeEarnedThisWeek: true,
    })
  })

  it('las evaluaciones no cuentan como plan', () => {
    expect(isTrainingAssignment({ plan: { plan_type: 'evaluation' } })).toBe(false)
    const s = computeStreakState({
      assignments: [
        { ...flex('e1', '2026-09-01'), plan: { plan_type: 'evaluation', sessions_per_week: 1 } },
      ],
      closedDates: ['2026-09-02'],
      today: d('2026-09-24'),
    })
    expect(s.streak).toBe(0)
  })
})

describe('streakWindowStart', () => {
  it('desde el primer plan, con tope de un año', () => {
    expect(
      streakWindowStart(
        [{ start_date: '2026-06-01' }, { start_date: '2026-03-01' }],
        d('2026-09-24')
      )
    ).toBe('2026-03-01')
    expect(streakWindowStart([{ start_date: '2020-01-01' }], d('2026-09-24'))).toBe('2025-09-25') // 52 semanas = 364 días
  })
})
