// Evento dentro del chat (día, semana, plan, mejor marca, "no sabía cómo").
// La semana completa trae además el mensaje automático con la pregunta y el
// promedio de bienestar de esa semana. Texto por kind+payload (i18n).

import { useTranslation } from 'react-i18next'
import { CheckCircle2, Trophy, Flag, HelpCircle, Leaf, CalendarCheck } from 'lucide-react'
import { WELLBEING_METRICS } from '@/features/wellbeing/wellbeingMetrics'
import { weeklyWellbeing, weekStartOfEvent, weekQuestionKey } from '../chatModel'
import { eventTitle, eventDetail, fmtNumber } from '../chatText'

const TONE = {
  day_complete: { Icon: CalendarCheck, cls: 'bg-green-100 text-green-700' },
  week_complete: { Icon: CheckCircle2, cls: 'bg-green-100 text-green-700' },
  plan_complete: { Icon: Flag, cls: 'bg-green-100 text-green-700' },
  personal_best: { Icon: Trophy, cls: 'bg-durazno-100 text-primary-700' },
  exercise_unclear: { Icon: HelpCircle, cls: 'bg-amber-100 text-amber-700' },
}

const METRIC_BY_KEY = Object.fromEntries(WELLBEING_METRICS.map((m) => [m.key, m]))

function WellbeingGrid({ summary }) {
  const { t, i18n } = useTranslation()
  if (!summary?.metrics?.length) return null
  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {summary.metrics.map((m) => {
          const meta = METRIC_BY_KEY[m.key]
          const arrow = m.delta == null || m.delta === 0 ? '=' : m.delta > 0 ? '↑' : '↓'
          const tone =
            m.better == null ? 'text-texto3' : m.better ? 'text-green-700' : 'text-amber-700'
          return (
            <div key={m.key} className="rounded-lg bg-white/70 px-2 py-1">
              <p className="text-[10.5px] text-salvia-700 break-words">
                {meta ? t(meta.labelKey) : m.key}
              </p>
              <p className="text-[15px] font-bold text-tinta tabular-nums">
                {fmtNumber(m.value, i18n.language)}
                <span className={`ml-1 text-[11px] font-medium ${tone}`}>
                  {arrow}
                  {m.delta ? ` ${fmtNumber(Math.abs(m.delta), i18n.language)}` : ''}
                </span>
              </p>
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-[10.5px] text-texto3">
        {t('chat.event.wellbeingCaption', { count: summary.count })}
      </p>
    </div>
  )
}

export default function ChatEventCard({
  event,
  viewerRole,
  name,
  exerciseName,
  wellbeingLogs,
  timeLabel,
}) {
  const { t, i18n } = useTranslation()
  const tone = TONE[event.kind] || TONE.day_complete
  const { Icon } = tone
  const title = eventTitle(t, event, { viewerRole, name, exerciseName, lng: i18n.language })
  const detail = eventDetail(t, event, i18n.language)
  const isWeek = event.kind === 'week_complete'
  const summary = isWeek ? weeklyWellbeing(wellbeingLogs || [], weekStartOfEvent(event)) : null
  const emoji = isWeek || event.kind === 'plan_complete' ? '🎉 ' : ''

  return (
    <>
      <div className="self-center w-full max-w-lg flex items-start gap-2.5 bg-white border border-linea rounded-2xl px-3 py-2.5">
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tone.cls}`}
        >
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-texto3">
            {t('chat.event.label')}
          </p>
          <p
            className={`text-sm text-tinta break-words ${event.payload?.voided ? 'line-through' : ''}`}
          >
            {emoji}
            {title}
          </p>
          {detail && <p className="text-xs text-texto2 break-words">{detail}</p>}
        </div>
        {timeLabel && <span className="text-[11px] text-texto3 flex-shrink-0">{timeLabel}</span>}
      </div>

      {isWeek && (
        <div className="self-start max-w-[85%] sm:max-w-md rounded-2xl rounded-bl-md bg-salvia-100 px-3 py-2 text-sm text-tinta">
          <p className="text-[11px] font-bold text-salvia-700 flex items-center gap-1 mb-0.5">
            <Leaf size={12} aria-hidden="true" />
            {viewerRole === 'student' ? t('chat.event.fromCoach') : t('chat.event.automatic')}
          </p>
          <p className="break-words">{t(weekQuestionKey(event))}</p>
          <WellbeingGrid summary={summary} />
        </div>
      )}
    </>
  )
}
