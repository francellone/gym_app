import { describe, expect, it } from 'vitest'
import { formFromProfile, payloadFromForm, sameAsSaved, validateForm } from './coachProfile'

describe('perfil de la coach', () => {
  it('sin idiomas guardados arranca con el idioma de la app', () => {
    expect(formFromProfile({ name: 'Anto', language: 'en' }).languages).toEqual(['en'])
    expect(formFromProfile({ name: 'Anto' }).languages).toEqual(['es'])
  })

  it('guarda solo la presentación de los idiomas elegidos, sin vacíos', () => {
    const p = payloadFromForm({
      name: ' Anto ',
      phone: '  ',
      languages: ['en'],
      bio: { es: 'Hola, soy Anto', en: ' Hi, I am Anto ' },
    })
    expect(p).toEqual({
      name: 'Anto',
      phone: null,
      coach_languages: ['en'],
      bio: { en: 'Hi, I am Anto' },
    })
  })

  it('los dos idiomas en orden fijo y bio null si no escribió nada', () => {
    const p = payloadFromForm({
      name: 'A',
      phone: '',
      languages: ['en', 'es'],
      bio: { es: '', en: '' },
    })
    expect(p.coach_languages).toEqual(['es', 'en'])
    expect(p.bio).toBeNull()
  })

  it('valida', () => {
    const ok = { name: 'A', phone: '', languages: ['es'], bio: { es: 'x', en: '' } }
    expect(validateForm(ok)).toBeNull()
    expect(validateForm({ ...ok, name: ' ' })).toBe('nameRequired')
    expect(validateForm({ ...ok, languages: [] })).toBe('pickLanguage')
    expect(validateForm({ ...ok, bio: { es: 'x'.repeat(601) } })).toBe('bioTooLong')
    // Un texto largo en un idioma NO elegido no bloquea (no se guarda)
    expect(validateForm({ ...ok, bio: { es: 'x', en: 'y'.repeat(601) } })).toBeNull()
  })

  it('detecta si hay cambios respecto de lo guardado', () => {
    const profile = { name: 'Anto', phone: null, coach_languages: ['es'], bio: { es: 'Hola' } }
    expect(sameAsSaved(formFromProfile(profile), profile)).toBe(true)
    expect(sameAsSaved({ ...formFromProfile(profile), phone: '123' }, profile)).toBe(false)
    // Nunca guardó idiomas: el default no cuenta como "sin cambios"
    expect(sameAsSaved(formFromProfile({ name: 'A' }), { name: 'A' })).toBe(false)
  })
})
