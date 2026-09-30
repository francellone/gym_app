import { describe, expect, it } from 'vitest'
import {
  directoryMissing,
  formFromProfile,
  isDirectoryIncompleteError,
  payloadFromForm,
  sameAsSaved,
  validateForm,
} from './coachProfile'

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
      coach_city: null,
      coach_work_mode: null,
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

describe('catálogo de coaches (v69)', () => {
  const full = {
    avatar_url: 'a/b.webp',
    coach_languages: ['es', 'en'],
    bio: { es: 'Hola', en: 'Hi' },
    coach_city: 'Córdoba',
    coach_work_mode: 'both',
  }
  it('perfil completo no tiene faltantes', () => {
    expect(directoryMissing(full)).toEqual([])
  })
  it('detecta foto, presentación por idioma, ciudad y modalidad', () => {
    expect(
      directoryMissing({
        ...full,
        avatar_url: null,
        bio: { es: 'Hola' },
        coach_city: ' ',
        coach_work_mode: null,
      })
    ).toEqual(['photo', 'bio', 'city', 'work_mode'])
    expect(directoryMissing({ ...full, coach_languages: [] })).toEqual(['languages'])
  })
  it('ciudad y modalidad viajan en el payload', () => {
    const p = payloadFromForm({
      name: 'A',
      phone: '',
      languages: ['es'],
      bio: { es: 'x' },
      city: ' Córdoba ',
      workMode: 'online',
    })
    expect(p.coach_city).toBe('Córdoba')
    expect(p.coach_work_mode).toBe('online')
  })
  it('reconoce el error del back', () => {
    expect(isDirectoryIncompleteError({ message: 'directory_incomplete: bio' })).toBe(true)
    expect(isDirectoryIncompleteError({ message: 'otra cosa' })).toBe(false)
  })
})
