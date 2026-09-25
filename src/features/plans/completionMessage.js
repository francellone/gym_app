// Mensaje de cierre del plan (Etapa 6 celebraciones). Ver CompletionMessageField.
import i18n from '@/i18n'

export function autoCompletionMessage() {
  return i18n.t('celebrations.plan.autoMessage.default', { lng: 'es' })
}

// Lo que se guarda en plans.completion_message.
export function normalizeCompletionMessage(value) {
  const text = String(value ?? '').trim()
  if (!text || text === autoCompletionMessage().trim()) return null
  return text.slice(0, 1000)
}
