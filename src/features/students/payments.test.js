// ============================================================
// payments.test.js — historial de cobros (v49)
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  proposeNextPeriod,
  periodLength,
  friendlyPaymentError,
  shouldOfferPlanExtension,
  formatAmount,
  DEFAULT_CYCLE_DAYS,
} from './payments'

const TODAY = new Date(2026, 8, 10) // 2026-09-10
const pago = (start, end, extra = {}) => ({
  period_start: start,
  period_end: end,
  paid_on: start,
  ...extra,
})

describe('periodLength', () => {
  it('cuenta los dos extremos', () => {
    expect(periodLength(pago('2026-09-01', '2026-09-30'))).toBe(30)
    expect(periodLength(pago('2026-09-01', '2026-09-01'))).toBe(1)
  })
  it('sin fechas → null', () => {
    expect(periodLength(null)).toBe(null)
    expect(periodLength({})).toBe(null)
  })
})

describe('proposeNextPeriod', () => {
  it('sin historial → arranca hoy y dura el ciclo por defecto', () => {
    const p = proposeNextPeriod([], null, TODAY)
    expect(p.period_start).toBe('2026-09-10')
    expect(p.period_end).toBe('2026-10-09') // 30 días inclusive
    expect(p.paid_on).toBe('2026-09-10')
    expect(DEFAULT_CYCLE_DAYS).toBe(30)
  })

  it('arranca el día siguiente al último día cubierto, sin pisarlo', () => {
    const p = proposeNextPeriod([pago('2026-08-01', '2026-08-31')], null, TODAY)
    expect(p.period_start).toBe('2026-09-01')
  })

  it('sin ciclo declarado repite el largo del último período', () => {
    const p = proposeNextPeriod([pago('2026-07-01', '2026-09-28')], null, TODAY) // 90 días
    expect(p.period_start).toBe('2026-09-29')
    expect(p.period_end).toBe('2026-12-27')
  })

  it('el ciclo del alumno gana sobre el largo anterior', () => {
    const p = proposeNextPeriod([pago('2026-08-01', '2026-08-31')], 15, TODAY)
    expect(p.period_end).toBe('2026-09-15')
  })

  it('toma el período más lejano, no el último de la lista', () => {
    const p = proposeNextPeriod(
      [pago('2026-08-01', '2026-08-31'), pago('2026-06-01', '2026-06-30')],
      30,
      TODAY
    )
    expect(p.period_start).toBe('2026-09-01')
  })

  it('pago adelantado: si el período vigente no terminó, el nuevo arranca después igual', () => {
    const p = proposeNextPeriod([pago('2026-09-01', '2026-09-30')], 30, TODAY)
    expect(p.period_start).toBe('2026-10-01')
    expect(p.period_end).toBe('2026-10-30')
  })
})

describe('friendlyPaymentError', () => {
  it('traduce el solapamiento de períodos (D8)', () => {
    expect(friendlyPaymentError({ code: '23P01' })).toMatch(/ya está cubierto/i)
  })
  it('deja pasar el mensaje original si no lo conoce', () => {
    expect(friendlyPaymentError({ code: 'XX000', message: 'boom' })).toBe('boom')
  })
})

describe('shouldOfferPlanExtension (D4)', () => {
  it('ofrece cuando el plan vence antes del fin del período pagado', () => {
    expect(shouldOfferPlanExtension({ expected_end_date: '2026-09-20' }, '2026-10-10')).toBe(true)
  })
  it('no ofrece si el plan vence después', () => {
    expect(shouldOfferPlanExtension({ expected_end_date: '2026-11-01' }, '2026-10-10')).toBe(false)
  })
  it('no ofrece en un plan abierto ni sin plan', () => {
    expect(shouldOfferPlanExtension({ expected_end_date: null }, '2026-10-10')).toBe(false)
    expect(shouldOfferPlanExtension(null, '2026-10-10')).toBe(false)
  })
})

describe('formatAmount', () => {
  it('sin monto → null (el monto es opcional)', () => {
    expect(formatAmount(null)).toBe(null)
    expect(formatAmount('')).toBe(null)
  })
  it('formatea en pesos', () => {
    expect(formatAmount(25000)).toMatch(/25\.000/)
  })
})
