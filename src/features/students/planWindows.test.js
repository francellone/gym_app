import { describe, it, expect } from 'vitest'
import {
  planWindowsFromLogs,
  planCutDates,
  realPlanWindows,
  cutIndexes,
  previousPlanStart,
  NO_PLAN,
} from './planWindows'

// Caso real: Andrea Martinez. Plan 1 del 27/07 al 24/08, Plan 2 desde el 02/09.
const ANDREA = [
  { plan_id: 'p1', logged_date: '2026-07-27' },
  { plan_id: 'p1', logged_date: '2026-08-13' },
  { plan_id: 'p1', logged_date: '2026-08-24' },
  { plan_id: 'p2', logged_date: '2026-09-02' },
  { plan_id: 'p2', logged_date: '2026-09-04' },
]

describe('planWindowsFromLogs', () => {
  it('arma una ventana por plan con su primera y última fecha', () => {
    expect(planWindowsFromLogs(ANDREA)).toEqual([
      { planId: 'p1', from: '2026-07-27', to: '2026-08-24', count: 3 },
      { planId: 'p2', from: '2026-09-02', to: '2026-09-04', count: 2 },
    ])
  })

  it('ordena por fecha de inicio, no por orden de llegada', () => {
    const win = planWindowsFromLogs([...ANDREA].reverse())
    expect(win.map((w) => w.planId)).toEqual(['p1', 'p2'])
  })

  it('agrupa los registros sin plan bajo una ventana propia', () => {
    const win = planWindowsFromLogs([
      { plan_id: null, logged_date: '2026-03-27' },
      { plan_id: 'p1', logged_date: '2026-07-27' },
    ])
    expect(win[0].planId).toBe(NO_PLAN)
  })

  it('ignora registros sin fecha', () => {
    expect(planWindowsFromLogs([{ plan_id: 'p1' }, { logged_date: null }])).toEqual([])
  })

  it('no rompe sin argumentos', () => {
    expect(planWindowsFromLogs()).toEqual([])
  })
})

describe('planCutDates', () => {
  it('marca el arranque de cada plan salvo el primero', () => {
    expect(planCutDates(planWindowsFromLogs(ANDREA))).toEqual(['2026-09-02'])
  })

  it('un solo plan no genera corte', () => {
    expect(planCutDates(planWindowsFromLogs(ANDREA.slice(0, 3)))).toEqual([])
  })

  it('tres planes generan dos cortes', () => {
    const win = planWindowsFromLogs([...ANDREA, { plan_id: 'p3', logged_date: '2026-10-01' }])
    expect(planCutDates(win)).toEqual(['2026-09-02', '2026-10-01'])
  })
})

describe('cutIndexes', () => {
  const dates = ['2026-07-27', '2026-08-13', '2026-08-24', '2026-09-02', '2026-09-04']

  it('ubica el corte en la columna donde arranca el plan nuevo', () => {
    expect([...cutIndexes(dates, ['2026-09-02'])]).toEqual([3])
  })

  it('si la fecha exacta no está, cae en la primera posterior', () => {
    expect([...cutIndexes(dates, ['2026-08-30'])]).toEqual([3])
  })

  it('no marca la primera columna: no hay nada antes que separar', () => {
    expect([...cutIndexes(dates, ['2026-07-27'])]).toEqual([])
  })

  it('un corte posterior a todas las fechas no marca nada', () => {
    expect([...cutIndexes(dates, ['2026-12-01'])]).toEqual([])
  })
})

describe('previousPlanStart', () => {
  it('devuelve el inicio del plan anterior, no el vigente', () => {
    expect(
      previousPlanStart([
        { plan_id: 'p2', active: true, created_at: '2026-09-01T10:00:00Z' },
        { plan_id: 'p1', active: false, created_at: '2026-07-26T10:00:00Z' },
      ])
    ).toBe('2026-07-26')
  })

  it('con dos planes vigentes a la vez no toma ninguno de ellos', () => {
    expect(
      previousPlanStart([
        { plan_id: 'p2', active: true, created_at: '2026-09-01T10:00:00Z' },
        { plan_id: 'p3', active: true, created_at: '2026-08-15T10:00:00Z' },
        { plan_id: 'p1', active: false, created_at: '2026-07-26T10:00:00Z' },
      ])
    ).toBe('2026-07-26')
  })

  it('un mismo plan reasignado cuenta una vez, con su fecha más reciente', () => {
    expect(
      previousPlanStart([
        { plan_id: 'p2', active: true, created_at: '2026-09-01T10:00:00Z' },
        { plan_id: 'p1', active: false, created_at: '2026-06-01T10:00:00Z' },
        { plan_id: 'p1', active: false, created_at: '2026-07-26T10:00:00Z' },
      ])
    ).toBe('2026-07-26')
  })

  it('elige el más reciente entre varios planes anteriores', () => {
    expect(
      previousPlanStart([
        { plan_id: 'p1', active: false, created_at: '2026-05-01T10:00:00Z' },
        { plan_id: 'p2', active: false, created_at: '2026-07-26T10:00:00Z' },
      ])
    ).toBe('2026-07-26')
  })

  it('prioriza start_date sobre created_at', () => {
    expect(
      previousPlanStart([
        {
          plan_id: 'p1',
          active: false,
          created_at: '2026-07-26T10:00:00Z',
          start_date: '2026-07-20',
        },
      ])
    ).toBe('2026-07-20')
  })

  it('con un solo plan y vigente no hay anterior', () => {
    expect(
      previousPlanStart([{ plan_id: 'p1', active: true, created_at: '2026-09-01T10:00:00Z' }])
    ).toBeNull()
  })

  it('sin asignaciones devuelve null', () => {
    expect(previousPlanStart()).toBeNull()
  })
})

describe('registros sin plan (datos viejos huérfanos)', () => {
  const conHuerfanos = [
    { plan_id: null, logged_date: '2026-03-27' },
    { plan_id: 'p1', logged_date: '2026-07-27' },
    { plan_id: 'p1', logged_date: '2026-08-24' },
  ]

  it('no cuentan como plan y no dibujan corte', () => {
    const win = planWindowsFromLogs(conHuerfanos)
    expect(win).toHaveLength(2)
    expect(planCutDates(win)).toEqual([])
  })

  it('realPlanWindows los deja afuera del conteo de planes', () => {
    expect(realPlanWindows(planWindowsFromLogs(conHuerfanos))).toHaveLength(1)
  })

  it('con huérfanos y dos planes reales, el corte sigue siendo el del plan real', () => {
    const win = planWindowsFromLogs([...conHuerfanos, { plan_id: 'p2', logged_date: '2026-09-02' }])
    expect(planCutDates(win)).toEqual(['2026-09-02'])
    expect(win[0].planId).toBe(NO_PLAN)
  })
})
