// ============================================================
// helpers — tests de inheritFromFirstBlockmate (Q7)
// ------------------------------------------------------------
// Cubre la lógica de auto-numeración A1/A2 + herencia de
// pausa/series del primer ejercicio del bloque.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  inheritFromFirstBlockmate,
  isBlockOrderValid,
  reorderByBlockmate,
  countUnlettered,
  hasNumberGaps,
} from './helpers'

describe('inheritFromFirstBlockmate (Q7)', () => {
  it('letra vacía → limpia letter y number', () => {
    const list = [{ block_letter: 'A', block_number: '1', suggested_sets: '3', rest_time: '90s' }]
    expect(inheritFromFirstBlockmate({ list, currentIndex: 0, letter: '' })).toEqual({
      block_letter: '',
      block_number: '',
    })
  })

  it('primera vez con esa letra → arranca en 1, sin herencia', () => {
    const list = [
      { block_letter: 'A', block_number: '1', suggested_sets: '3', rest_time: '90s' },
      { block_letter: '', block_number: '', suggested_sets: '', rest_time: '' },
    ]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 1, letter: 'B' })
    expect(patches).toEqual({ block_letter: 'B', block_number: '1' })
  })

  it('segunda letra igual → autoincrementa a 2 y hereda series/descanso', () => {
    const list = [
      { block_letter: 'A', block_number: '1', suggested_sets: '4', rest_time: '60s' },
      { block_letter: '', block_number: '', suggested_sets: '', rest_time: '' },
    ]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 1, letter: 'A' })
    expect(patches).toEqual({
      block_letter: 'A',
      block_number: '2',
      suggested_sets: '4',
      rest_time: '60s',
    })
  })

  it('tercera letra igual → autoincrementa a 3 sobre el max existente', () => {
    const list = [
      { block_letter: 'A', block_number: '1', suggested_sets: '4', rest_time: '60s' },
      { block_letter: 'A', block_number: '2', suggested_sets: '4', rest_time: '60s' },
      { block_letter: '', block_number: '', suggested_sets: '', rest_time: '' },
    ]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 2, letter: 'A' })
    expect(patches.block_number).toBe('3')
    expect(patches.suggested_sets).toBe('4')
    expect(patches.rest_time).toBe('60s')
  })

  it('NO pisa series ya cargadas por el coach', () => {
    const list = [
      { block_letter: 'A', block_number: '1', suggested_sets: '4', rest_time: '60s' },
      { block_letter: '', block_number: '', suggested_sets: '5', rest_time: '' }, // ya tiene 5 series
    ]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 1, letter: 'A' })
    expect(patches.block_letter).toBe('A')
    expect(patches.block_number).toBe('2')
    expect(patches.suggested_sets).toBeUndefined() // NO viene en patches → no se pisa
    expect(patches.rest_time).toBe('60s') // descanso sí, porque estaba vacío
  })

  it('NO pisa descanso ya cargado por el coach', () => {
    const list = [
      { block_letter: 'A', block_number: '1', suggested_sets: '4', rest_time: '60s' },
      { block_letter: '', block_number: '', suggested_sets: '', rest_time: '2m' },
    ]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 1, letter: 'A' })
    expect(patches.suggested_sets).toBe('4')
    expect(patches.rest_time).toBeUndefined() // NO viene en patches → no se pisa
  })

  it('si el primero no tiene series/descanso, no agrega esos patches', () => {
    const list = [
      { block_letter: 'A', block_number: '1', suggested_sets: '', rest_time: '' },
      { block_letter: '', block_number: '', suggested_sets: '', rest_time: '' },
    ]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 1, letter: 'A' })
    expect(patches).toEqual({ block_letter: 'A', block_number: '2' })
  })

  it('toma el primero por número (block_number==1), no por orden en la lista', () => {
    // Coach insertó A2 antes que A1 en el orden de la lista
    const list = [
      { block_letter: 'A', block_number: '2', suggested_sets: '5', rest_time: '120s' },
      { block_letter: 'A', block_number: '1', suggested_sets: '4', rest_time: '60s' }, // este es el "primero"
      { block_letter: '', block_number: '', suggested_sets: '', rest_time: '' },
    ]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 2, letter: 'A' })
    expect(patches.suggested_sets).toBe('4') // hereda del de número 1, no del de la lista
    expect(patches.rest_time).toBe('60s')
    expect(patches.block_number).toBe('3') // max(2, 1) + 1
  })

  it('si no hay número 1, hereda del de menor número', () => {
    const list = [
      { block_letter: 'A', block_number: '2', suggested_sets: '5', rest_time: '120s' },
      { block_letter: 'A', block_number: '3', suggested_sets: '6', rest_time: '90s' },
      { block_letter: '', block_number: '', suggested_sets: '', rest_time: '' },
    ]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 2, letter: 'A' })
    expect(patches.suggested_sets).toBe('5') // hereda del de menor número (2)
    expect(patches.block_number).toBe('4') // max(2, 3) + 1
  })

  it('excluye al ejercicio actual del cálculo (ej: reabrir un select sin cambios)', () => {
    const list = [
      { block_letter: 'A', block_number: '1', suggested_sets: '4', rest_time: '60s' },
      { block_letter: 'A', block_number: '2', suggested_sets: '4', rest_time: '60s' }, // este es el currentIndex
    ]
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 1, letter: 'A' })
    // Solo "ve" al A1 como otro → próximo número = 2 (no 3)
    expect(patches.block_number).toBe('2')
  })

  it('capea en 10 si ya hay 10 ejercicios con esa letra', () => {
    const list = Array.from({ length: 10 }, (_, i) => ({
      block_letter: 'A',
      block_number: String(i + 1),
      suggested_sets: '3',
      rest_time: '60s',
    }))
    list.push({ block_letter: '', block_number: '', suggested_sets: '', rest_time: '' })
    const patches = inheritFromFirstBlockmate({ list, currentIndex: 10, letter: 'A' })
    expect(patches.block_number).toBe('10') // cap
  })

  it('tolera list undefined o vacía', () => {
    expect(inheritFromFirstBlockmate({ list: undefined, currentIndex: 0, letter: 'A' })).toEqual({
      block_letter: 'A',
      block_number: '1',
    })
    expect(inheritFromFirstBlockmate({ list: [], currentIndex: 0, letter: 'A' })).toEqual({
      block_letter: 'A',
      block_number: '1',
    })
  })
})

const ex = (letter, number) => ({ block_letter: letter, block_number: String(number) })
const blank = () => ({ block_letter: '', block_number: '' })

describe('isBlockOrderValid (Q7 banner)', () => {
  it('lista vacía → válido', () => {
    expect(isBlockOrderValid([])).toBe(true)
    expect(isBlockOrderValid(undefined)).toBe(true)
  })

  it('todos sin letra → válido (ignora completamente)', () => {
    expect(isBlockOrderValid([blank(), blank(), blank()])).toBe(true)
  })

  it('un solo ejercicio con letra → válido', () => {
    expect(isBlockOrderValid([ex('A', 1)])).toBe(true)
  })

  it('A1, A2, B1 → válido', () => {
    expect(isBlockOrderValid([ex('A', 1), ex('A', 2), ex('B', 1)])).toBe(true)
  })

  it('A1, B1, A2 → INVÁLIDO (A reaparece después de B)', () => {
    expect(isBlockOrderValid([ex('A', 1), ex('B', 1), ex('A', 2)])).toBe(false)
  })

  it('A2, A1 → INVÁLIDO (número descendente dentro de la letra)', () => {
    expect(isBlockOrderValid([ex('A', 2), ex('A', 1)])).toBe(false)
  })

  it('A1, A1 → válido (números iguales OK)', () => {
    expect(isBlockOrderValid([ex('A', 1), ex('A', 1)])).toBe(true)
  })

  it('sin-letra mezclados se ignoran en el análisis', () => {
    expect(isBlockOrderValid([ex('A', 1), blank(), ex('A', 2), blank(), ex('B', 1)])).toBe(true)
    expect(isBlockOrderValid([ex('A', 1), blank(), ex('B', 1), blank(), ex('A', 2)])).toBe(false)
  })

  it('A1, B1, C1 → válido (varias letras consecutivas)', () => {
    expect(isBlockOrderValid([ex('A', 1), ex('B', 1), ex('C', 1)])).toBe(true)
  })

  it('B1, A1 → INVÁLIDO si después aparece B otra vez', () => {
    expect(isBlockOrderValid([ex('B', 1), ex('A', 1), ex('B', 2)])).toBe(false)
  })

  it('B1, A1 → válido si no hay reaparición (el orden alfabético no es requisito)', () => {
    // Solo el agrupamiento consecutivo es requisito, no el orden alfabético.
    expect(isBlockOrderValid([ex('B', 1), ex('B', 2), ex('A', 1)])).toBe(true)
  })
})

describe('reorderByBlockmate (Q7 banner — "Reordenar")', () => {
  it('lista vacía → vacía', () => {
    expect(reorderByBlockmate([])).toEqual([])
  })

  it('orden ya válido → mismo orden (con order_index aplicado)', () => {
    const list = [ex('A', 1), ex('A', 2), ex('B', 1)]
    const out = reorderByBlockmate(list)
    expect(out.map((e) => `${e.block_letter}${e.block_number}`)).toEqual(['A1', 'A2', 'B1'])
    expect(out.map((e) => e.order_index)).toEqual([0, 1, 2])
  })

  it('A1, B1, A2 → A1, A2, B1', () => {
    const out = reorderByBlockmate([ex('A', 1), ex('B', 1), ex('A', 2)])
    expect(out.map((e) => `${e.block_letter}${e.block_number}`)).toEqual(['A1', 'A2', 'B1'])
  })

  it('A2, A1 → A1, A2 (orden por número dentro de la letra)', () => {
    const out = reorderByBlockmate([ex('A', 2), ex('A', 1)])
    expect(out.map((e) => `${e.block_letter}${e.block_number}`)).toEqual(['A1', 'A2'])
  })

  it('sin-letra mantienen su slot original (no se mueven)', () => {
    // Slots:  0     1      2     3      4
    //         A2   sin    B1   sin    A1
    // Slots con-letra: 0, 2, 4 → quedan A1, A2, B1 en ese orden
    // Slots sin-letra: 1, 3 → quedan como están
    const blanks = [{ ...blank(), id: 'b1' }, { ...blank(), id: 'b2' }]
    const list = [ex('A', 2), blanks[0], ex('B', 1), blanks[1], ex('A', 1)]
    const out = reorderByBlockmate(list)
    expect(out.map((e) => `${e.block_letter}${e.block_number || ''}`)).toEqual([
      'A1',
      '',
      'A2',
      '',
      'B1',
    ])
    // Los sin-letra son los mismos objetos (preservados por slot, no por sort)
    expect(out[1].id).toBe('b1')
    expect(out[3].id).toBe('b2')
  })

  it('todos sin-letra → mismo orden', () => {
    const blanks = [
      { ...blank(), id: 'b1' },
      { ...blank(), id: 'b2' },
      { ...blank(), id: 'b3' },
    ]
    const out = reorderByBlockmate(blanks)
    expect(out.map((e) => e.id)).toEqual(['b1', 'b2', 'b3'])
  })

  it('aplica order_index secuencial 0..n-1', () => {
    const out = reorderByBlockmate([ex('B', 1), ex('A', 1), ex('A', 2)])
    expect(out.map((e) => e.order_index)).toEqual([0, 1, 2])
  })

  it('compacta números: A1, A2, A4, B1 → A1, A2, A3, B1', () => {
    const out = reorderByBlockmate([ex('A', 1), ex('A', 2), ex('A', 4), ex('B', 1)])
    expect(out.map((e) => `${e.block_letter}${e.block_number}`)).toEqual(['A1', 'A2', 'A3', 'B1'])
  })

  it('compacta números aunque el primero no sea 1: A3, A5 → A1, A2', () => {
    const out = reorderByBlockmate([ex('A', 3), ex('A', 5)])
    expect(out.map((e) => `${e.block_letter}${e.block_number}`)).toEqual(['A1', 'A2'])
  })

  it('compacta dentro de cada letra independientemente', () => {
    const out = reorderByBlockmate([ex('A', 1), ex('B', 3), ex('A', 7), ex('B', 5)])
    expect(out.map((e) => `${e.block_letter}${e.block_number}`)).toEqual(['A1', 'A2', 'B1', 'B2'])
  })
})

describe('hasNumberGaps (Q7 banner — detección de huecos)', () => {
  it('sin ejercicios con letra → false', () => {
    expect(hasNumberGaps([])).toBe(false)
    expect(hasNumberGaps([blank(), blank()])).toBe(false)
  })

  it('A1 → false', () => {
    expect(hasNumberGaps([ex('A', 1)])).toBe(false)
  })

  it('A1, A2 → false (sin huecos)', () => {
    expect(hasNumberGaps([ex('A', 1), ex('A', 2)])).toBe(false)
  })

  it('A1, A2, A4 → true (falta A3)', () => {
    expect(hasNumberGaps([ex('A', 1), ex('A', 2), ex('A', 4)])).toBe(true)
  })

  it('A2 (sin A1) → true', () => {
    expect(hasNumberGaps([ex('A', 2)])).toBe(true)
  })

  it('A1, A2, B1, B3 → true (gap en B)', () => {
    expect(hasNumberGaps([ex('A', 1), ex('A', 2), ex('B', 1), ex('B', 3)])).toBe(true)
  })

  it('A1, B1, C1 → false (cada letra tiene solo 1, sin huecos)', () => {
    expect(hasNumberGaps([ex('A', 1), ex('B', 1), ex('C', 1)])).toBe(false)
  })

  it('orden de aparición no importa: A2, A1 → false (no gaps, solo desorden)', () => {
    expect(hasNumberGaps([ex('A', 2), ex('A', 1)])).toBe(false)
  })

  it('sin-letra mezclados no afectan', () => {
    expect(hasNumberGaps([ex('A', 1), blank(), ex('A', 2)])).toBe(false)
    expect(hasNumberGaps([ex('A', 1), blank(), ex('A', 3)])).toBe(true)
  })
})

describe('countUnlettered', () => {
  it('cuenta los sin letra', () => {
    expect(countUnlettered([ex('A', 1), blank(), ex('B', 1), blank(), blank()])).toBe(3)
  })
  it('cero si todos tienen letra', () => {
    expect(countUnlettered([ex('A', 1), ex('B', 1)])).toBe(0)
  })
  it('tolera undefined', () => {
    expect(countUnlettered(undefined)).toBe(0)
  })
})
