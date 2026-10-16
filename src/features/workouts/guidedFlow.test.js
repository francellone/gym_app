import { describe, expect, it, vi } from 'vitest'
import {
  allResolved,
  firstPending,
  nextPendingAfter,
  onBlockOpenRequest,
  requestBlockOpen,
} from './guidedFlow'

describe('nextPendingAfter', () => {
  const ids = ['b1', 'b2', 'b3', 'b4']
  it('abre el siguiente pendiente de abajo', () => {
    expect(nextPendingAfter(ids, ['b1', 'b2'], 'b2')).toBe('b3')
  })
  it('saltea los ya resueltos', () => {
    expect(nextPendingAfter(ids, ['b2', 'b3'], 'b2')).toBe('b4')
  })
  it('no vuelve hacia arriba si abajo no queda nada', () => {
    expect(nextPendingAfter(ids, ['b2', 'b3', 'b4'], 'b4')).toBeNull()
  })
  it('id desconocido → null', () => {
    expect(nextPendingAfter(ids, [], 'zz')).toBeNull()
  })
})

describe('allResolved / firstPending', () => {
  it('todo resuelto', () => {
    expect(allResolved(['a', 'b'], new Set(['a', 'b']))).toBe(true)
    expect(allResolved(['a', 'b'], ['a'])).toBe(false)
    expect(allResolved([], [])).toBe(false)
  })
  it('primer pendiente', () => {
    expect(firstPending(['a', 'b', 'c'], ['a'])).toBe('b')
    expect(firstPending(['a'], ['a'])).toBeNull()
  })
})

describe('pedido de abrir bloque', () => {
  it('llega a quien escucha y se puede desuscribir', () => {
    const h = vi.fn()
    const off = onBlockOpenRequest(h)
    requestBlockOpen('blk-2')
    expect(h).toHaveBeenCalledWith('blk-2')
    off()
    requestBlockOpen('blk-3')
    expect(h).toHaveBeenCalledTimes(1)
  })
})
