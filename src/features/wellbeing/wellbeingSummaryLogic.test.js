import { describe, it, expect } from 'vitest'
import {
  computeWellbeingStatus,
  computeWellbeingAverages,
  computeLastEntryTrend,
  computeWellbeingSummary,
  summarizeByStudent,
  describeLastEntry,
  wellbeingStatusConfig,
  WELLBEING_METRIC_KEYS,
} from './wellbeingSummaryLogic'
import { ALERT_THRESHOLDS } from '@/features/dashboard/alerts'

// Todos los tests usan fixtures en memoria: NUNCA tocan Supabase.
const TODAY = new Date(2026, 7, 27) // 2026-08-27

// Día "sano": ninguna métrica cruza umbral de alerta.
const OK = {
  sleep_quality: 8,
  nutrition_quality: 8,
  hydration_quality: 8,
  energy_level: 8,
  stress_level: 3,
  muscle_fatigue: 3,
}

const log = (date, overrides = {}) => ({ user_id: 's1', date, ...OK, ...overrides })

describe('computeWellbeingStatus (semáforo con umbrales de alerts.js)', () => {
  it('sin registros → none', () => {
    const r = computeWellbeingStatus([], { to: '2026-08-27', today: TODAY })
    expect(r.status).toBe('none')
    expect(r.daysWithData).toBe(0)
  })

  it('registros sanos → good y sin motivos', () => {
    const r = computeWellbeingStatus([log('2026-08-25'), log('2026-08-26')], {
      to: '2026-08-27',
      today: TODAY,
    })
    expect(r.status).toBe('good')
    expect(r.reasons).toEqual([])
    expect(r.daysWithData).toBe(2)
  })

  it('un solo día malo → warn (no llega al mínimo de días sostenidos)', () => {
    const r = computeWellbeingStatus([log('2026-08-25', { energy_level: 3 }), log('2026-08-26')], {
      to: '2026-08-27',
      today: TODAY,
    })
    expect(r.status).toBe('warn')
    expect(r.reasons).toEqual(['energía baja 1 día'])
  })

  it('energía baja sostenida (FATIGUE_MIN_DAYS) → bad', () => {
    const logs = ['2026-08-24', '2026-08-25', '2026-08-26'].map((d) =>
      log(d, { energy_level: ALERT_THRESHOLDS.LOW_ENERGY_THRESHOLD })
    )
    const r = computeWellbeingStatus(logs, { to: '2026-08-27', today: TODAY })
    expect(r.status).toBe('bad')
    expect(r.reasons).toContain('energía baja 3 días')
  })

  it('fatiga muscular alta sostenida → bad', () => {
    const logs = ['2026-08-24', '2026-08-25', '2026-08-26'].map((d) =>
      log(d, { muscle_fatigue: ALERT_THRESHOLDS.HIGH_MUSCLE_FATIGUE_THRESHOLD })
    )
    expect(computeWellbeingStatus(logs, { to: '2026-08-27', today: TODAY }).status).toBe('bad')
  })

  it('estrés alto sostenido → bad', () => {
    const logs = ['2026-08-24', '2026-08-25', '2026-08-26'].map((d) =>
      log(d, { stress_level: ALERT_THRESHOLDS.HIGH_STRESS_THRESHOLD })
    )
    expect(computeWellbeingStatus(logs, { to: '2026-08-27', today: TODAY }).status).toBe('bad')
  })

  it('ignora los días malos que quedan fuera de la ventana de 14 días', () => {
    const viejos = ['2026-08-01', '2026-08-02', '2026-08-03'].map((d) =>
      log(d, { energy_level: 2 })
    )
    const r = computeWellbeingStatus([...viejos, log('2026-08-26')], {
      to: '2026-08-27',
      today: TODAY,
    })
    expect(r.status).toBe('good')
    expect(r.daysWithData).toBe(1)
  })

  it('energía en 0 (métrica no cargada) no cuenta como energía baja', () => {
    const logs = ['2026-08-24', '2026-08-25', '2026-08-26'].map((d) => log(d, { energy_level: 0 }))
    expect(computeWellbeingStatus(logs, { to: '2026-08-27', today: TODAY }).status).toBe('good')
  })
})

describe('computeWellbeingAverages', () => {
  it('promedia las 6 métricas con 1 decimal e ignora métricas sin cargar', () => {
    const avgs = computeWellbeingAverages([
      log('2026-08-25', { energy_level: 8, sleep_quality: 0 }),
      log('2026-08-26', { energy_level: 7, sleep_quality: 6 }),
    ])
    expect(Object.keys(avgs).sort()).toEqual([...WELLBEING_METRIC_KEYS].sort())
    expect(avgs.energy_level).toEqual({ avg: 7.5, count: 2 })
    // sleep_quality: sólo 1 valor válido (el 0 se descarta)
    expect(avgs.sleep_quality).toEqual({ avg: 6, count: 1 })
  })

  it('sin registros → avg null y count 0', () => {
    expect(computeWellbeingAverages([]).energy_level).toEqual({ avg: null, count: 0 })
  })
})

describe('computeLastEntryTrend', () => {
  it('sin registros → null', () => {
    expect(computeLastEntryTrend([])).toBeNull()
  })

  it('toma el registro más reciente aunque venga desordenado', () => {
    const r = computeLastEntryTrend([log('2026-08-20'), log('2026-08-26'), log('2026-08-22')], {
      today: TODAY,
    })
    expect(r.date).toBe('2026-08-26')
    expect(r.daysAgo).toBe(1)
    expect(r.previousCount).toBe(2)
  })

  it('métrica positiva: subir es "better"', () => {
    const r = computeLastEntryTrend(
      [log('2026-08-25', { energy_level: 4 }), log('2026-08-26', { energy_level: 9 })],
      { today: TODAY }
    )
    expect(r.metrics.energy_level).toMatchObject({
      value: 9,
      base: 4,
      delta: 5,
      direction: 'better',
    })
  })

  it('métrica negativa (estrés): subir es "worse"', () => {
    const r = computeLastEntryTrend(
      [log('2026-08-25', { stress_level: 2 }), log('2026-08-26', { stress_level: 9 })],
      { today: TODAY }
    )
    expect(r.metrics.stress_level.direction).toBe('worse')
  })

  it('métrica negativa (fatiga): bajar es "better"', () => {
    const r = computeLastEntryTrend(
      [log('2026-08-25', { muscle_fatigue: 9 }), log('2026-08-26', { muscle_fatigue: 2 })],
      { today: TODAY }
    )
    expect(r.metrics.muscle_fatigue.direction).toBe('better')
  })

  it('cambios menores al mínimo se consideran "flat"', () => {
    const r = computeLastEntryTrend(
      [log('2026-08-25', { energy_level: 8 }), log('2026-08-26', { energy_level: 8 })],
      { today: TODAY }
    )
    expect(r.metrics.energy_level.direction).toBe('flat')
  })

  it('sin días previos no hay tendencia (direction null)', () => {
    const r = computeLastEntryTrend([log('2026-08-26')], { today: TODAY })
    expect(r.metrics.energy_level.direction).toBeNull()
    expect(r.metrics.energy_level.value).toBe(8)
  })

  it('conserva source para poder marcar los registros cargados por el coach', () => {
    const r = computeLastEntryTrend([log('2026-08-26', { source: 'coach' })], { today: TODAY })
    expect(r.source).toBe('coach')
  })
})

describe('computeWellbeingSummary', () => {
  it('sin registros → hasData false y status none', () => {
    const s = computeWellbeingSummary({ logs: [], today: TODAY })
    expect(s.hasData).toBe(false)
    expect(s.status).toBe('none')
    expect(s.last).toBeNull()
  })

  it('recorta al rango pedido: los promedios ignoran lo de afuera', () => {
    const s = computeWellbeingSummary({
      logs: [log('2026-07-01', { energy_level: 1 }), log('2026-08-26', { energy_level: 9 })],
      from: '2026-08-01',
      to: '2026-08-27',
      today: TODAY,
    })
    expect(s.entries).toBe(1)
    expect(s.averages.energy_level.avg).toBe(9)
  })

  it('el semáforo aprovecha logs anteriores a `from` (ventana de 14 días > período corto)', () => {
    // Período de 3 días, pero la mala racha empezó antes: el semáforo la ve,
    // los promedios del período no.
    const logs = ['2026-08-20', '2026-08-21', '2026-08-22'].map((d) => log(d, { energy_level: 2 }))
    const s = computeWellbeingSummary({
      logs: [...logs, log('2026-08-26', { energy_level: 9 })],
      from: '2026-08-25',
      to: '2026-08-27',
      today: TODAY,
    })
    expect(s.entries).toBe(1)
    expect(s.averages.energy_level.avg).toBe(9)
    expect(s.status).toBe('bad')
  })

  it('el semáforo mira los últimos 14 días aunque el período sea más largo', () => {
    const viejos = ['2026-06-01', '2026-06-02', '2026-06-03'].map((d) =>
      log(d, { energy_level: 1 })
    )
    const s = computeWellbeingSummary({
      logs: [...viejos, log('2026-08-26')],
      from: '2026-06-01',
      to: '2026-08-27',
      today: TODAY,
    })
    expect(s.entries).toBe(4)
    expect(s.status).toBe('good')
    expect(s.windowDays).toBe(ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS)
  })
})

describe('summarizeByStudent', () => {
  it('agrupa por alumno y no mezcla datos', () => {
    const logs = [
      { user_id: 'a', date: '2026-08-26', ...OK, energy_level: 9 },
      { user_id: 'b', date: '2026-08-24', ...OK, energy_level: 2 },
      { user_id: 'b', date: '2026-08-25', ...OK, energy_level: 2 },
      { user_id: 'b', date: '2026-08-26', ...OK, energy_level: 2 },
    ]
    const map = summarizeByStudent(logs, { to: '2026-08-27', today: TODAY })
    expect(map.get('a').status).toBe('good')
    expect(map.get('b').status).toBe('bad')
    expect(map.get('a').entries).toBe(1)
    expect(map.get('b').entries).toBe(3)
  })

  it('descarta filas sin user_id', () => {
    expect(summarizeByStudent([{ date: '2026-08-26' }], { today: TODAY }).size).toBe(0)
  })
})

describe('describeLastEntry + wellbeingStatusConfig', () => {
  it('describe el último registro en lenguaje corto', () => {
    expect(describeLastEntry(0)).toBe('hoy')
    expect(describeLastEntry(1)).toBe('ayer')
    expect(describeLastEntry(5)).toBe('hace 5 días')
    expect(describeLastEntry(null)).toBe('sin registros')
  })

  it('cae en "none" ante un status desconocido', () => {
    expect(wellbeingStatusConfig('cualquier-cosa').key).toBe('none')
    expect(wellbeingStatusConfig('bad').key).toBe('bad')
  })
})
