import { format, parseISO } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import i18n from './index'

// Doc 46: locale de date-fns acoplado al idioma activo de i18n.
// Uso: format(date, t('dates.fullDate'), { locale: dateLocale() })
export function dateLocale() {
  return i18n.language === 'en' ? enUS : es
}

/**
 * 'yyyy-MM-dd' → fecha corta y localizada ("6 jul" / "Jul 6").
 * Tolera basura: si no parsea, devuelve lo que le pasaron.
 */
export function formatShortDate(date) {
  if (!date) return ''
  try {
    return format(parseISO(date), i18n.t('dates.dayMonthShort'), { locale: dateLocale() })
  } catch {
    return date
  }
}
