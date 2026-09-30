import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
const { bioFor, filterCoaches } = await import('./coachDirectory')

const coaches = [
  { id: 'a', coach_city: 'Córdoba', coach_work_mode: 'both', coach_languages: ['es', 'en'] },
  { id: 'b', coach_city: 'Rosario', coach_work_mode: 'online', coach_languages: ['es'] },
  {
    id: 'c',
    coach_city: 'Villa Carlos Paz',
    coach_work_mode: 'in_person',
    coach_languages: ['en'],
  },
]

describe('filterCoaches', () => {
  it('sin filtros devuelve todas', () => {
    expect(filterCoaches(coaches)).toHaveLength(3)
  })
  it('ciudad sin tildes ni mayúsculas', () => {
    expect(filterCoaches(coaches, { city: 'cordoba' }).map((c) => c.id)).toEqual(['a'])
  })
  it('"ambas" cumple online y presencial', () => {
    expect(filterCoaches(coaches, { workMode: 'online' }).map((c) => c.id)).toEqual(['a', 'b'])
    expect(filterCoaches(coaches, { workMode: 'in_person' }).map((c) => c.id)).toEqual(['a', 'c'])
  })
  it('por idioma', () => {
    expect(filterCoaches(coaches, { language: 'en' }).map((c) => c.id)).toEqual(['a', 'c'])
  })
})

describe('bioFor', () => {
  it('usa el idioma de quien mira y si falta, el otro', () => {
    expect(bioFor({ bio: { es: 'Hola', en: 'Hi' } }, 'en')).toBe('Hi')
    expect(bioFor({ bio: { es: 'Hola' } }, 'en')).toBe('Hola')
    expect(bioFor({ bio: null }, 'es')).toBe('')
  })
})
