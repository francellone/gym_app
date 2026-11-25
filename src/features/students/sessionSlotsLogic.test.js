import { describe, it, expect } from 'vitest'
import { rowSessionDates, groupSessionDates, alignSlots, slotLabel } from './sessionSlotsLogic'

describe('sessionSlotsLogic', () => {
  it('junta las fechas de registros y omitidos de la fila', () => {
    const row = { recentLogs: [{ logged_date: '2026-11-16' }, { logged_date: '2026-11-09' }] }
    expect([...rowSessionDates(row, ['2026-11-03'])].sort()).toEqual([
      '2026-11-03',
      '2026-11-09',
      '2026-11-16',
    ])
    expect(rowSessionDates({}, []).size).toBe(0)
  })

  it('las fechas del grupo son las de ese día, no las de toda la persona', () => {
    const a1 = new Set(['2026-11-03', '2026-11-09', '2026-11-16'])
    const a2 = new Set(['2026-11-09', '2026-11-16'])
    expect(groupSessionDates([a1, a2], 3)).toEqual(['2026-11-03', '2026-11-09', '2026-11-16'])
    expect(groupSessionDates([a1, a2], 2)).toEqual(['2026-11-09', '2026-11-16'])
    expect(groupSessionDates([a1], 'all')).toHaveLength(3)
  })

  it('alinea a la derecha: la última vez queda en la última columna', () => {
    const { slotCount, padded } = alignSlots([['a', 'b', 'c'], ['x']])
    expect(slotCount).toBe(3)
    expect(padded[0]).toEqual(['a', 'b', 'c'])
    expect(padded[1]).toEqual([null, null, 'x'])
    expect(alignSlots([]).slotCount).toBe(0)
  })

  it('rotula las columnas desde la última', () => {
    expect(slotLabel(2, 3)).toEqual({ key: 'last', n: 0 })
    expect(slotLabel(1, 3)).toEqual({ key: 'prev', n: 1 })
    expect(slotLabel(0, 3)).toEqual({ key: 'nth', n: 2 })
  })
})
