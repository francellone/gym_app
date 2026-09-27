import { HeartPulse } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  wellbeingStatusConfig,
  describeLastEntry,
  formatStatusReasons,
} from '../wellbeingSummaryLogic'

// ============================================================
// WellbeingStatusBadge
// ------------------------------------------------------------
// Indicador compacto del wellbeing para listas (fila de Alumnos).
// Un punto de color + "hace X días" del último registro. El detalle
// (qué señal disparó el color) va en el title, para no romper el
// escaneo visual de la fila.
//
// Props:
//   summary   salida de computeWellbeingSummary (o undefined)
//   showLabel muestra también la palabra del estado (Bien/Atención/Alerta)
// ============================================================
export default function WellbeingStatusBadge({ summary, showLabel = false }) {
  const { t } = useTranslation()
  const status = summary?.status || 'none'
  const cfg = wellbeingStatusConfig(status)
  const daysAgo = summary?.last?.daysAgo ?? null

  const label = t(cfg.labelKey)
  const reasons = formatStatusReasons(summary, t)
  const title =
    status === 'none'
      ? t('coach.wellbeing.badge.titleNone')
      : t('coach.wellbeing.badge.title', {
          status: label.toLowerCase(),
          reasons: reasons.length ? ` — ${reasons.join(', ')}` : '',
          last: describeLastEntry(daysAgo, t),
        })

  return (
    <span
      className={`badge text-xs flex items-center gap-1 border ${cfg.badgeClass}`}
      title={title}
    >
      <HeartPulse size={11} className="flex-shrink-0" />
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      {showLabel && <span>{label}</span>}
      <span className="opacity-75">
        {status === 'none' ? t('coach.wellbeing.badge.none') : describeLastEntry(daysAgo, t)}
      </span>
    </span>
  )
}
