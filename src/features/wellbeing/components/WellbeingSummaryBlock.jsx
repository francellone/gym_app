import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowUp, ArrowDown, Minus, ChevronRight } from 'lucide-react'
import { WELLBEING_METRICS, WELLBEING_SHORT_LABELS, wellbeingColor } from '../wellbeingMetrics'
import { wellbeingStatusConfig, describeLastEntry } from '../wellbeingSummaryLogic'

// ============================================================
// WellbeingSummaryBlock
// ------------------------------------------------------------
// Bloque de wellbeing para el Panel del alumno del CoachDashboard.
// Muestra las 3 cosas que pidió Franco (2026-08-27) en un solo lugar:
//   1. Semáforo (mismos umbrales que las alertas de fatiga/estrés)
//   2. Promedio de las 6 métricas en el período seleccionado
//   3. Último registro + tendencia vs. el promedio de los días previos
//
// No hace fetch: recibe el summary ya calculado (computeWellbeingSummary).
//
// Props:
//   summary      salida de computeWellbeingSummary (o null)
//   loading      bool
//   studentId    para el link a la pestaña Wellbeing completa
//   periodLabel  texto del período, sólo informativo
// ============================================================
export default function WellbeingSummaryBlock({ summary, loading, studentId, periodLabel }) {
  const cfg = wellbeingStatusConfig(summary?.status)

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Wellbeing {periodLabel ? <span className="normal-case">· {periodLabel}</span> : null}
        </h4>
        {studentId && (
          <Link
            to={`/coach/students/${studentId}?tab=wellbeing`}
            className="text-xs text-primary-600 font-medium inline-flex items-center gap-1 hover:underline"
          >
            Ver evolución <ChevronRight size={13} />
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 italic">Cargando wellbeing…</p>
      ) : !summary?.hasData ? (
        <p className="text-xs text-gray-400 italic">Sin registros de wellbeing en este período</p>
      ) : (
        <div className="space-y-2">
          {/* Semáforo + último registro */}
          <div
            className={`flex items-center gap-2 flex-wrap rounded-xl border px-3 py-2 text-xs ${cfg.badgeClass}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dotClass}`} />
            <span className="font-semibold">{cfg.label}</span>
            <span className="opacity-80">
              {summary.statusReasons.length
                ? `· ${summary.statusReasons.join(' · ')} (últimos ${summary.windowDays} días)`
                : `· sin señales de fatiga ni estrés en los últimos ${summary.windowDays} días`}
            </span>
            {summary.last && (
              <span className="ml-auto opacity-80 whitespace-nowrap">
                Último: {format(parseISO(summary.last.date), "d 'de' MMM", { locale: es })} (
                {describeLastEntry(summary.last.daysAgo)})
                {summary.last.source === 'coach' && (
                  <span className="ml-1 badge bg-purple-100 text-purple-700 text-[10px]">
                    Coach
                  </span>
                )}
              </span>
            )}
          </div>

          {/* 6 métricas: promedio del período + último valor con tendencia */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {WELLBEING_METRICS.map((metric) => {
              const stat = summary.averages[metric.key] || { avg: null, count: 0 }
              const lastMetric = summary.last?.metrics?.[metric.key]
              return (
                <div key={metric.key} className="rounded-xl bg-gray-50 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-base leading-none">{metric.emoji}</span>
                    <span className="text-[11px] text-gray-500 truncate">
                      {WELLBEING_SHORT_LABELS[metric.key] || metric.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-sm font-bold px-2 py-0.5 rounded-lg ${wellbeingColor(
                        stat.avg ? Math.round(stat.avg) : 0,
                        metric.positive
                      )}`}
                    >
                      {stat.avg !== null ? stat.avg.toFixed(1) : '—'}
                    </span>
                    <TrendChip lastMetric={lastMetric} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {stat.count} registro{stat.count === 1 ? '' : 's'}
                  </p>
                </div>
              )
            })}
          </div>

          {summary.last?.notes && (
            <p className="text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2">
              <span className="text-gray-400">Nota del último registro: </span>
              {summary.last.notes}
            </p>
          )}

          <p className="text-[10px] text-gray-400">
            Promedio del período · la flecha compara el último registro contra el promedio de los
            días previos.
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================
// TrendChip — último valor + flecha de tendencia
// ------------------------------------------------------------
// La dirección ya viene resuelta por métrica (en estrés y fatiga,
// bajar es mejorar), así que acá sólo se pinta.
// ============================================================
function TrendChip({ lastMetric }) {
  if (!lastMetric || lastMetric.value === null) {
    return <span className="text-[11px] text-gray-400">últ. —</span>
  }
  const { value, direction, delta } = lastMetric
  const arrow =
    direction === 'flat' || direction === null ? (
      <Minus size={11} />
    ) : delta > 0 ? (
      <ArrowUp size={11} />
    ) : (
      <ArrowDown size={11} />
    )
  const toneClass =
    direction === 'better'
      ? 'text-green-600'
      : direction === 'worse'
        ? 'text-red-600'
        : 'text-gray-400'

  return (
    <span className={`text-[11px] inline-flex items-center gap-0.5 tabular-nums ${toneClass}`}>
      últ. <span className="font-semibold">{value}</span>
      {arrow}
    </span>
  )
}
