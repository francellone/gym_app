/**
 * resolveNotificationText
 *
 * Resuelve el title/body de una notificación en el idioma activo del viewer
 * (i18n), a partir de `type` + `data` (payload). Los triggers SQL guardan
 * title/body hardcodeados en español; para las notificaciones dirigidas al
 * ALUMNO los re-generamos client-side desde los locales, así un alumno con
 * `profiles.language = 'en'` las ve en inglés — incluidas las históricas y
 * ante cambios de idioma (decisión con Franco 2026-07-06, opción "payload +
 * i18n en front").
 *
 * El texto guardado queda como FALLBACK: tipos dirigidos al coach, copias
 * del coach de tipos compartidos (weekly_summary / plan_expiring, que se
 * distinguen por `data.student_name`), tipos desconocidos o payloads
 * incompletos siguen mostrando el title/body de la tabla. El panel del coach
 * queda en español a propósito (doc 46).
 *
 * `plan_title` para plan_assigned / plan_expiring no viene en el payload del
 * trigger: lo inyecta `useNotifications` client-side (mismo patrón que
 * `plan_type`).
 *
 * NOTA: si se activa Web Push (`notify-cron` manda title/body de la tabla),
 * esa vía sigue en español — replicar esta resolución en el edge function.
 */

import { format, parseISO } from 'date-fns'
import { dateLocale } from '@/i18n/dateLocale'

// Tipos dirigidos al alumno que sabemos resolver desde el payload.
const STUDENT_TYPES = new Set([
  'coach_comment',
  'plan_assigned',
  'plan_updated',
  'plan_expiring',
  'weekly_summary',
])

function safeDate(value, pattern) {
  if (!value) return null
  try {
    return format(parseISO(String(value)), pattern, { locale: dateLocale() })
  } catch {
    return String(value)
  }
}

/**
 * @param {object} notification fila de `notifications` (type, title, body, data)
 * @param {function} t          función `t` de i18next del viewer
 * @returns {{ title: string, body: string|null }}
 */
export function resolveNotificationText(notification, t) {
  const fallback = { title: notification.title, body: notification.body }
  const type = notification.type
  if (!STUDENT_TYPES.has(type)) return fallback

  const data = notification.data || {}

  // weekly_summary y plan_expiring insertan también una copia para el coach
  // (con `student_name` en el payload) — esa copia no se resuelve.
  if (data.student_name) return fallback

  const k = (suffix) => `notifications.types.${type}.${suffix}`

  switch (type) {
    case 'coach_comment':
      // El body es el texto real del coach (excerpt) — no se traduce.
      return { title: t(k('title')), body: notification.body }

    case 'plan_assigned':
    case 'plan_updated': {
      const planTitle = data.plan_title
      return {
        title: t(k('title')),
        body: planTitle ? t(k('body'), { planTitle }) : t(k('bodyNoTitle')),
      }
    }

    case 'plan_expiring': {
      const endDate = safeDate(data.end_date, t('dates.shortDate'))
      if (!endDate) return fallback // payload viejo/incompleto
      const planTitle = data.plan_title
      return {
        title: t(k('title')),
        body: planTitle ? t(k('body'), { planTitle, endDate }) : t(k('bodyNoTitle'), { endDate }),
      }
    }

    case 'weekly_summary': {
      const weekStart = safeDate(data.week_start, t('dates.dayMonthShort'))
      const weekEnd = safeDate(data.week_end, t('dates.dayMonthShort'))
      if (data.sessions == null || !weekStart || !weekEnd) return fallback
      const sessions = t(k('sessions'), { count: Number(data.sessions) })
      const rpe = data.avg_rpe != null ? t(k('rpeAvg'), { rpe: data.avg_rpe }) : t(k('rpeNone'))
      return {
        title: t(k('title')),
        body: t(k('body'), { sessions, rpe, weekStart, weekEnd }),
      }
    }

    default:
      return fallback
  }
}
