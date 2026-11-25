import { describe, it, expect } from 'vitest'
import { rawSessionMinutes, isCredibleDuration, credibleSessionMinutes } from './sessionDuration'

const at = (hhmm) => `2026-11-23T${hhmm}:00-03:00`

describe('rawSessionMinutes', () => {
  it('calcula los minutos entre inicio y fin', () => {
    expect(rawSessionMinutes(at('10:00'), at('10:45'))).toBe(45)
  })
  it('null si falta un extremo o no es positivo', () => {
    expect(rawSessionMinutes(null, at('10:45'))).toBeNull()
    expect(rawSessionMinutes(at('10:45'), at('10:45'))).toBeNull()
  })
})

describe('isCredibleDuration', () => {
  it('acepta una sesión normal', () => {
    expect(isCredibleDuration(45, 12)).toBe(true)
  })
  it('oculta la carga al final (12 ejercicios en 2 minutos)', () => {
    expect(isCredibleDuration(2, 12)).toBe(false)
  })
  it('oculta la sesión que quedó abierta (199 minutos)', () => {
    expect(isCredibleDuration(199, 14)).toBe(false)
  })
  it('respeta los bordes de 10 y 150 minutos', () => {
    expect(isCredibleDuration(9)).toBe(false)
    expect(isCredibleDuration(10)).toBe(true)
    expect(isCredibleDuration(150)).toBe(true)
    expect(isCredibleDuration(151)).toBe(false)
  })
  it('oculta si da menos de un minuto por ejercicio', () => {
    expect(isCredibleDuration(11, 12)).toBe(false)
    expect(isCredibleDuration(12, 12)).toBe(true)
  })
  it('sin cantidad de ejercicios, solo mira el rango', () => {
    expect(isCredibleDuration(11)).toBe(true)
  })
})

describe('credibleSessionMinutes', () => {
  it('devuelve los minutos o null', () => {
    expect(credibleSessionMinutes(at('10:00'), at('10:46'), 10)).toBe(46)
    expect(credibleSessionMinutes(at('06:24'), at('06:26'), 12)).toBeNull()
  })
})
