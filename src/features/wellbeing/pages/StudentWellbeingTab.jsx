import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts'
import { WELLBEING_METRICS, wellbeingColor } from '../components/WellbeingModal'

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────
const PERIODS = [
  { label: '2s', days: 14 },
  { label: '1m', days: 30 },
  { label: '3m', days: 90 },
  { label: 'Todo', days: 365 },
]

// Colores para cada línea del gráfico
const LINE_COLORS = {
  sleep_quality: '#6366f1',
  nutrition_quality: '#22c55e',
  hydration_quality: '#3b82f6',
  energy_level: '#f59e0b',
  stress_level: '#ef4444',
  muscle_fatigue: '#ec4899',
}

const METRIC_KEYS = WELLBEING_METRICS.map((m) => m.key)

// Tooltip personalizado
function TooltipCard({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white shadow-lg rounded-xl p-3 border border-gray-100 text-xs space-y-1 max-w-[200px]">
      <p className="font-semibold text-gray-700">{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
          <span className="text-gray-600 truncate">{e.name}:</span>
          <span className="font-bold ml-auto">{e.value}</span>
        </div>
      ))}
    </div>
  )
}

// Tarjeta de promedio por métrica
function MetricCard({ metric, avg, count }) {
  const { label, emoji, positive } = metric
  const colorClass = avg ? wellbeingColor(Math.round(avg), positive) : 'bg-gray-100 text-gray-400'
  return (
    <div className="card p-3 flex items-center gap-3">
      <span className="text-2xl">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 leading-tight truncate">{label}</p>
        <p className="text-xs text-gray-400">{count} registros</p>
      </div>
      <div className={`text-sm font-bold px-2.5 py-1 rounded-xl ${colorClass}`}>
        {avg ? avg.toFixed(1) : '—'}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// StudentWellbeingTab
// Props: studentId
// ─────────────────────────────────────────────────────────────
export default function StudentWellbeingTab({ studentId }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)
  const [visibleMetrics, setVisibleMetrics] = useState(new Set(METRIC_KEYS))

  useEffect(() => {
    fetchWellbeing()
  }, [studentId, period])

  async function fetchWellbeing() {
    setLoading(true)
    try {
      const from = format(subDays(new Date(), period), 'yyyy-MM-dd')
      const { data } = await supabase
        .from('wellbeing_logs')
        .select('*')
        .eq('user_id', studentId)
        .gte('date', from)
        .order('date', { ascending: true })
      setLogs(data || [])
    } catch (err) {
      console.error('[StudentWellbeingTab]', err)
    } finally {
      setLoading(false)
    }
  }

  // Datos para el gráfico de líneas
  const chartData = useMemo(
    () =>
      logs.map((l) => ({
        date: format(parseISO(l.date), 'd MMM', { locale: es }),
        rawDate: l.date,
        sleep_quality: l.sleep_quality,
        nutrition_quality: l.nutrition_quality,
        hydration_quality: l.hydration_quality,
        energy_level: l.energy_level,
        stress_level: l.stress_level,
        muscle_fatigue: l.muscle_fatigue,
        notes: l.notes,
      })),
    [logs]
  )

  // Promedios por métrica
  const averages = useMemo(() => {
    if (!logs.length) return {}
    return Object.fromEntries(
      METRIC_KEYS.map((key) => {
        const vals = logs.map((l) => l[key]).filter((v) => v != null)
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        return [key, { avg, count: vals.length }]
      })
    )
  }, [logs])

  // Datos para el radar (promedios normalizados)
  const radarData = useMemo(
    () =>
      WELLBEING_METRICS.map(({ key, label, emoji, positive }) => {
        const a = averages[key]?.avg
        // Para métricas negativas (estrés, fatiga): invertimos para que el radar muestre "bienestar"
        const normalized = a != null ? (positive ? a : 11 - a) : null
        return {
          metric: emoji,
          fullLabel: label,
          value: normalized != null ? parseFloat(normalized.toFixed(1)) : null,
        }
      }),
    [averages]
  )

  function toggleMetric(key) {
    setVisibleMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // ─── Render ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-7 h-7 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!logs.length) {
    return (
      <div className="card text-center py-10 space-y-2">
        <div className="text-4xl">🌟</div>
        <p className="font-semibold text-gray-700">Sin datos de wellbeing</p>
        <p className="text-sm text-gray-500">
          El alumno aún no completó ninguna encuesta de bienestar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Selector de período */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => setPeriod(p.days)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              period === p.days
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Grid de promedios */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Promedios — últimos {period} días
        </p>
        <div className="grid grid-cols-2 gap-2">
          {WELLBEING_METRICS.map((metric) => (
            <MetricCard
              key={metric.key}
              metric={metric}
              avg={averages[metric.key]?.avg}
              count={averages[metric.key]?.count || 0}
            />
          ))}
        </div>
      </div>

      {/* Radar de bienestar general */}
      {radarData.every((d) => d.value != null) && (
        <div className="card">
          <p className="text-sm font-semibold text-gray-800 mb-1">
            Radar de bienestar
            <span className="text-xs text-gray-400 font-normal ml-2">
              (estrés y fatiga invertidos — más alto = mejor)
            </span>
          </p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 14 }} />
                <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 9 }} />
                <Radar
                  name="Bienestar"
                  dataKey="value"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.25}
                  dot={{ r: 3, fill: '#6366f1' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="bg-white shadow rounded-xl p-2 text-xs border border-gray-100">
                        <p className="font-semibold">{d?.fullLabel}</p>
                        <p className="text-gray-600">Valor: {d?.value}</p>
                      </div>
                    )
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Gráfico de líneas con toggle */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800">Evolución</p>
          <p className="text-xs text-gray-400">{logs.length} sesiones</p>
        </div>

        {/* Toggle de métricas visibles */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {WELLBEING_METRICS.map(({ key, emoji, label }) => (
            <button
              key={key}
              onClick={() => toggleMetric(key)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                visibleMetrics.has(key)
                  ? 'border-transparent text-white'
                  : 'bg-white border-gray-200 text-gray-400'
              }`}
              style={visibleMetrics.has(key) ? { background: LINE_COLORS[key] } : {}}
            >
              {emoji} {label.split(' ')[0]}
            </button>
          ))}
        </div>

        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 10]} ticks={[2, 4, 6, 8, 10]} tick={{ fontSize: 10 }} />
              <Tooltip content={<TooltipCard />} />
              {WELLBEING_METRICS.map(({ key, label }) =>
                visibleMetrics.has(key) ? (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={label}
                    stroke={LINE_COLORS[key]}
                    strokeWidth={2}
                    dot={{ r: 3, fill: LINE_COLORS[key] }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Últimas observaciones */}
      {logs.some((l) => l.notes) && (
        <div className="card">
          <p className="text-sm font-semibold text-gray-800 mb-3">Observaciones recientes</p>
          <div className="space-y-2">
            {[...logs]
              .reverse()
              .filter((l) => l.notes)
              .slice(0, 5)
              .map((l) => (
                <div key={l.id} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">
                    {format(parseISO(l.date), "d 'de' MMMM yyyy", { locale: es })}
                  </p>
                  <p className="text-sm text-gray-700">{l.notes}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
