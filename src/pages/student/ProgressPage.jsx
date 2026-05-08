import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { TrendingUp, Tag } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, AreaChart, Area,
  ComposedChart,
} from 'recharts'
import { borgColor, BORG_LABELS } from '../../utils/planHelpers'
import { WELLBEING_METRICS, wellbeingColor } from '../../components/wellbeing/WellbeingModal'

const PERIODS = [
  { label: '1m', days: 30 },
  { label: '3m', days: 90 },
  { label: '6m', days: 180 },
  { label: 'Todo', days: 365 },
]

function Card({ children, className = '' }) {
  return <div className={`card space-y-3 ${className}`}>{children}</div>
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white shadow-lg rounded-xl p-3 border border-gray-100 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value}{entry.unit || ''}
        </p>
      ))}
    </div>
  )
}

// Heatmap de asistencia (últimas 8 semanas)
function AttendanceHeatmap({ logs }) {
  const today = new Date()
  const weeks = Array.from({ length: 8 }, (_, wi) => {
    const weekStart = startOfWeek(subDays(today, wi * 7), { weekStartsOn: 1 })
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: weekStart, end: weekEnd })
  }).reverse()

  const logDates = new Set(logs.filter(l => l.completed).map(l => l.logged_date))
  const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {dayLabels.map(d => (
          <div key={d} className="flex-1 text-center text-xs text-gray-400">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="flex gap-1">
          {week.map((day, di) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const hasLog = logDates.has(dateStr)
            const isFuture = day > today
            return (
              <div
                key={di}
                title={dateStr}
                className={`flex-1 h-6 rounded-md transition-all ${
                  isFuture
                    ? 'bg-gray-50'
                    : hasLog
                    ? 'bg-primary-500'
                    : 'bg-gray-100'
                }`}
              />
            )
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs text-gray-400 justify-end">
        <div className="w-3 h-3 rounded bg-gray-100" />Sin entrenamiento
        <div className="w-3 h-3 rounded bg-primary-500" />Con entrenamiento
      </div>
    </div>
  )
}

// Colores fijos por métrica wellbeing
const WELLBEING_LINE_COLORS = {
  sleep_quality:     '#6366f1',
  nutrition_quality: '#22c55e',
  hydration_quality: '#3b82f6',
  energy_level:      '#f59e0b',
  stress_level:      '#ef4444',
  muscle_fatigue:    '#ec4899',
}

// Helper para calcular peso promedio de un log
function getAvgWeight(l) {
  if (l.actual_weights) {
    try {
      const arr = JSON.parse(l.actual_weights)
      if (Array.isArray(arr) && arr.length > 0)
        return arr.reduce((a, b) => a + parseFloat(b || 0), 0) / arr.length
      return parseFloat(l.actual_weights) || 0
    } catch { return parseFloat(l.actual_weights) || 0 }
  }
  return l.actual_weight || 0
}

// Helper para calcular peso máximo de un log
function getMaxWeight(l) {
  if (l.actual_weights) {
    try {
      const arr = JSON.parse(l.actual_weights)
      if (Array.isArray(arr) && arr.length > 0)
        return Math.max(...arr.map(w => parseFloat(w || 0)))
      return parseFloat(l.actual_weights) || 0
    } catch { return parseFloat(l.actual_weights) || 0 }
  }
  return l.actual_weight || 0
}

export default function ProgressPage() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState([])
  const [sessions, setSessions] = useState([])
  const [wellbeingLogs, setWellbeingLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)
  const [selectedExercise, setSelectedExercise] = useState('')
  const [exercises, setExercises] = useState([])
  const [activeChart, setActiveChart] = useState('weight')

  // ── ETIQUETAS ────────────────────────────────────────────
  const [exerciseTags, setExerciseTags] = useState([])
  const [tagAssignments, setTagAssignments] = useState([])
  const [selectedTag, setSelectedTag] = useState('')   // '' = todas
  const [groupByTag, setGroupByTag] = useState(false)

  useEffect(() => {
    if (profile?.id) fetchData()
  }, [profile, period])

  // Cuando cambia el filtro de etiqueta, resetear el ejercicio seleccionado
  // si ya no pertenece a la nueva selección
  useEffect(() => {
    if (!exercises.length) return
    const filtered = selectedTag
      ? exercises.filter(ex =>
          tagAssignments.some(ta => ta.exercise_id === ex.id && ta.tag_id === selectedTag)
        )
      : exercises
    if (filtered.length > 0 && !filtered.some(e => e.id === selectedExercise)) {
      setSelectedExercise(filtered[0].id)
    }
  }, [selectedTag]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)
    const since = format(subDays(new Date(), period), 'yyyy-MM-dd')

    const [logsRes, sessionsRes, wellbeingRes, tagsRes, tagAssignRes] = await Promise.all([
      supabase
        .from('workout_logs')
        .select(`
          *,
          plan_exercise:plan_exercises!plan_exercise_id(
            block_label, section, suggested_sets, suggested_weight,
            exercise:exercises!exercise_id(id, name)
          )
        `)
        .eq('student_id', profile.id)
        .gte('logged_date', since)
        .order('logged_date'),
      supabase
        .from('v_workout_session_intensity')
        .select('*')
        .eq('student_id', profile.id)
        .gte('logged_date', since)
        .order('logged_date'),
      supabase
        .from('wellbeing_logs')
        .select('*')
        .eq('user_id', profile.id)
        .gte('date', since)
        .order('date'),
      supabase
        .from('exercise_tags')
        .select('*')
        .order('name'),
      supabase
        .from('exercise_tag_assignments')
        .select('*'),
    ])

    const logData = logsRes.data || []
    setLogs(logData)
    setSessions(sessionsRes.data || [])
    setWellbeingLogs(wellbeingRes.data || [])
    setExerciseTags(tagsRes.data || [])
    setTagAssignments(tagAssignRes.data || [])

    const exMap = {}
    logData.forEach(l => {
      const ex = l.plan_exercise?.exercise
      if (ex) exMap[ex.id] = ex.name
    })
    const exList = Object.entries(exMap).map(([id, name]) => ({ id, name }))
    setExercises(exList)
    if (!selectedExercise && exList.length > 0) setSelectedExercise(exList[0].id)
    setLoading(false)
  }

  // ── DATOS DERIVADOS POR ETIQUETA ─────────────────────────

  // Ejercicios filtrados por etiqueta (para el selector)
  const exercisesForTag = selectedTag
    ? exercises.filter(ex =>
        tagAssignments.some(ta => ta.exercise_id === ex.id && ta.tag_id === selectedTag)
      )
    : exercises

  // Logs filtrados por etiqueta (para volumen y PSE)
  const logsForTag = selectedTag
    ? logs.filter(l => {
        const exId = l.plan_exercise?.exercise?.id
        return exId && tagAssignments.some(ta => ta.exercise_id === exId && ta.tag_id === selectedTag)
      })
    : logs

  // ── DATOS PARA GRÁFICOS ──────────────────────────────────

  // 1. Progresión de peso por ejercicio (usa exercisesForTag)
  const weightData = logs
    .filter(l =>
      l.plan_exercise?.exercise?.id === selectedExercise &&
      (l.actual_weights || l.actual_weight)
    )
    .map(l => ({
      date: format(parseISO(l.logged_date), 'dd/MM'),
      Peso: getMaxWeight(l),
      PSE: l.perceived_difficulty,
    }))
    .filter(d => d.Peso > 0)

  // 2. Volumen por sesión (filtrado por etiqueta)
  const volumeByDate = {}
  logsForTag.forEach(l => {
    const date = format(parseISO(l.logged_date), 'dd/MM')
    if (l.actual_sets && (l.actual_weights || l.actual_weight)) {
      const reps = parseFloat(l.actual_reps) || 10
      const weight = getAvgWeight(l)
      if (weight > 0) {
        const vol = l.actual_sets * reps * weight
        volumeByDate[date] = (volumeByDate[date] || 0) + vol
      }
    }
  })
  const volumeData = Object.entries(volumeByDate).map(([date, vol]) => ({
    date,
    Volumen: Math.round(vol),
  }))

  // 2b. Volumen agrupado por etiqueta (para el agrupador)
  const volumeByTagAndDate = {}
  exerciseTags.forEach(tag => { volumeByTagAndDate[tag.id] = {} })
  logs.forEach(l => {
    const exId = l.plan_exercise?.exercise?.id
    if (!exId || !l.actual_sets) return
    const myTags = tagAssignments.filter(ta => ta.exercise_id === exId).map(ta => ta.tag_id)
    if (!myTags.length) return
    const date = format(parseISO(l.logged_date), 'dd/MM')
    const weight = getAvgWeight(l)
    if (weight > 0) {
      const reps = parseFloat(l.actual_reps) || 10
      const vol = l.actual_sets * reps * weight
      myTags.forEach(tagId => {
        if (volumeByTagAndDate[tagId] !== undefined) {
          volumeByTagAndDate[tagId][date] = (volumeByTagAndDate[tagId][date] || 0) + vol
        }
      })
    }
  })
  const tagsWithVolume = exerciseTags.filter(tag =>
    Object.values(volumeByTagAndDate[tag.id] || {}).some(v => v > 0)
  )
  const allLogDates = [...new Set(logs.map(l => format(parseISO(l.logged_date), 'dd/MM')))]
  const volumeGroupedData = allLogDates.map(date => {
    const entry = { date }
    tagsWithVolume.forEach(tag => {
      const v = volumeByTagAndDate[tag.id]?.[date]
      if (v) entry[tag.name] = Math.round(v)
    })
    return entry
  })

  // 3. PSE promedio por sesión (filtrado por etiqueta)
  const pseByDate = {}
  logsForTag.forEach(l => {
    if (l.perceived_difficulty) {
      const date = format(parseISO(l.logged_date), 'dd/MM')
      if (!pseByDate[date]) pseByDate[date] = []
      pseByDate[date].push(l.perceived_difficulty)
    }
  })
  const pseData = Object.entries(pseByDate).map(([date, values]) => ({
    date,
    'PSE promedio': Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10,
  }))

  // 4. Intensidad general (borg_value)
  const borgData = sessions
    .filter(s => s.borg_value !== null && s.borg_value !== undefined)
    .map(s => ({
      date: format(parseISO(s.logged_date), 'dd/MM'),
      Intensidad: Number(s.borg_value),
      label: BORG_LABELS[Math.round(Number(s.borg_value))],
    }))

  // 5. Duración de sesiones
  const durationData = sessions
    .filter(s => s.started_at && s.finished_at)
    .filter(s => format(new Date(s.started_at), 'yyyy-MM-dd') === s.logged_date)
    .map(s => {
      const mins = Math.round(
        (new Date(s.finished_at) - new Date(s.started_at)) / 60000
      )
      return { date: format(parseISO(s.logged_date), 'dd/MM'), Minutos: mins }
    })
    .filter(d => d.Minutos > 0)

  const medianDuration = (() => {
    if (!durationData.length) return null
    const sorted = [...durationData].map(d => d.Minutos).sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  })()

  // 6. Comparación sugerido vs real por ejercicio
  const compareData = logs
    .filter(l => l.plan_exercise?.exercise?.id === selectedExercise)
    .map(l => ({
      date: format(parseISO(l.logged_date), 'dd/MM'),
      'Series reales': l.actual_sets || 0,
      'Series sugeridas': l.plan_exercise?.suggested_sets || 0,
      'Peso real': l.actual_weight || 0,
    }))

  // 7. Stats resumen
  const sessionDates = new Set(logs.map(l => l.logged_date))
  const totalSessions = sessionDates.size
  const totalCompleted = logs.filter(l => l.completed).length
  const avgPSE = logs.filter(l => l.perceived_difficulty).length > 0
    ? Math.round(
        logs.filter(l => l.perceived_difficulty)
          .reduce((a, l) => a + l.perceived_difficulty, 0) /
        logs.filter(l => l.perceived_difficulty).length * 10
      ) / 10
    : null

  const avgBorg = borgData.length > 0
    ? Math.round(borgData.reduce((a, d) => a + d.Intensidad, 0) / borgData.length * 10) / 10
    : null

  const maxWeight = logs
    .filter(l => l.plan_exercise?.exercise?.id === selectedExercise && l.actual_weight)
    .reduce((max, l) => Math.max(max, l.actual_weight), 0)

  const CHARTS = [
    { id: 'weight', label: 'Peso' },
    { id: 'volume', label: 'Volumen' },
    { id: 'pse', label: 'PSE' },
    { id: 'borg', label: 'Intensidad' },
    { id: 'duration', label: 'Duración' },
    { id: 'compare', label: 'Sugerido vs Real' },
  ]

  // Etiquetas que tienen ejercicios presentes en los logs del período
  const tagsInLogs = exerciseTags.filter(tag =>
    logs.some(l => {
      const exId = l.plan_exercise?.exercise?.id
      return exId && tagAssignments.some(ta => ta.exercise_id === exId && ta.tag_id === tag.id)
    })
  )

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-12 pb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Mi progreso</h1>
        <div className="flex gap-1 mt-3 bg-gray-100 p-1 rounded-xl">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                period === p.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Sin datos aún</p>
            <p className="text-gray-400 text-sm mt-1">Completá entrenamientos para ver tu progreso</p>
          </div>
        ) : (
          <>
            {/* Stats resumen */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{totalSessions}</p>
                  <p className="text-xs text-gray-500">Sesiones</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{totalCompleted}</p>
                  <p className="text-xs text-gray-500">Ejercicios</p>
                </div>
              </Card>
              <Card>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{avgPSE ?? '—'}</p>
                  <p className="text-xs text-gray-500">PSE prom.</p>
                </div>
              </Card>
            </div>

            {avgBorg !== null && (
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Intensidad general promedio</p>
                    <p className="text-xs text-gray-500">Escala de Borg (0-10)</p>
                  </div>
                  <span className={`text-2xl font-bold px-3 py-1 rounded-xl ${borgColor(Math.round(avgBorg))}`}>
                    {avgBorg}
                  </span>
                </div>
              </Card>
            )}

            {maxWeight > 0 && (
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Peso máximo registrado</p>
                    {exercises.find(e => e.id === selectedExercise) && (
                      <p className="text-xs text-gray-500">
                        {exercises.find(e => e.id === selectedExercise)?.name}
                      </p>
                    )}
                  </div>
                  <span className="text-2xl font-bold text-primary-600">{maxWeight}kg</span>
                </div>
              </Card>
            )}

            {/* ── Filtro por etiqueta ───────────────────────────── */}
            {tagsInLogs.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                  <Tag className="w-3.5 h-3.5" />
                  Filtrar por etiqueta
                </div>
                <div className="overflow-x-auto -mx-4 px-4">
                  <div className="flex gap-2 w-max pb-0.5">
                    <button
                      onClick={() => setSelectedTag('')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        selectedTag === ''
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      Todas
                    </button>
                    {tagsInLogs.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => setSelectedTag(tag.id === selectedTag ? '' : tag.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                          selectedTag === tag.id
                            ? 'text-white border-transparent'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                        style={
                          selectedTag === tag.id
                            ? { backgroundColor: tag.color, borderColor: tag.color }
                            : {}
                        }
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Selector de ejercicio (filtrado por etiqueta) */}
            {exercisesForTag.length > 0 && (
              <select
                className="input text-sm w-full"
                value={selectedExercise}
                onChange={e => setSelectedExercise(e.target.value)}
              >
                {exercisesForTag.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
            )}

            {/* Tabs de gráficos */}
            <div className="overflow-x-auto -mx-4 px-4">
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

            {/* ── Gráfico: Peso ─────────────────────────────────── */}
            {activeChart === 'weight' && (
              <Card>
                <div>
                  <h3 className="font-semibold text-gray-900">Progresión de peso</h3>
                  <p className="text-xs text-gray-500">Peso levantado por sesión</p>
                </div>
                {weightData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={weightData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit="kg" />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area yAxisId="left" type="monotone" dataKey="Peso" fill="#fde68a" stroke="#ea580c" strokeWidth={2.5} dot={{ fill: '#ea580c', r: 4 }} unit="kg" />
                      <Line yAxisId="right" type="monotone" dataKey="PSE" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">Sin datos de peso para este ejercicio</p>
                )}
              </Card>
            )}

            {/* ── Gráfico: Sugerido vs Real ─────────────────────── */}
            {activeChart === 'compare' && (
              <Card>
                <div>
                  <h3 className="font-semibold text-gray-900">Sugerido vs Real</h3>
                  <p className="text-xs text-gray-500">Series planificadas vs ejecutadas</p>
                </div>
                {compareData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={compareData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Series sugeridas" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Series reales" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">Sin datos para este ejercicio</p>
                )}
              </Card>
            )}

            {/* ── Gráfico: Volumen ──────────────────────────────── */}
            {activeChart === 'volume' && (
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">Volumen total por sesión</h3>
                    <p className="text-xs text-gray-500">
                      {selectedTag
                        ? `Etiqueta: ${tagsInLogs.find(t => t.id === selectedTag)?.name}`
                        : 'Series × repeticiones × peso'}
                    </p>
                  </div>
                  {tagsWithVolume.length > 1 && !selectedTag && (
                    <button
                      onClick={() => setGroupByTag(g => !g)}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all border ${
                        groupByTag
                          ? 'bg-primary-50 text-primary-700 border-primary-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Tag className="w-3 h-3" />
                      Por etiqueta
                    </button>
                  )}
                </div>

                {/* Modo agrupado por etiqueta */}
                {groupByTag && !selectedTag && tagsWithVolume.length > 0 ? (
                  volumeGroupedData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={volumeGroupedData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {tagsWithVolume.map(tag => (
                          <Area
                            key={tag.id}
                            type="monotone"
                            dataKey={tag.name}
                            stroke={tag.color}
                            fill={tag.color}
                            fillOpacity={0.15}
                            strokeWidth={2}
                            dot={{ fill: tag.color, r: 3 }}
                            connectNulls
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-sm text-gray-400 py-6">Sin datos de volumen</p>
                  )
                ) : volumeData.length > 0 ? (
                  /* Modo normal (una sola serie) */
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="Volumen" fill="#fed7aa" stroke="#fb923c" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">Sin datos de volumen para este período</p>
                )}
              </Card>
            )}

            {/* ── Gráfico: PSE ─────────────────────────────────── */}
            {activeChart === 'pse' && (
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">Esfuerzo percibido (PSE)</h3>
                    <p className="text-xs text-gray-500">
                      {selectedTag
                        ? `Promedio · Etiqueta: ${tagsInLogs.find(t => t.id === selectedTag)?.name}`
                        : 'Promedio por sesión'}
                    </p>
                  </div>
                </div>
                {pseData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={pseData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="PSE promedio" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">Sin datos de PSE para este período</p>
                )}
              </Card>
            )}

            {/* ── Gráfico: Intensidad Borg ──────────────────────── */}
            {activeChart === 'borg' && borgData.length > 0 && (
              <Card>
                <div>
                  <h3 className="font-semibold text-gray-900">Intensidad general (Borg)</h3>
                  <p className="text-xs text-gray-500">Percepción del entrenamiento completo</p>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={borgData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Intensidad" radius={[4, 4, 0, 0]}>
                      {borgData.map((entry, i) => (
                        <rect key={i} fill={
                          entry.Intensidad >= 8 ? '#ef4444' :
                          entry.Intensidad >= 6 ? '#f97316' :
                          entry.Intensidad >= 4 ? '#eab308' : '#22c55e'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* ── Gráfico: Duración ────────────────────────────── */}
            {activeChart === 'duration' && (
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">Duración de sesiones</h3>
                    <p className="text-xs text-gray-500">Minutos por entrenamiento · solo sesiones del día</p>
                  </div>
                  {medianDuration !== null && (
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-bold text-primary-600">{medianDuration}</span>
                      <span className="text-xs text-gray-400">min · mediana</span>
                    </div>
                  )}
                </div>
                {durationData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={durationData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="min" />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="Minutos" fill="#14b8a6" radius={[4, 4, 0, 0]} unit="min" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">
                    No hay datos de duración aún. Se registran automáticamente cuando finalizás el entrenamiento.
                  </p>
                )}
              </Card>
            )}

            {/* Heatmap de asistencia */}
            <Card>
              <div>
                <h3 className="font-semibold text-gray-900">Asistencia</h3>
                <p className="text-xs text-gray-500">Últimas 8 semanas</p>
              </div>
              <AttendanceHeatmap logs={logs} />
            </Card>
          </>
        )}

        {/* ─── Sección Wellbeing ─── */}
        {wellbeingLogs.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xl">🌟</span>
              <h2 className="text-base font-bold text-gray-900">Wellbeing</h2>
              <span className="text-xs text-gray-400 ml-1">{wellbeingLogs.length} registros</span>
            </div>

            {/* Promedios en grilla 2×3 */}
            <div className="grid grid-cols-2 gap-2">
              {WELLBEING_METRICS.map(({ key, label, emoji, positive }) => {
                const vals = wellbeingLogs.map(l => l[key]).filter(v => v != null)
                const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
                const colorClass = avg ? wellbeingColor(Math.round(avg), positive) : 'bg-gray-100 text-gray-400'
                return (
                  <div key={key} className="card p-3 flex items-center gap-3">
                    <span className="text-xl">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 truncate">{label}</p>
                    </div>
                    <div className={`text-sm font-bold px-2.5 py-1 rounded-xl ${colorClass}`}>
                      {avg ? avg.toFixed(1) : '—'}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Gráfico de evolución wellbeing */}
            <Card>
              <div>
                <h3 className="font-semibold text-gray-900">Evolución wellbeing</h3>
                <p className="text-xs text-gray-500">Escala 1–10</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={wellbeingLogs.map(l => ({
                    date: format(parseISO(l.date), 'd MMM', { locale: es }),
                    ...WELLBEING_METRICS.reduce((acc, { key }) => ({ ...acc, [key]: l[key] }), {}),
                  }))}
                  margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 10]} ticks={[2, 4, 6, 8, 10]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload, label: lbl }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-white shadow-lg rounded-xl p-2.5 border border-gray-100 text-xs space-y-1">
                          <p className="font-semibold text-gray-700">{lbl}</p>
                          {payload.map((e, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                              <span className="text-gray-600">{e.name}:</span>
                              <span className="font-bold">{e.value}</span>
                            </div>
                          ))}
                        </div>
                      )
                    }}
                  />
                  {WELLBEING_METRICS.map(({ key, label }) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={label}
                      stroke={WELLBEING_LINE_COLORS[key]}
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: WELLBEING_LINE_COLORS[key] }}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </>
        )}

      </div>
    </div>
  )
}
