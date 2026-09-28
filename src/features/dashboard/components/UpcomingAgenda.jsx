import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { dateLocale } from '@/i18n/dateLocale'
import useCoachCalendarData from '../hooks/useCoachCalendarData'
import { buildAgendaDays, agendaPhrase } from '../calendarLogic'
import useCalendarVisibility from '../hooks/useCalendarVisibility'

// ============================================================
// UpcomingAgenda — "Próximos 7 días"
// ------------------------------------------------------------
// Rediseño 2026-09-26. Reemplaza a "Próximas evaluaciones" y a la
// tarea de descifrar los puntitos del calendario: lo que viene,
// escrito en frases ("Miércoles 30 · Vence el pago de Tomás Paz").
// Incluye pagos, fines e inicios de plan, evaluaciones y cumpleaños.
// Si hay una persona filtrada en el dashboard, solo lo de esa persona.
// 2026-09-27: suma formularios programados y respeta los interruptores
// de la leyenda del calendario (lo apagado allá no aparece acá).
// ============================================================

const DAYS = 7

const ICON = {
  payment_due: { char: '$', cls: 'bg-durazno-100 text-primary-700' },
  plan_end: { char: '■', cls: 'bg-gray-100 text-gray-700' },
  plan_start: { char: '▸', cls: 'bg-green-100 text-green-700' },
  evaluation: { char: '◆', cls: 'bg-ciruela-100 text-ciruela-700' },
  birthday: { char: '🎂', cls: 'bg-durazno-50 text-primary-700' },
  form_scheduled: { char: '✎', cls: 'bg-gray-100 text-gray-700' },
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default function UpcomingAgenda({ studentId = null }) {
  const { t } = useTranslation()
  const today = useMemo(startOfToday, [])
  const win = useMemo(() => {
    const end = new Date(today)
    end.setDate(end.getDate() + DAYS - 1)
    return { start: today, end }
  }, [today])

  const { loading, eventsByDate } = useCoachCalendarData(today, [], {
    window: win,
    eventsOnly: true,
  })
  const { hidden } = useCalendarVisibility()
  const days = useMemo(
    () => buildAgendaDays(eventsByDate, today, DAYS, studentId, hidden),
    [eventsByDate, today, studentId, hidden]
  )

  const dayLabel = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const diff = Math.round((date - today) / 86400000)
    if (diff === 0) return t('coach.dashboard.agenda.today')
    if (diff === 1) return t('coach.dashboard.agenda.tomorrow')
    const pattern =
      date.getMonth() === today.getMonth()
        ? t('coach.dashboard.agenda.dayFormat')
        : t('coach.dashboard.agenda.dayFormatOtherMonth')
    const txt = format(date, pattern, { locale: dateLocale() })
    return txt.charAt(0).toUpperCase() + txt.slice(1)
  }

  return (
    <section className="card">
      <p className="eyebrow mb-2">{t('coach.dashboard.agenda.title')}</p>
      {loading ? (
        <p className="text-sm text-texto3 py-2">{t('common.loading')}</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-texto2 py-2">{t('coach.dashboard.agenda.empty')}</p>
      ) : (
        <div className="divide-y divide-linea">
          {days.map(({ ymd, events }) => (
            <div
              key={ymd}
              className="grid grid-cols-1 sm:grid-cols-[104px_1fr] gap-1.5 sm:gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="text-[13px] font-bold text-texto2 sm:pt-1">{dayLabel(ymd)}</span>
              <div className="space-y-2">
                {events.map((ev, i) => {
                  const p = agendaPhrase(ev, t)
                  const icon = ICON[ev.type] || ICON.plan_end
                  return (
                    <Link
                      key={i}
                      to={ev.studentId ? `/coach/students/${ev.studentId}` : '#'}
                      className="flex items-start gap-2.5 group"
                    >
                      <span
                        className={`w-[26px] h-[26px] rounded-lg grid place-items-center text-xs font-bold flex-shrink-0 ${icon.cls}`}
                        aria-hidden
                      >
                        {icon.char}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] leading-snug text-tinta group-hover:text-primary-700">
                          {p.lead} <b className="font-bold">{p.name}</b>
                        </span>
                        {p.detail && (
                          <span className="block text-[13px] text-texto2">{p.detail}</span>
                        )}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
