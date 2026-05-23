import { describe, it, expect } from 'vitest'
import {
  computePeriodRange,
  resolveDefaultPeriod,
  findPeriodLabel,
  DEFAULT_PERIOD_WITH_PLAN,
  DEFAULT_PERIOD_NO_PLAN,
} from './dashboardPeriods'

const TODAY = new Date('2026-05-23T15:00:00')

describe('computePeriodRange', () => {
  it("'vigente' con planAssignment → start_date del plan", () => {
    expect(
      computePeriodRange({
        periodKey: 'vigente',
        planAssignment: { start_date: '2026-05-01' },
        today: TODAY,
      })
    ).toEqual({ start: '2026-05-01', end: '2026-05-23' })
  })

  it("'vigente' sin planAssignment → fallback a 30d", () => {
    const r = computePeriodRange({ periodKey: 'vigente', today: TODAY })
    expect(r.end).toBe('2026-05-23')
    expect(r.start).toBe('2026-04-24') // 30 días incluyendo hoy
  })

  it("'7d' → últimos 7 días (incluyendo hoy)", () => {
    expect(computePeriodRange({ periodKey: '7d', today: TODAY })).toEqual({
      start: '2026-05-17',
      end: '2026-05-23',
    })
  })

  it("'14d' → últimos 14 días", () => {
    expect(computePeriodRange({ periodKey: '14d', today: TODAY })).toEqual({
      start: '2026-05-10',
      end: '2026-05-23',
    })
  })

  it("'90d' → 90 días", () => {
    const r = computePeriodRange({ periodKey: '90d', today: TODAY })
    expect(r.end).toBe('2026-05-23')
    expect(r.start).toBe('2026-02-23')
  })

  it("'all' → desde 2000-01-01", () => {
    expect(computePeriodRange({ periodKey: 'all', today: TODAY })).toEqual({
      start: '2000-01-01',
      end: '2026-05-23',
    })
  })

  it('periodKey null/undefined/desconocido → fallback a 30d', () => {
    expect(computePeriodRange({ periodKey: null, today: TODAY }).start).toBe('2026-04-24')
    expect(computePeriodRange({ periodKey: undefined, today: TODAY }).start).toBe('2026-04-24')
    expect(computePeriodRange({ periodKey: 'bogus', today: TODAY }).start).toBe('2026-04-24')
  })

  it('input vacío {} no rompe', () => {
    const r = computePeriodRange({})
    expect(r.start).toBeDefined()
    expect(r.end).toBeDefined()
  })

  it("planAssignment.start_date como timestamp ISO se normaliza a YMD", () => {
    expect(
      computePeriodRange({
        periodKey: 'vigente',
        planAssignment: { start_date: '2026-05-01T10:00:00Z' },
        today: TODAY,
      })
    ).toEqual({ start: '2026-05-01', end: '2026-05-23' })
  })
})

describe('resolveDefaultPeriod', () => {
  it('hasActivePlan=true → vigente', () => {
    expect(resolveDefaultPeriod({ hasActivePlan: true })).toBe(DEFAULT_PERIOD_WITH_PLAN)
    expect(resolveDefaultPeriod({ hasActivePlan: true })).toBe('vigente')
  })

  it('hasActivePlan=false → 30d', () => {
    expect(resolveDefaultPeriod({ hasActivePlan: false })).toBe(DEFAULT_PERIOD_NO_PLAN)
    expect(resolveDefaultPeriod({ hasActivePlan: false })).toBe('30d')
  })

  it('sin input → 30d', () => {
    expect(resolveDefaultPeriod()).toBe('30d')
  })
})

describe('findPeriodLabel', () => {
  it('matchea labels', () => {
    expect(findPeriodLabel('vigente')).toBe('Plan vigente')
    expect(findPeriodLabel('7d')).toBe('Últimos 7 días')
    expect(findPeriodLabel('30d')).toBe('Últimos 30 días')
  })

  it('desconocido → cae a un default sensato', () => {
    expect(findPeriodLabel('bogus')).toBeTruthy()
  })
})
