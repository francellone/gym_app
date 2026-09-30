import { describe, it, expect, beforeEach } from 'vitest'
import { canTrain, hasBothViews, readPreferredView, savePreferredView } from './viewMode'
import { homePathFor } from './authLinks'
import { pathMatchesRole } from '@/features/navigation/lastRoute'

const coach = { id: 'c', role: 'coach', also_trains: false }
const both = { id: 'c', role: 'coach', also_trains: true }
const person = { id: 'p', role: 'student' }

describe('"Ambas" (v71)', () => {
  beforeEach(() => localStorage.clear())

  it('quién puede entrenar y quién ve el selector', () => {
    expect(canTrain(person)).toBe(true)
    expect(canTrain(coach)).toBe(false)
    expect(canTrain(both)).toBe(true)
    expect(hasBothViews(both)).toBe(true)
    expect(hasBothViews(person)).toBe(false)
  })

  it('la vista preferida arranca en coach y se recuerda', () => {
    expect(readPreferredView()).toBe('coach')
    savePreferredView('student')
    expect(readPreferredView()).toBe('student')
  })

  it('homePathFor respeta la vista elegida solo si la coach también entrena', () => {
    expect(homePathFor(both)).toBe('/coach')
    savePreferredView('student')
    expect(homePathFor(both)).toBe('/student')
    expect(homePathFor(coach)).toBe('/coach')
    expect(homePathFor(person)).toBe('/student')
  })

  it('la memoria de ruta acepta las dos vistas para "both"', () => {
    expect(pathMatchesRole('/student/workout', 'both')).toBe(true)
    expect(pathMatchesRole('/coach/students', 'both')).toBe(true)
    expect(pathMatchesRole('/student/workout', 'coach')).toBe(false)
  })
})
