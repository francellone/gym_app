// ============================================================
// dateLocale.test.js
// ------------------------------------------------------------
// El `lng` opcional existe para el modo coach: esa pantalla corre en una
// instancia clonada de i18next y la instancia global de este módulo no sabe
// en qué idioma está. Sin `lng`, comportamiento histórico (idioma global).
// Ver src/features/workouts/CoachModeLanguage.jsx
// ============================================================
import { describe, it, expect } from 'vitest'
import { es, enUS } from 'date-fns/locale'
import i18n from '@/i18n'
import { dateLocale, formatShortDate } from './dateLocale'

describe('dateLocale', () => {
  it('sin argumento sigue el idioma global', () => {
    expect(i18n.language).toBe('es') // el setup de tests fuerza 'es'
    expect(dateLocale()).toBe(es)
  })

  it('con lng explícito ignora el idioma global', () => {
    expect(dateLocale('en')).toBe(enUS)
    expect(dateLocale('es')).toBe(es)
    expect(i18n.language).toBe('es') // no lo tocó
  })

  it('formatShortDate respeta el lng explícito', () => {
    const esOut = formatShortDate('2026-07-06')
    const enOut = formatShortDate('2026-07-06', 'en')
    expect(esOut).toBeTruthy()
    expect(enOut).toBeTruthy()
    expect(enOut).not.toBe(esOut)
  })

  it('formatShortDate tolera basura', () => {
    expect(formatShortDate('')).toBe('')
    expect(formatShortDate('no-es-fecha', 'en')).toBe('no-es-fecha')
  })
})
