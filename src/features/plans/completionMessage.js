// Mensaje de cierre del plan (Etapa 6 celebraciones). Ver CompletionMessageField.
import i18n from '@/i18n'

// `lng`: idioma en que se MUESTRA el automático en el armador (el de la coach).
// Default 'es' por compatibilidad. Sea cual sea, si no se toca se guarda NULL.
export function autoCompletionMessage(lng = 'es') {
  return i18n.t('celebrations.plan.autoMessage.default', { lng })
}

const AUTO_LANGS = ['es', 'en']

// Lo que se guarda en plans.completion_message.
export function normalizeCompletionMessage(value) {
  const text = String(value ?? '').trim()
  if (!text || AUTO_LANGS.some((lng) => text === autoCompletionMessage(lng).trim())) return null
  return text.slice(0, 1000)
}
