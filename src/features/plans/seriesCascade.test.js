import { describe, it, expect } from 'vitest'
import { cascadeSetValue } from './seriesCascade'

describe('cascadeSetValue — la serie 1 autocompleta a las demás', () => {
  it('propaga a las series vacías', () => {
    expect(cascadeSetValue(['', '', ''], 0, '10')).toEqual(['10', '10', '10'])
  })

  it('propaga a las series que conservaban el valor previo de la serie 1', () => {
    // Prescripción 10/10/10, la persona hizo 8 en todas.
    expect(cascadeSetValue(['10', '10', '10'], 0, '8')).toEqual(['8', '8', '8'])
  })

  it('respeta la diferenciación del coach: 10/8/6 no se toca', () => {
    expect(cascadeSetValue(['10', '8', '6'], 0, '9')).toEqual(['9', '8', '6'])
  })

  it('no pisa una serie editada a mano aunque el resto siga sincronizado', () => {
    // Serie 2 editada a 12; serie 3 sigue igual a la 1.
    expect(cascadeSetValue(['10', '12', '10'], 0, '8')).toEqual(['8', '12', '8'])
  })

  it('editar otra serie solo toca esa serie', () => {
    expect(cascadeSetValue(['10', '10', '10'], 1, '8')).toEqual(['10', '8', '10'])
    expect(cascadeSetValue(['10', '10', '10'], 2, '')).toEqual(['10', '10', ''])
  })

  it('tipeo carácter por carácter: 1 → 10 → 100 arrastra a las sincronizadas', () => {
    let arr = ['', '', '']
    arr = cascadeSetValue(arr, 0, '1')
    arr = cascadeSetValue(arr, 0, '10')
    arr = cascadeSetValue(arr, 0, '100')
    expect(arr).toEqual(['100', '100', '100'])
  })

  it('borrar la serie 1 vacía también a las sincronizadas', () => {
    expect(cascadeSetValue(['10', '10', '12'], 0, '')).toEqual(['', '', '12'])
  })

  it('devuelve un array nuevo y no muta el original', () => {
    const src = ['10', '10']
    const out = cascadeSetValue(src, 0, '8')
    expect(out).not.toBe(src)
    expect(src).toEqual(['10', '10'])
  })

  it('tolera null y una sola serie', () => {
    expect(cascadeSetValue(null, 0, '5')).toEqual(['5'])
    expect(cascadeSetValue(['3'], 0, '4')).toEqual(['4'])
  })
})
