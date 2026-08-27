import { HeartPulse } from 'lucide-react'
import { wellbeingStatusConfig, describeLastEntry } from '../wellbeingSummaryLogic'

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
  const status = summary?.status || 'none'
  const cfg = wellbeingStatusConfig(status)
  const daysAgo = summary?.last?.daysAgo ?? null

  const title =
    status === 'none'
      ? 'Wellbeing: sin registros en los últimos 14 días'
      : `Wellbeing ${cfg.label.toLowerCase()}${
          summary?.statusReasons?.length ? ` — ${summary.statusReasons.join(', ')}` : ''
        } · último registro ${describeLastEntry(daysAgo)}`

  return (
    <span
      className={`badge text-xs flex items-center gap-1 border ${cfg.badgeClass}`}
      title={title}
    >
      <HeartPulse size={11} className="flex-shrink-0" />
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      {showLabel && <span>{cfg.label}</span>}
      <span className="opacity-75">
        {status === 'none' ? 'sin wellbeing' : describeLastEntry(daysAgo)}
      </span>
    </span>
  )
}
