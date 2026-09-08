import { format, parseISO } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import i18n from './index'

// Doc 46: locale de date-fns acoplado al idioma activo de i18n.
// Uso: format(date, t('dates.fullDate'), { locale: dateLocale() })
//
// `lng` opcional (2026-09-08): la pantalla de registro en modo coach corre en
// una instancia CLONADA de i18next con el idioma de la alumna, así que la
// instancia global de este módulo NO sabe en qué idioma está esa pantalla. En
// ese subárbol hay que pasar el idioma del contexto: dateLocale(i18n.language)
// con el `i18n` que devuelve useTranslation(). Ver CoachModeLanguage.jsx.
export function dateLocale(lng) {
  return (lng || i18n.language) === 'en' ? enUS : es
}

/**
 * 'yyyy-MM-dd' → fecha corta y localizada ("6 jul" / "Jul 6").
 * Tolera basura: si no parsea, devuelve lo que le pasaron.
 */
export function formatShortDate(date, lng) {
  if (!date) return ''
  try {
    return format(parseISO(date), i18n.t('dates.dayMonthShort', { lng }), {
      locale: dateLocale(lng),
    })
  } catch {
    return date
  }
}
