import { describe, it, expect } from 'vitest'
import { exerciseDisplay } from './exercise-display'

const base = {
  id: 'x',
  name: 'Sentadilla con barra',
  description: 'Ejercicio básico de piernas',
  technique_notes: 'Espalda neutra, bajar controlado',
}

describe('exerciseDisplay', () => {
  it('devuelve el canónico para es', () => {
    const ex = { ...base, i18n: { en: { name: 'Barbell squat' } } }
    expect(exerciseDisplay(ex, 'es').name).toBe('Sentadilla con barra')
  })

  it('devuelve el canónico si no hay i18n', () => {
    expect(exerciseDisplay(base, 'en')).toEqual({
      name: base.name,
      description: base.description,
      technique_notes: base.technique_notes,
    })
  })

  it('usa la traducción en para alumno en inglés', () => {
    const ex = {
      ...base,
      i18n: { en: { name: 'Barbell squat', technique_notes: 'Neutral spine' } },
    }
    const d = exerciseDisplay(ex, 'en')
    expect(d.name).toBe('Barbell squat')
    expect(d.technique_notes).toBe('Neutral spine')
    // description sin traducir => fallback canónico
    expect(d.description).toBe(base.description)
  })

  it('ignora traducciones vacías o de tipo incorrecto', () => {
    const ex = { ...base, i18n: { en: { name: '   ', description: 42 } } }
    const d = exerciseDisplay(ex, 'en')
    expect(d.name).toBe(base.name)
    expect(d.description).toBe(base.description)
  })

  it('normaliza en-US a en', () => {
    const ex = { ...base, i18n: { en: { name: 'Barbell squat' } } }
    expect(exerciseDisplay(ex, 'en-US').name).toBe('Barbell squat')
  })

  it('tolera exercise null y lang raro', () => {
    expect(exerciseDisplay(null, 'en')).toEqual({
      name: '',
      description: null,
      technique_notes: null,
    })
    expect(exerciseDisplay(base, undefined).name).toBe(base.name)
    expect(exerciseDisplay({ ...base, i18n: { en: null } }, 'en').name).toBe(base.name)
  })
})
