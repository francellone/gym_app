import { describe, expect, it } from 'vitest'
import { clampOffset, coverScale, drawRect } from './cropMath'

describe('cropMath', () => {
  it('cubre el visor con el lado más corto', () => {
    expect(coverScale(1000, 500, 250)).toBe(0.5)
    expect(coverScale(500, 1000, 250)).toBe(0.5)
  })
  it('no deja huecos al arrastrar', () => {
    // 1000x500 a escala 0.5 = 500x250 en un visor de 250: se mueve ±125 en x, 0 en y
    expect(clampOffset({ x: 999, y: 40 }, 1000, 500, 0.5, 250)).toEqual({ x: 125, y: 0 })
    expect(clampOffset({ x: -999, y: -40 }, 1000, 500, 0.5, 250)).toEqual({ x: -125, y: 0 })
  })
  it('lo que se ve centrado cae centrado en la salida', () => {
    const r = drawRect(1000, 500, 0.5, { x: 0, y: 0 }, 250, 256)
    expect(r.dy).toBeCloseTo(0)
    expect(r.dh).toBeCloseTo(256)
    expect(r.dx + r.dw / 2).toBeCloseTo(128)
  })
})
