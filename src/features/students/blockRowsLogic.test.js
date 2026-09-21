import { describe, it, expect } from 'vitest'
import {
  blockPrescriptionSummary,
  blockRowName,
  displayBlockLogMain,
  blockMetricOf,
  buildBlockRow,
  sortRowsInSection,
  rowMatchesType,
} from './blockRowsLogic'

const aerobic = {
  id: 'b1',
  plan_id: 'p1',
  section: 'day_a',
  block_type: 'aerobic',
  order_index: 2,
  title: null,
  aerobic_format: 'continuous',
  aerobic_total_minutes: 30,
  aerobic_zone: 'Z2',
}
const circuit = {
  id: 'b2',
  plan_id: 'p1',
  section: 'day_a',
  block_type: 'circuit',
  order_index: 3,
  title: 'Metcon',
  circuit_type: 'amrap',
  circuit_rounds: 4,
  circuit_total_minutes: 12,
  circuit_intensity: 'intense',
}

describe('blockPrescriptionSummary', () => {
  it('aeróbico: zona, minutos y formato', () => {
    expect(blockPrescriptionSummary(aerobic)).toBe('Z2 · 30 min · Continuo')
  })
  it('circuito: tipo, rondas, minutos e intensidad', () => {
    expect(blockPrescriptionSummary(circuit)).toBe('AMRAP · 4 rondas · 12 min · Intenso')
  })
})

describe('blockRowName', () => {
  it('usa el título si la coach lo puso', () => {
    expect(blockRowName(circuit, 'Burpees')).toBe('Metcon')
  })
  it('sin título: tipo y ejercicio', () => {
    expect(blockRowName(aerobic, 'Bici')).toBe('Aeróbico · Bici')
    expect(blockRowName(aerobic)).toBe('Aeróbico')
  })
})

describe('displayBlockLogMain / blockMetricOf', () => {
  it('minutos y rondas', () => {
    expect(displayBlockLogMain({ actual_minutes: 30 })).toBe('30 min')
    expect(displayBlockLogMain({ actual_minutes: 12, actual_rounds: 4 })).toBe('12 min · 4 rondas')
    expect(displayBlockLogMain({})).toBe('—')
  })
  it('la métrica principal es minutos, si no rondas', () => {
    expect(blockMetricOf({ actual_minutes: '25.5', actual_rounds: 3 })).toBe(25.5)
    expect(blockMetricOf({ actual_rounds: 3 })).toBe(3)
    expect(blockMetricOf({})).toBe(0)
  })
})

describe('buildBlockRow', () => {
  const logs = [
    { id: 'l2', logged_date: '2026-09-10', actual_minutes: 35, perceived_difficulty: 6 },
    { id: 'l1', logged_date: '2026-09-03', actual_minutes: 30, perceived_difficulty: 5 },
    { id: 'l3', logged_date: '2026-09-17', actual_minutes: 40, perceived_difficulty: 7 },
  ]
  it('arma una fila con la forma de la tabla, ordenada por fecha', () => {
    const r = buildBlockRow({ ...aerobic, exerciseName: 'Bici', exerciseId: 'e1' }, logs)
    expect(r.kind).toBe('block')
    expect(r.id).toBe('blk-b1')
    expect(r.blockType).toBe('aerobic')
    expect(r.exerciseId).toBe('e1')
    expect(r.exerciseName).toBe('Aeróbico · Bici')
    expect(r.muscleGroup).toBe('Z2 · 30 min · Continuo')
    expect(r.recentLogs.map((l) => l.id)).toEqual(['l3', 'l2', 'l1'])
    expect(r.count).toBe(3)
    expect(r.avgPse).toBe(6)
    expect(r.maxMinutes).toBe(40)
    expect(r.volume).toBe(105)
    expect(r.trend).toBe('↑')
    expect(r.hasLogs).toBe(true)
    expect(r.suggested_weightStr).toBe('30 min')
    expect(r.sparklineValues).toEqual([30, 35, 40])
    expect(r.progressMetric).toBe('Min')
    expect(r.progressPct).toBeGreaterThan(0)
  })
  it('sin registros: fila prescripta vacía', () => {
    const r = buildBlockRow(circuit, [])
    expect(r.hasLogs).toBe(false)
    expect(r.trend).toBe('—')
    expect(r.avgPse).toBeNull()
    expect(r.maxMinutes).toBeNull()
    expect(r.suggested_sets).toBe(4)
  })
  it('AMRAP sin minutos: progresa por rondas', () => {
    const r = buildBlockRow(circuit, [
      { id: 'a', logged_date: '2026-09-01', actual_rounds: 3 },
      { id: 'b', logged_date: '2026-09-15', actual_rounds: 5 },
    ])
    expect(r.progressMetric).toBe('Rondas')
    expect(r.trend).toBe('↑')
    expect(r.sparklineValues).toEqual([3, 5])
  })
})

describe('sortRowsInSection', () => {
  it('ordena por bloque y conserva el orden de llegada dentro del bloque', () => {
    const rows = [
      { id: 'x1', blockOrder: 1 },
      { id: 'x2', blockOrder: 1 },
      { id: 'blk', blockOrder: 0 },
      { id: 'old' }, // sin bloque (plan viejo) → primero
    ]
    expect(sortRowsInSection(rows).map((r) => r.id)).toEqual(['old', 'blk', 'x1', 'x2'])
  })
  it('la fila del bloque encabeza a sus ejercicios (circuito)', () => {
    const rows = [
      { id: 'c1', blockOrder: 2, kind: 'exercise' },
      { id: 'c2', blockOrder: 2, kind: 'exercise' },
      { id: 'circ', blockOrder: 2, kind: 'block' },
    ]
    expect(sortRowsInSection(rows).map((r) => r.id)).toEqual(['circ', 'c1', 'c2'])
  })
})

describe('rowMatchesType', () => {
  it('filtra por tipo; los ejercicios sin bloque cuentan como fuerza', () => {
    const ex = { kind: 'exercise' }
    const blk = { kind: 'block', blockType: 'aerobic' }
    expect(rowMatchesType(ex, 'all')).toBe(true)
    expect(rowMatchesType(ex, 'strength')).toBe(true)
    expect(rowMatchesType(ex, 'aerobic')).toBe(false)
    expect(rowMatchesType(blk, 'aerobic')).toBe(true)
    expect(rowMatchesType(blk, 'circuit')).toBe(false)
  })
})
