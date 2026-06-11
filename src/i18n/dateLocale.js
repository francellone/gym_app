import { es, enUS } from 'date-fns/locale'
import i18n from './index'

// Doc 46: locale de date-fns acoplado al idioma activo de i18n.
// Uso: format(date, t('dates.fullDate'), { locale: dateLocale() })
export function dateLocale() {
  return i18n.language === 'en' ? enUS : es
}
