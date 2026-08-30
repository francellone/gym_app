import { describe, it, expect } from 'vitest'
import { isProfileActive, filterByActiveStatus, displayValue } from './helpers'

// v40: estado activo/inactivo del perfil. Todo mockeado — cero filas en la base.

describe('isProfileActive', () => {
  it('true y null/undefined cuentan como activo (default true en la BD)', () => {
    expect(isProfileActive({ active: true })).toBe(true)
    expect(isProfileActive({ active: null })).toBe(true)
    expect(isProfileActive({})).toBe(true)
    expect(isProfileActive(null)).toBe(true)
  })

  it('solo false explícito es inactivo', () => {
    expect(isProfileActive({ active: false })).toBe(false)
  })
})

describe('filterByActiveStatus', () => {
  const ana = { id: 1, name: 'Ana', active: true }
  const bea = { id: 2, name: 'Bea', active: false }
  const cai = { id: 3, name: 'Cai', active: null } // datos viejos sin flag
  const dua = { id: 4, name: 'Dua', active: true }
  const list = [ana, bea, cai, dua] // ya viene ordenada alfabéticamente

  it("'active' (default) deja solo activos, incluyendo null", () => {
    expect(filterByActiveStatus(list, 'active')).toEqual([ana, cai, dua])
  })

  it("'inactive' deja solo los false explícitos", () => {
    expect(filterByActiveStatus(list, 'inactive')).toEqual([bea])
  })

  it("'all' muestra todos con inactivos al final, preservando el alfabético", () => {
    expect(filterByActiveStatus(list, 'all')).toEqual([ana, cai, dua, bea])
  })

  it("'all' no muta la lista original", () => {
    filterByActiveStatus(list, 'all')
    expect(list).toEqual([ana, bea, cai, dua])
  })

  it('tolera lista vacía o null', () => {
    expect(filterByActiveStatus([], 'active')).toEqual([])
    expect(filterByActiveStatus(null, 'all')).toEqual([])
  })
})

describe("displayValue('active')", () => {
  it('false → Inactivo; true/null → Activo (default de la BD)', () => {
    expect(displayValue('active', false)).toBe('Inactivo')
    expect(displayValue('active', 'false')).toBe('Inactivo')
    expect(displayValue('active', true)).toBe('Activo')
    expect(displayValue('active', null)).toBe('Activo')
  })
})
