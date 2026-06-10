import { describe, it, expect } from 'vitest'
import { parseBlockLetter, groupStrengthExercises } from './helpers'

describe('parseBlockLetter', () => {
  it('extrae la letra de un label letra+número', () => {
    expect(parseBlockLetter('A1')).toBe('A')
    expect(parseBlockLetter('b2')).toBe('B')
    expect(parseBlockLetter('C10')).toBe('C')
  })

  it('devuelve null para labels sin patrón o vacíos', () => {
    expect(parseBlockLetter(null)).toBeNull()
    expect(parseBlockLetter('')).toBeNull()
    expect(parseBlockLetter('Activación')).toBeNull()
    expect(parseBlockLetter('A')).toBeNull()
    expect(parseBlockLetter('1')).toBeNull()
  })
})

describe('groupStrengthExercises', () => {
  const ex = (id, block_label, rest_time = null) => ({ id, block_label, rest_time })

  it('agrupa ejercicios consecutivos con la misma letra', () => {
    const items = groupStrengthExercises([
      ex('1', 'A1', '1MIN30SEG'),
      ex('2', 'A2', '1MIN30SEG'),
      ex('3', 'B1', '1min'),
      ex('4', 'B2', '1m'),
    ])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ type: 'group', letter: 'A', restTime: '1MIN30SEG' })
    expect(items[0].exercises.map((e) => e.id)).toEqual(['1', '2'])
    expect(items[1]).toMatchObject({ type: 'group', letter: 'B', restTime: '1min' })
  })

  it('una letra que aparece sola queda como solo', () => {
    const items = groupStrengthExercises([ex('1', 'A1', '1min')])
    expect(items).toEqual([{ type: 'solo', exercise: ex('1', 'A1', '1min') }])
  })

  it('ejercicios sin letra (null o texto libre) son sueltos', () => {
    const items = groupStrengthExercises([
      ex('1', null),
      ex('2', 'Activación'),
      ex('3', 'A1', '1min'),
      ex('4', 'A2', '1min'),
    ])
    expect(items.map((i) => i.type)).toEqual(['solo', 'solo', 'group'])
    expect(items[2].letter).toBe('A')
  })

  it('restTime toma el primer valor no vacío del grupo (ignora vacíos y None)', () => {
    const items = groupStrengthExercises([
      ex('1', 'A1', ''),
      ex('2', 'A2', 'None'),
      ex('3', 'A3', '90s'),
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'group', restTime: '90s' })
  })

  it('no agrupa mismas letras NO consecutivas', () => {
    const items = groupStrengthExercises([
      ex('1', 'A1', '1min'),
      ex('2', 'B1'),
      ex('3', 'A2', '1min'),
    ])
    expect(items.map((i) => i.type)).toEqual(['solo', 'solo', 'solo'])
  })

  it('maneja lista vacía o nula', () => {
    expect(groupStrengthExercises([])).toEqual([])
    expect(groupStrengthExercises(null)).toEqual([])
  })
})
