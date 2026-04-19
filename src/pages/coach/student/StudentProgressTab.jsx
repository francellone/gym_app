import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { TrendingUp, BarChart3, Table as TableIcon } from 'lucide-react'
import { format, parseISO, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'
import {
  ComposedChart, BarChart, AreaChart,
  Area, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { borgColor, BORG_LABELS } from '../../../utils/planHelpers'
import StudentProgressTableView from './StudentProgressTableView'

// ─────────────────────────────────────────────────────────────
// Constantes estáticas fuera del componente (no recrean en render)
// ─────────────────────────────────────────────────────────────
const CHARTS = [
  { id: 'weight', label: 'Peso' },
  { id: 'volume', label: 'Volumen' },
  { id: 'pse', label: 'PSE' },
  { id: 'borg', label: 'Intensidad' },
  { id: 'duration', label: 'Duración' },
  { id: 'compare', label: 'Plan vs Real' },
]

const PERIODS = [
  { label: '1m', days: 30 },
  { label: '3m', days: 90 },
  { label: '6m', days: 180 },
  { label: 'Todo', days: 365 },
]

// Modos de visualización de la tab Progreso
const VIEW_MODES = [
  { id: 'charts', label: 'Gráficos', icon: BarChart3 },
  { id: 'table',  label: 'Tabla',    icon: TableIcon },
]

// Componente de tooltip estable (fuera del render para evitar re-montaje)
function TooltipCard({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white shadow-lg rounded-xl p-2.5 border border-gray-100 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color }}>{e.name}: {e.value}{e.unit || ''}</p>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// StudentProgressTab
// Props: studentId
// Maneja su propia carga de datos (lazy: solo carga al montarse)
// ─────────────────────────────────────────────────────────────
export default function StudentProgressTab({ studentId }) {
  const [progressLogs, setProgressLogs] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [progressPeriod, setProgressPeriod] = useState(90)
  // Rango personalizado: si useCustomRange es true, se usa customFrom/customTo en lugar del período
  const [useCustomRange, setUseCustomRange] = useState(false)
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [progressExercises, setProgressExercises] = useState([])
  const [selectedExercise, setSelectedExercise] = useState('')
  const [activeChart, setActiveChart] = useState('weight')
  const [viewMode, setViewMode] = useState('charts') // 'charts' | 'table'

  useEffect(() => {
    fetchProgressData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressPeriod, studentId, useCustomRange, customFrom, customTo])

  async function fetchProgressData() {
    setLoading(true)
    // Rango efectivo: personalizado o basado en período
    const since = useCustomRange
      ? customFrom
      : format(subDays(new Date(), progressPeriod), 'yyyy-MM-dd')
    const until = useCustomRange ? customTo : null

    let logsQuery = supabase
      .from('workout_logs')
      .select(`
        *, plan_exercise:plan_exercises!plan_exercise_id(
          block_label, section, suggested_sets, suggested_weight,
          exercise:exercises!exercise_id(id, name)
        )
      `)
      .eq('student_id', studentId)
      .gte('logged_date', since)
    if (until) logsQuery = logsQuery.lte('logged_date', until)
    logsQuery = logsQuery.order('logged_date')

    let sessionsQuery = supabase
      .from('v_workout_session_intensity')
      .select('*')
      .eq('student_id', studentId)
      .gte('logged_date', since)
    if (until) sessionsQuery = sessionsQuery.lte('logged_date', until)
    sessionsQuery = sessionsQuery.order('logged_date')

    const [logsRes, sessionsRes] = await Promise.all([logsQuery, sessionsQuery])

    const logData = logsRes.data || []
    setProgressLogs(logData)
    setSessions(sessionsRes.data || [])

    const exMap = {}
    logData.forEach(l => {
      const ex = l.plan_exercise?.exercise
      if (ex) exMap[ex.id] = ex.name
    })
    const exList = Object.entries(exMap).map(([id, name]) => ({ id, name }))
    setProgressExercises(exList)
    // Solo resetea el ejercicio seleccionado si no hay uno válido
    if (exList.length > 0) {
      setSelectedExercise(prev =>
        exList.find(e => e.id === prev) ? prev : exList[0].id
      )
    }
    setLoading(false)
  }

  // ── Datos de gráficos (memoizados) ─────────────────────────
  const weightData = useMemo(() =>
    progressLogs
      .filter(l => l.plan_exercise?.exercise?.id === selectedExercise && (l.actual_weights || l.actual_weight))
      .map(l => {
        let pesoMax = l.actual_weight || 0
        if (l.actual_weights) {
          try {
            const arr = JSON.parse(l.actual_weights)
            pesoMax = Array.isArray(arr) && arr.length > 0
              ? Math.max(...arr.map(w => parseFloat(w || 0)))
              : parseFloat(l.actual_weights) || pesoMax
          } catch { pesoMax = parseFloat(l.actual_weights) || pesoMax }
        }
        return { date: format(parseISO(l.logged_date), 'dd/MM'), Peso: pesoMax, PSE: l.perceived_difficulty }
      }).filter(d => d.Peso > 0),
    [progressLogs, selectedExercise]
  )

  const volumeData = useMemo(() => {
    const byDate = {}
    progressLogs.forEach(l => {
      if (l.actual_sets && (l.actual_weights || l.actual_weight)) {
        const reps = parseFloat(l.actual_reps) || 10
        let weight = 0
        if (l.actual_weights) {
          try {
            const arr = JSON.parse(l.actual_weights)
            weight = Array.isArray(arr) && arr.length > 0
              ? arr.reduce((a, b) => a + parseFloat(b || 0), 0) / arr.length
              : parseFloat(l.actual_weights) || 0
          } catch { weight = parseFloat(l.actual_weights) || 0 }
        } else { weight = l.actual_weight || 0 }
        if (weight > 0) {
          const date = format(parseISO(l.logged_date), 'dd/MM')
          byDate[date] = (byDate[date] || 0) + Math.round(l.actual_sets * reps * weight)
        }
      }
    })
    return Object.entries(byDate).map(([date, Volumen]) => ({ date, Volumen }))
  }, [progressLogs])

  const pseData = useMemo(() => {
    const byDate = {}
    progressLogs.forEach(l => {
      if (l.perceived_difficulty) {
        const date = format(parseISO(l.logged_date), 'dd/MM')
        if (!byDate[date]) byDate[date] = []
        byDate[date].push(l.perceived_difficulty)
      }
    })
    return Object.entries(byDate).map(([date, vals]) => ({
      date,
      'PSE promedio': Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10,
    }))
  }, [progressLogs])

  const borgData = useMemo(() =>
    sessions
      .filter(s => s.borg_value != null)
      .map(s => ({
        date: format(parseISO(s.logged_date), 'dd/MM'),
        Intensidad: Number(s.borg_value),
        label: BORG_LABELS?.[Math.round(Number(s.borg_value))] || '',
      })),
    [sessions]
  )

  const durationData = useMemo(() =>
    sessions
      .filter(s => s.started_at && s.finished_at)
      .map(s => ({
        date: format(parseISO(s.logged_date), 'dd/MM'),
        Minutos: Math.round((new Date(s.finished_at) - new Date(s.started_at)) / 60000),
      })),
    [sessions]
  )

  const compareData = useMemo(() =>
    progressLogs
      .filter(l => l.plan_exercise?.exercise?.id === selectedExercise)
      .map(l => ({
        date: format(parseISO(l.logged_date), 'dd/MM'),
        'Series reales': l.actual_sets || 0,
        'Series sugeridas': l.plan_exercise?.suggested_sets || 0,
        'Peso real': l.actual_weight || 0,
      })),
    [progressLogs, selectedExercise]
  )

  const stats = useMemo(() => {
    const sessionDates = new Set(progressLogs.map(l => l.logged_date))
    const totalSessions = sessionDates.size
    const totalCompleted = progressLogs.filter(l => l.completed).length
    const withPSE = progressLogs.filter(l => l.perceived_difficulty)
    const avgPSE = withPSE.length > 0
      ? Math.round(withPSE.reduce((a, l) => a + l.perceived_difficulty, 0) / withPSE.length * 10) / 10
      : null
    const avgBorg = borgData.length > 0
      ? Math.round(borgData.reduce((a, d) => a + d.Intensidad, 0) / borgData.length * 10) / 10
      : null
    const maxWeight = progressLogs
      .filter(l => l.plan_exercise?.exercise?.id === selectedExercise && l.actual_weight)
      .reduce((mx, l) => Math.max(mx, l.actual_weight), 0)
    return { totalSessions, totalCompleted, avgPSE, avgBorg, maxWeight }
  }, [progressLogs, borgData, selectedExercise])

  // Semanas de asistencia (se recalcula solo con progressLogs)
  const weeks = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 8 }, (_, wi) => {
      const weekStart = startOfWeek(subDays(today, wi * 7), { weekStartsOn: 1 })
      return eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) })
    }).reverse()
  }, []) // solo recalcula al montar

  const logDates = useMemo(() => new Set(progressLogs.map(l => l.logged_date)), [progressLogs])
  const today = new Date()

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Sub-nav: Gráficos / Tabla */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {VIEW_MODES.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.id}
              onClick={() => setViewMode(m.id)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                viewMode === m.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <Icon size={13} />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Selector de período */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {PERIODS.map(p => (
          <button
            key={p.days}
            onClick={() => { setProgressPeriod(p.days); setUseCustomRange(false) }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              !useCustomRange && progressPeriod === p.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setUseCustomRange(true)}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
            useCustomRange ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          Personalizado
        </button>
      </div>

      {/* Inputs de rango personalizado */}
      {useCustomRange && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-2">
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Desde</label>
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="input text-xs py-1.5"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Hasta</label>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={e => setCustomTo(e.target.value)}
              className="input text-xs py-1.5"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : viewMode === 'table' ? (
        <StudentProgressTableView studentId={studentId} logs={progressLogs} />
      ) : progressLogs.length === 0 ? (
        <div className="card text-center py-8 text-gray-400">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin datos de progreso en este período</p>
        </div>
      ) : (
        <>
          {/* Stats resumen */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { val: stats.totalSessions, label: 'Sesiones' },
              { val: stats.totalCompleted, label: 'Completados' },
              { val: stats.avgPSE ?? '—', label: 'PSE prom.' },
            ].map(s => (
              <div key={s.label} className="card text-center py-2">
                <p className="text-2xl font-bold text-gray-900">{s.val}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>

          {stats.avgBorg !== null && (
            <div className="card flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Intensidad promedio</p>
                <p className="text-xs text-gray-500">Escala de Borg (0–10)</p>
              </div>
              <span className={`text-2xl font-bold px-3 py-1 rounded-xl ${borgColor(Math.round(stats.avgBorg))}`}>
                {stats.avgBorg}
              </span>
            </div>
          )}

          {stats.maxWeight > 0 && (
            <div className="card flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Peso máximo registrado</p>
                <p className="text-xs text-gray-500">
                  {progressExercises.find(e => e.id === selectedExercise)?.name}
                </p>
              </div>
              <span className="text-2xl font-bold text-primary-600">{stats.maxWeight}kg</span>
            </div>
          )}

          {/* Heatmap asistencia */}
          <div className="card space-y-3">
            <p className="text-sm font-semibold text-gray-900">Asistencia (últimas 8 semanas)</p>
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                  <div key={d} className="flex-1 text-center text-xs text-gray-400">{d}</div>
                ))}
              </div>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex gap-1">
                  {week.map((day, di) => {
                    const ds = format(day, 'yyyy-MM-dd')
                    return (
                      <div
                        key={di}
                        title={ds}
                        className={`flex-1 h-5 rounded ${
                          day > today ? 'bg-gray-50' :
                          logDates.has(ds) ? 'bg-primary-500' : 'bg-gray-100'
                        }`}
                      />
                    )
                  })}
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs text-gray-400 justify-end">
                <div className="w-3 h-3 rounded bg-gray-100" /> Sin entrenamiento
                <div className="w-3 h-3 rounded bg-primary-500" /> Con entrenamiento
              </div>
            </div>
          </div>

          {/* Selector de ejercicio */}
          {progressExercises.length > 0 && (
            <select
              className="input text-sm w-full"
              value={selectedExercise}
              onChange={e => setSelectedExercise(e.target.value)}
            >
              {progressExercises.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          )}

          {/* Tabs de gráficos */}
          <div className="overflow-x-auto -mx-5 px-5">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-max min-w-full">
              {CHARTS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setActiveChart(c.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                    activeChart === c.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Gráfico: Peso ── */}
          {activeChart === 'weight' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">Progresión de peso</p>
                <p className="text-xs text-gray-500">Peso máximo levantado por sesión</p>
              </div>
              {weightData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={weightData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit="kg" />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipCard />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="left" type="monotone" dataKey="Peso" fill="#fde68a" stroke="#ea580c" strokeWidth={2.5} dot={{ fill: '#ea580c', r: 4 }} unit="kg" />
                    <Line yAxisId="right" type="monotone" dataKey="PSE" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">Sin datos de peso para este ejercicio</p>
              )}
            </div>
          )}

          {/* ── Gráfico: Volumen ── */}
          {activeChart === 'volume' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">Volumen total por sesión</p>
                <p className="text-xs text-gray-500">Series × Reps × Peso</p>
              </div>
              {volumeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipCard />} />
                    <Bar dataKey="Volumen" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">Sin datos de volumen</p>
              )}
            </div>
          )}

          {/* ── Gráfico: PSE ── */}
          {activeChart === 'pse' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">PSE promedio por sesión</p>
                <p className="text-xs text-gray-500">Esfuerzo percibido (1–10)</p>
              </div>
              {pseData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={pseData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipCard />} />
                    <Area type="monotone" dataKey="PSE promedio" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">Sin datos de PSE</p>
              )}
            </div>
          )}

          {/* ── Gráfico: Borg ── */}
          {activeChart === 'borg' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">Intensidad general</p>
                <p className="text-xs text-gray-500">Escala de Borg por sesión</p>
              </div>
              {borgData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={borgData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipCard />} />
                    <Bar dataKey="Intensidad" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">Sin datos de Borg registrados</p>
              )}
            </div>
          )}

          {/* ── Gráfico: Duración ── */}
          {activeChart === 'duration' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">Duración de sesiones</p>
                <p className="text-xs text-gray-500">En minutos</p>
              </div>
              {durationData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={durationData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit="min" />
                    <Tooltip content={<TooltipCard />} />
                    <Area type="monotone" dataKey="Minutos" stroke="#10b981" fill="#d1fae5" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">Sin datos de duración</p>
              )}
            </div>
          )}

          {/* ── Gráfico: Plan vs Real ── */}
          {activeChart === 'compare' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">Plan vs Real</p>
                <p className="text-xs text-gray-500">Series planificadas vs ejecutadas</p>
              </div>
              {compareData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={compareData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipCard />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Series sugeridas" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Series reales" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">Sin datos para este ejercicio</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
