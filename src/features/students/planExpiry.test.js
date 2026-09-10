// ============================================================
// planExpiry.test.js — vigencia del plan (v48)
// ------------------------------------------------------------
// Por qué existe: hasta la v48 el "vencimiento del plan" salía de
// `end_date`, que en realidad es la fecha de CIERRE y en una
// asignación viva siempre es null. Nadie lo notó durante meses
// porque no había un solo test que mirara esta lógica.
// ============================================================
import { describe, it, expect } from 'vitest'
import { getPlanExpiryStatus, getPlanExpiryInfo } from './status'

const TODAY = new Date(2026, 8, 10) // 2026-09-10

const asg = (props = {}) => [
  {
    status: 'active',
    plan_type: 'training',
    expected_end_source: 'derived',
    ...props,
  },
]

describe('getPlanExpiryStatus', () => {
  it('sin asignaciones → no_plan', () => {
    expect(getPlanExpiryStatus([], TODAY)).toBe('no_plan')
    expect(getPlanExpiryStatus(null, TODAY)).toBe('no_plan')
  })

  it('plan sin duración (expected_end_date null) → open, no vencido', () => {
    expect(getPlanExpiryStatus(asg({ expected_end_date: null }), TODAY)).toBe('open')
  })

  it('vencimiento pasado → expired', () => {
    expect(getPlanExpiryStatus(asg({ expected_end_date: '2026-09-09' }), TODAY)).toBe('expired')
  })

  it('vence hoy → expiring_soon (no vencido)', () => {
    expect(getPlanExpiryStatus(asg({ expected_end_date: '2026-09-10' }), TODAY)).toBe(
      'expiring_soon'
    )
  })

  it('vence dentro de 7 días → expiring_soon; al 8º día → on_track', () => {
    expect(getPlanExpiryStatus(asg({ expected_end_date: '2026-09-17' }), TODAY)).toBe(
      'expiring_soon'
    )
    expect(getPlanExpiryStatus(asg({ expected_end_date: '2026-09-18' }), TODAY)).toBe('on_track')
  })

  it('ignora las evaluaciones: solo mira el plan de training', () => {
    const soloEval = [
      { status: 'active', plan_type: 'evaluation', expected_end_date: '2026-09-11' },
    ]
    expect(getPlanExpiryStatus(soloEval, TODAY)).toBe('no_plan')
  })

  it('una asignación cerrada no cuenta aunque tenga fecha', () => {
    const cerrada = [
      {
        status: 'replaced',
        plan_type: 'training',
        expected_end_date: '2026-09-11',
        closed_at: '2026-08-01',
      },
    ]
    expect(getPlanExpiryStatus(cerrada, TODAY)).toBe('no_plan')
  })

  it('closed_at NO se usa como vencimiento (la trampa que originó la v48)', () => {
    const viva = asg({ expected_end_date: null, closed_at: '2026-08-01' })
    expect(getPlanExpiryStatus(viva, TODAY)).toBe('open')
  })
})

describe('getPlanExpiryInfo', () => {
  it('marca estimada la fecha que puso el backfill', () => {
    const info = getPlanExpiryInfo(
      asg({ expected_end_date: '2026-09-20', expected_end_source: 'backfill' }),
      TODAY
    )
    expect(info.isEstimated).toBe(true)
    expect(info.isManual).toBe(false)
    expect(info.daysLeft).toBe(10)
  })

  it('marca manual la fecha fijada por la coach', () => {
    const info = getPlanExpiryInfo(
      asg({ expected_end_date: '2026-10-01', expected_end_source: 'manual' }),
      TODAY
    )
    expect(info.isManual).toBe(true)
    expect(info.isEstimated).toBe(false)
  })
})
