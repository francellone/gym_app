import { describe, it, expect } from 'vitest'
import { parsePrescription, expandPerSet, isUniformPerSet } from './prescriptionRead'

describe('parsePrescription', () => {
  it('string suelto → escalar', () => {
    expect(parsePrescription('10')).toEqual({ kind: 'scalar', values: ['10'] })
    expect(parsePrescription('1 minuto')).toEqual({ kind: 'scalar', values: ['1 minuto'] })
  })
  it('JSON de array → array (con huecos preservados)', () => {
    expect(parsePrescription('["8","8","6"]')).toEqual({ kind: 'array', values: ['8', '8', '6'] })
    expect(parsePrescription('["5",""]')).toEqual({ kind: 'array', values: ['5', ''] })
    expect(parsePrescription('["",""]')).toEqual({ kind: 'array', values: ['', ''] })
  })
  it('array nativo y número', () => {
    expect(parsePrescription([40, null, 50])).toEqual({ kind: 'array', values: ['40', '', '50'] })
    expect(parsePrescription(35)).toEqual({ kind: 'scalar', values: ['35'] })
  })
  it('vacíos y "None"', () => {
    expect(parsePrescription(null).kind).toBe('empty')
    expect(parsePrescription('').kind).toBe('empty')
    expect(parsePrescription('None').kind).toBe('empty')
  })
})

describe('expandPerSet — la lectura que hace el armador', () => {
  it('un valor suelto va a TODAS las series (el caso Molino: "5" con 2 series)', () => {
    expect(expandPerSet('5', 2)).toEqual(['5', '5'])
    expect(expandPerSet('10', 3)).toEqual(['10', '10', '10'])
  })
  it('array diferenciado, serie a serie', () => {
    expect(expandPerSet('["8","8","6"]', 3)).toEqual(['8', '8', '6'])
  })
  it('un hueco toma el valor de la serie anterior', () => {
    expect(expandPerSet('["5",""]', 2)).toEqual(['5', '5'])
    expect(expandPerSet('["40","","50"]', 3)).toEqual(['40', '40', '50'])
  })
  it('si sobran series, se repite la última', () => {
    expect(expandPerSet('["8","6"]', 3)).toEqual(['8', '6', '6'])
  })
  it('array de vacíos (los pesos sin cargar del armador) → todo vacío', () => {
    expect(expandPerSet('["","",""]', 3)).toEqual(['', '', ''])
  })
  it('sin prescripción → vacíos; sin series → un solo valor', () => {
    expect(expandPerSet(null, 3)).toEqual(['', '', ''])
    expect(expandPerSet('10', 0)).toEqual(['10'])
    expect(expandPerSet(null, 0)).toEqual([''])
  })
})

describe('isUniformPerSet', () => {
  it('iguales y no vacíos → true', () => {
    expect(isUniformPerSet(['10', '10', '10'])).toBe(true)
    expect(isUniformPerSet([40, '40'])).toBe(true)
  })
  it('diferenciado o con vacíos → false', () => {
    expect(isUniformPerSet(['8', '8', '6'])).toBe(false)
    expect(isUniformPerSet(['', '', ''])).toBe(false)
    expect(isUniformPerSet([])).toBe(false)
    expect(isUniformPerSet(null)).toBe(false)
  })
})
