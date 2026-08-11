import { describe, it, expect } from 'vitest'
import { normalizeExerciseName, findDuplicateByName } from './exercise-name'

// La tabla `exercises` no tiene índice único en `name`. Con el alta rápida
// desde el armador de planes el riesgo de duplicados sube, así que la
// detección tiene que aguantar acentos, mayúsculas y espacios de más.
describe('normalizeExerciseName', () => {
  it('saca acentos, mayúsculas y espacios de más', () => {
    expect(normalizeExerciseName('  Sentadilla   BÚLGARA ')).toBe('sentadilla bulgara')
  })

  it('tolera null/undefined', () => {
    expect(normalizeExerciseName(null)).toBe('')
    expect(normalizeExerciseName(undefined)).toBe('')
  })
})

describe('findDuplicateByName', () => {
  const catalogo = [
    { id: '1', name: 'Sentadilla búlgara' },
    { id: '2', name: 'Press banca' },
  ]

  it('encuentra el duplicado ignorando acentos y mayúsculas', () => {
    expect(findDuplicateByName(catalogo, 'SENTADILLA BULGARA')?.id).toBe('1')
  })

  it('devuelve null si no hay choque', () => {
    expect(findDuplicateByName(catalogo, 'Peso muerto')).toBeNull()
  })

  it('no marca al ejercicio como duplicado de sí mismo al editarlo', () => {
    expect(findDuplicateByName(catalogo, 'Sentadilla búlgara', '1')).toBeNull()
  })

  it('con nombre vacío no reporta nada', () => {
    expect(findDuplicateByName(catalogo, '   ')).toBeNull()
  })

  it('tolera catálogo vacío', () => {
    expect(findDuplicateByName(null, 'Press banca')).toBeNull()
  })
})
