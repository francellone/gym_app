import { describe, it, expect } from 'vitest'
import {
  planWindowsFromLogs,
  planStartMarks,
  realPlanWindows,
  hasMultiplePlans,
  markIndexes,
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

describe('planStartMarks', () => {
  it('marca el arranque de CADA plan, el primero incluido', () => {
    expect(planStartMarks(planWindowsFromLogs(ANDREA))).toEqual([
      { date: '2026-07-27', planId: 'p1' },
      { date: '2026-09-02', planId: 'p2' },
    ])
  })

  it('con un solo plan igual marca su inicio', () => {
    expect(planStartMarks(planWindowsFromLogs(ANDREA.slice(0, 3)))).toEqual([
      { date: '2026-07-27', planId: 'p1' },
    ])
  })

  it('tres planes dan tres marcas', () => {
    const win = planWindowsFromLogs([...ANDREA, { plan_id: 'p3', logged_date: '2026-10-01' }])
    expect(planStartMarks(win).map((m) => m.planId)).toEqual(['p1', 'p2', 'p3'])
  })

  it('no repite fecha si dos planes arrancan el mismo día', () => {
    const win = planWindowsFromLogs([
      { plan_id: 'p1', logged_date: '2026-07-27' },
      { plan_id: 'p2', logged_date: '2026-07-27' },
    ])
    expect(planStartMarks(win)).toHaveLength(1)
  })
})

describe('hasMultiplePlans', () => {
  it('es true con dos planes reales', () => {
    expect(hasMultiplePlans(planWindowsFromLogs(ANDREA))).toBe(true)
  })

  it('es false con un plan real más registros sin plan', () => {
    const win = planWindowsFromLogs([
      { plan_id: null, logged_date: '2026-03-27' },
      { plan_id: 'p1', logged_date: '2026-07-27' },
    ])
    expect(hasMultiplePlans(win)).toBe(false)
  })
})

describe('markIndexes', () => {
  const dates = ['2026-07-27', '2026-08-13', '2026-08-24', '2026-09-02', '2026-09-04']
  const marks = planStartMarks(planWindowsFromLogs(ANDREA))

  it('ubica cada plan en su columna, incluida la primera', () => {
    expect([...markIndexes(dates, marks)]).toEqual([
      [0, 'p1'],
      [3, 'p2'],
    ])
  })

  it('si la fecha exacta no está, cae en la primera posterior', () => {
    expect([...markIndexes(dates, [{ date: '2026-08-30', planId: 'p2' }])]).toEqual([[3, 'p2']])
  })

  it('un plan que arrancó antes de la primera columna visible no se marca', () => {
    const recortadas = dates.slice(3) // solo 02/09 y 04/09
    expect([...markIndexes(recortadas, marks)]).toEqual([[0, 'p2']])
  })

  it('un plan posterior a todas las fechas no se marca', () => {
    expect([...markIndexes(dates, [{ date: '2026-12-01', planId: 'pX' }])]).toEqual([])
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

  it('no cuentan como plan y no generan marca propia', () => {
    const win = planWindowsFromLogs(conHuerfanos)
    expect(win).toHaveLength(2)
    expect(planStartMarks(win)).toEqual([{ date: '2026-07-27', planId: 'p1' }])
  })

  it('realPlanWindows los deja afuera del conteo de planes', () => {
    expect(realPlanWindows(planWindowsFromLogs(conHuerfanos))).toHaveLength(1)
  })

  it('con huérfanos y dos planes reales, las marcas son las de los planes reales', () => {
    const win = planWindowsFromLogs([...conHuerfanos, { plan_id: 'p2', logged_date: '2026-09-02' }])
    expect(planStartMarks(win).map((m) => m.date)).toEqual(['2026-07-27', '2026-09-02'])
    expect(win[0].planId).toBe(NO_PLAN)
  })
})
