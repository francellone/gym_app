import { describe, expect, it } from 'vitest'
import { compareForMerge, filledSummary } from './mergeFill'

describe('compareForMerge', () => {
  it('completa lo vacío del que queda y no pisa lo que tiene', () => {
    const from = {
      description: 'Mejora la movilidad',
      muscle_group: 'CORE',
      i18n: { en: { name: 'CAT COW', description: 'Improves mobility' } },
    }
    const into = {
      description: null,
      muscle_group: 'ACTIVACION',
      i18n: { en: { name: 'Cat-Cow' } },
    }
    const rows = Object.fromEntries(compareForMerge(from, into).map((r) => [r.key, r.outcome]))
    expect(rows.description).toBe('fill')
    expect(rows.muscle_group).toBe('drop')
    expect(rows['en.name']).toBe('drop')
    expect(rows['en.description']).toBe('fill')
    expect(rows.video_url).toBeUndefined()
  })

  it('texto en blanco cuenta como vacío', () => {
    const rows = compareForMerge({ description: 'x' }, { description: '   ' })
    expect(rows[0]).toMatchObject({ key: 'description', outcome: 'fill' })
  })

  it('iguales y solo-destino', () => {
    const rows = compareForMerge({ video_url: 'a' }, { video_url: 'a', technique_notes: 't' })
    expect(rows.map((r) => r.outcome)).toEqual(['same', 'keep'])
  })

  it('resume los campos completados', () => {
    expect(filledSummary(['description', 'i18n'])).toEqual(['descripción', 'traducción al inglés'])
    expect(filledSummary(null)).toEqual([])
  })
})
