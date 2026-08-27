import { describe, it, expect, vi } from 'vitest'
import { fetchAllRows } from './fetchAllRows'

// Simula PostgREST: respeta range(from, to) sobre un dataset en memoria.
const makeBuilder = (total, { failOnPage = null } = {}) => {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }))
  const build = vi.fn(async (from, to) => {
    const page = Math.floor(from / (to - from + 1))
    if (failOnPage !== null && page === failOnPage) {
      return { data: null, error: new Error('boom') }
    }
    return { data: all.slice(from, to + 1), error: null }
  })
  return build
}

describe('fetchAllRows', () => {
  it('una sola página cuando hay menos filas que el pageSize', async () => {
    const build = makeBuilder(30)
    const rows = await fetchAllRows(build, { pageSize: 100 })
    expect(rows).toHaveLength(30)
    expect(build).toHaveBeenCalledTimes(1)
    expect(build).toHaveBeenCalledWith(0, 99)
  })

  it('pagina más allá del tope de 1000 sin perder filas (el bug de los 22 inactivos)', async () => {
    const build = makeBuilder(1893)
    const rows = await fetchAllRows(build, { pageSize: 1000 })
    expect(rows).toHaveLength(1893)
    expect(rows[1892]).toEqual({ id: 1892 })
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('página exacta: hace un request extra vacío y termina', async () => {
    const build = makeBuilder(200)
    const rows = await fetchAllRows(build, { pageSize: 100 })
    expect(rows).toHaveLength(200)
    expect(build).toHaveBeenCalledTimes(3) // 100 + 100 + 0
  })

  it('propaga el error de cualquier página', async () => {
    const build = makeBuilder(500, { failOnPage: 1 })
    await expect(fetchAllRows(build, { pageSize: 100 })).rejects.toThrow('boom')
  })

  it('corta en maxPages como tope de seguridad', async () => {
    const build = vi.fn(async (from, to) => ({
      data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })),
      error: null,
    }))
    const rows = await fetchAllRows(build, { pageSize: 10, maxPages: 3 })
    expect(rows).toHaveLength(30)
    expect(build).toHaveBeenCalledTimes(3)
  })
})
