import { useTranslation } from 'react-i18next'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

// "Peso y reps" del ejercicio elegido (2026-10-09). Fechas en X; por sesión
// dos barras (mejor serie y promedio por serie) y, si hay kilos cargados,
// una línea con los kilos máximos en el eje derecho. Al tocar una sesión se
// ve cada serie. Lo usan la vista de la coach y la de la persona.
//
// `data` viene de buildRepsWeightSeries con `date` ya formateada para el eje.
// `children` permite sumar elementos de recharts (las marcas de plan).

function fmt(n, lang) {
  return n == null ? '' : Number(n).toLocaleString(lang, { maximumFractionDigits: 1 })
}

export function SetsTooltip({ active, payload, label, unitShort, unilateral, lang, t }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const sets = (p.sets || [])
    .map((s) => {
      const r = s.reps != null ? fmt(s.reps, lang) : '—'
      return s.kg != null ? `${r} × ${fmt(s.kg, lang)} kg` : r
    })
    .join(' · ')
  return (
    <div className="bg-white shadow-lg rounded-xl p-2.5 border border-gray-100 text-xs max-w-[240px]">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {p.best != null && (
        <p style={{ color: 'rgb(var(--c-primary-600))' }}>
          {t('progressChart.best')}: {fmt(p.best, lang)} {unitShort}
        </p>
      )}
      {p.avg != null && (
        <p style={{ color: 'rgb(var(--c-primary-400))' }}>
          {t('progressChart.avg')}: {fmt(p.avg, lang)} {unitShort}
        </p>
      )}
      {p.kg != null && (
        <p style={{ color: 'rgb(var(--c-ciruela-600))' }}>
          {t('progressChart.kg')}: {fmt(p.kg, lang)} kg
        </p>
      )}
      {sets && (
        <p className="text-gray-500 mt-1 pt-1 border-t border-gray-100">
          {t('progressChart.setsDetail', { count: p.sets.length })}: {sets}
          {unilateral ? ` (${t('progressChart.perSide')})` : ''}
        </p>
      )}
    </div>
  )
}

export default function RepsWeightChart({ data, hasKg, unit = 'reps', unilateral, children }) {
  const { t, i18n } = useTranslation()
  const unitShort = t(`workout.repsUnitShort.${unit}`, { defaultValue: unit })
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-gray-100))" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="reps" tick={{ fontSize: 10 }} allowDecimals={false} />
        {hasKg && (
          <YAxis
            yAxisId="kg"
            orientation="right"
            tick={{ fontSize: 10 }}
            unit="kg"
            domain={['auto', 'auto']}
          />
        )}
        <Tooltip
          content={
            <SetsTooltip unitShort={unitShort} unilateral={unilateral} lang={i18n.language} t={t} />
          }
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {children}
        <Bar
          yAxisId="reps"
          dataKey="best"
          name={t('progressChart.bestLegend', { unit: unitShort })}
          fill="rgb(var(--c-primary-600))"
          radius={[3, 3, 0, 0]}
          maxBarSize={18}
        />
        <Bar
          yAxisId="reps"
          dataKey="avg"
          name={t('progressChart.avgLegend', { unit: unitShort })}
          fill="rgb(var(--c-primary-300))"
          radius={[3, 3, 0, 0]}
          maxBarSize={18}
        />
        {hasKg && (
          <Line
            yAxisId="kg"
            type="monotone"
            dataKey="kg"
            name={t('progressChart.kgLegend')}
            stroke="rgb(var(--c-ciruela-600))"
            strokeWidth={2}
            dot={{ fill: 'rgb(var(--c-ciruela-600))', r: 3 }}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
