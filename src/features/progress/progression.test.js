// ============================================================
// computeProgression: promedio primera vs última semana.
// Los tests fijan las dos propiedades por las que se eligió esta definición
// sobre "primer log vs último log": robustez a un día atípico en las puntas
// y comportamiento explicable en rangos cortos.
// ============================================================
import { describe, it, expect } from 'vitest'
import { computeProgression, repsMaxOfLog } from './progression'

const p = (date, value) => ({ date, value })

describe('computeProgression', () => {
  it('devuelve null con menos de 2 puntos válidos', () => {
    expect(computeProgression([])).toBeNull()
    expect(computeProgression(null)).toBeNull()
    expect(computeProgression([p('2026-08-01', 50)])).toBeNull()
    // valores <= 0 no cuentan como puntos
    expect(computeProgression([p('2026-08-01', 50), p('2026-08-20', 0)])).toBeNull()
  })

  it('con 2+ semanas compara promedios de la primera y la última semana', () => {
    const r = computeProgression([
      p('2026-07-01', 40),
      p('2026-07-03', 44), // 1ª semana: prom 42
      p('2026-07-29', 50),
      p('2026-07-31', 54), // última semana: prom 52
    ])
    expect(r.basis).toBe('weeks')
    expect(r.firstAvg).toBe(42)
    expect(r.lastAvg).toBe(52)
    expect(r.pct).toBe(24) // (52-42)/42
  })

  it('un día atípico en la punta pesa 1/N, no el 100% (la razón del cambio)', () => {
    // Primer día suave (30) pero la semana real anduvo en 50.
    // Con primer-vs-último daría (55-30)/30 = +83%; acá el 30 se diluye.
    const r = computeProgression([
      p('2026-07-01', 30),
      p('2026-07-03', 50),
      p('2026-07-05', 50),
      p('2026-08-01', 55),
      p('2026-08-03', 55),
    ])
    expect(r.firstAvg).toBeCloseTo(43.3, 1)
    expect(r.pct).toBe(27)
  })

  it('rango menor a 14 días: cae a primer vs último valor', () => {
    const r = computeProgression([p('2026-08-01', 50), p('2026-08-10', 55)])
    expect(r.basis).toBe('points')
    expect(r.pct).toBe(10)
  })

  it('acepta puntos desordenados y varios por fecha', () => {
    const r = computeProgression([
      p('2026-07-31', 54),
      p('2026-07-01', 40),
      p('2026-07-01', 44),
      p('2026-07-29', 50),
    ])
    expect(r.basis).toBe('weeks')
    expect(r.firstAvg).toBe(42)
    expect(r.lastAvg).toBe(52)
  })

  it('progresión negativa sale negativa', () => {
    const r = computeProgression([p('2026-07-01', 50), p('2026-08-01', 40)])
    expect(r.pct).toBe(-20)
  })
})

describe('repsMaxOfLog', () => {
  it('lee jsonb y devuelve el máximo', () => {
    expect(repsMaxOfLog({ actual_reps_jsonb: ['8', '10', '9'] })).toBe(10)
  })
  it('sin reps numéricas devuelve 0', () => {
    expect(repsMaxOfLog({})).toBe(0)
    expect(repsMaxOfLog({ actual_reps_jsonb: ['x', ''] })).toBe(0)
  })
})
