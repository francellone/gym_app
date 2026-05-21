import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { TrendingUp, BarChart3, Table as TableIcon, Tag } from 'lucide-react'
import { format, parseISO, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'
import {
  ComposedChart,
  BarChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  borgColor,
  BORG_LABELS,
  maxWeightOfLog,
  calculateLogVolume,
  getEffectiveWeightMode,
  getEffectiveUnilateral,
} from '@/features/plans/helpers'
import { filterTrainingLogs } from '@/features/plans/typeFilters'
import StudentProgressTableView from '../components/StudentProgressTableView'
import { fetchSingleMirrorBodies } from '@/features/notes/api'

// ─────────────────────────────────────────────────────────────
// Constantes estáticas fuera del componente
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

const VIEW_MODES = [
  { id: 'charts', label: 'Gráficos', icon: BarChart3 },
  { id: 'table', label: 'Tabla', icon: TableIcon },
]

function TooltipCard({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white shadow-lg rounded-xl p-2.5 border border-gray-100 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color }}>
          {e.name}: {e.value}
          {e.unit || ''}
        </p>
      ))}
    </div>
  )
}

// Volumen real respetando weight_mode + unilateral + bodyweight.
// Necesita el peso corporal del alumno para BW.
function volumeOf(l, bodyWeightKg) {
  const weightMode = getEffectiveWeightMode({
    log: l,
    planExercise: l.plan_exercise,
    exercise: l.plan_exercise?.exercise,
  })
  const unilateral = getEffectiveUnilateral({
    log: l,
    planExercise: l.plan_exercise,
    exercise: l.plan_exercise?.exercise,
  })
  return calculateLogVolume(l, bodyWeightKg, { weightMode, unilateral })
}

// ─────────────────────────────────────────────────────────────
// StudentProgressTab
// ─────────────────────────────────────────────────────────────
export default function StudentProgressTab({ studentId }) {
  const [progressLogs, setProgressLogs] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [progressPeriod, setProgressPeriod] = useState(90)
  const [useCustomRange, setUseCustomRange] = useState(false)
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [progressExercises, setProgressExercises] = useState([])
  const [selectedExercise, setSelectedExercise] = useState('')
  const [activeChart, setActiveChart] = useState('weight')
  const [viewMode, setViewMode] = useState('charts')

  // ── ETIQUETAS ─────────────────────────────────────────────
  const [exerciseTags, setExerciseTags] = useState([])
  const [tagAssignments, setTagAssignments] = useState([])
  const [selectedTag, setSelectedTag] = useState('')
  const [groupByTag, setGroupByTag] = useState(false)

  // Peso corporal del alumno (para calcular volumen de ejercicios bodyweight)
  const [studentWeightKg, setStudentWeightKg] = useState(null)

  useEffect(() => {
    fetchProgressData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressPeriod, studentId, useCustomRange, customFrom, customTo])

  // Reset ejercicio al cambiar etiqueta
  useEffect(() => {
    if (!progressExercises.length) return
    const filtered = selectedTag
      ? progressExercises.filter((ex) =>
          tagAssignments.some((ta) => ta.exercise_id === ex.id && ta.tag_id === selectedTag)
        )
      : progressExercises
    if (filtered.length > 0 && !filtered.some((e) => e.id === selectedExercise)) {
      setSelectedExercise(filtered[0].id)
    }
  }, [selectedTag]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProgressData() {
    setLoading(true)
    const since = useCustomRange
      ? customFrom
      : format(subDays(new Date(), progressPeriod), 'yyyy-MM-dd')
    const until = useCustomRange ? customTo : null

    // Joineamos plan_type para excluir logs de evaluaciones de los
    // gráficos del coach (mismo motivo que en ProgressPage del alumno).
    let logsQuery = supabase
      .from('workout_logs')
      .select(
        `
        *,
        plan:plans!plan_id(plan_type),
        plan_exercise:plan_exercises!plan_exercise_id(
          block_label, section, suggested_sets, suggested_weight,
          weight_mode, unilateral,
          exercise:exercises!exercise_id(id, name, default_weight_mode, default_unilateral)
        )
      `
      )
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

    const [logsRes, sessionsRes, tagsRes, tagAssignRes, studentRes] = await Promise.all([
      logsQuery,
      sessionsQuery,
      supabase.from('exercise_tags').select('*').order('name'),
      supabase.from('exercise_tag_assignments').select('*'),
      supabase.from('profiles').select('weight_kg').eq('id', studentId).maybeSingle(),
    ])

    // Excluir logs de evaluaciones del cómputo de gráficos.
    const logData = filterTrainingLogs(logsRes.data || [])

    // Round 2a: merge body de notas mirror para que StudentProgressTableView
    // muestre la última versión del panel (en lugar de workout_logs.notes
    // legacy que vamos a dropear en round 2b).
    const logIds = logData.map((l) => l.id)
    const bodiesMap = await fetchSingleMirrorBodies({
      contextType: 'workout_log',
      contextIds: logIds,
    })
    const logDataWithMirror = logData.map((l) => ({
      ...l,
      notes: bodiesMap.get(l.id) ?? l.notes ?? null,
    }))
    setProgressLogs(logDataWithMirror)
    setSessions(sessionsRes.data || [])
    setExerciseTags(tagsRes.data || [])
    setTagAssignments(tagAssignRes.data || [])
    setStudentWeightKg(studentRes.data?.weight_kg ?? null)

    const exMap = {}
    logData.forEach((l) => {
      const ex = l.plan_exercise?.exercise
      if (ex) exMap[ex.id] = ex.name
    })
    const exList = Object.entries(exMap)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    setProgressExercises(exList)
    if (exList.length > 0) {
      setSelectedExercise((prev) => (exList.find((e) => e.id === prev) ? prev : exList[0].id))
    }
    setLoading(false)
  }

  // ── Datos derivados por etiqueta ──────────────────────────
  const exercisesForTag = useMemo(
    () =>
      selectedTag
        ? progressExercises.filter((ex) =>
            tagAssignments.some((ta) => ta.exercise_id === ex.id && ta.tag_id === selectedTag)
          )
        : progressExercises,
    [progressExercises, selectedTag, tagAssignments]
  )

  const logsForTag = useMemo(
    () =>
      selectedTag
        ? progressLogs.filter((l) => {
            const exId = l.plan_exercise?.exercise?.id
            return (
              exId &&
              tagAssignments.some((ta) => ta.exercise_id === exId && ta.tag_id === selectedTag)
            )
          })
        : progressLogs,
    [progressLogs, selectedTag, tagAssignments]
  )

  // Etiquetas que tienen ejercicios en los logs del período
  const tagsInLogs = useMemo(
    () =>
      exerciseTags.filter((tag) =>
        progressLogs.some((l) => {
          const exId = l.plan_exercise?.exercise?.id
          return (
            exId && tagAssignments.some((ta) => ta.exercise_id === exId && ta.tag_id === tag.id)
          )
        })
      ),
    [exerciseTags, progressLogs, tagAssignments]
  )

  // ── Datos de gráficos (memoizados) ────────────────────────
  const weightData = useMemo(
    () =>
      progressLogs
        .filter((l) => l.plan_exercise?.exercise?.id === selectedExercise)
        .map((l) => ({
          date: format(parseISO(l.logged_date), 'dd/MM'),
          Peso: maxWeightOfLog(l),
          PSE: l.perceived_difficulty,
        }))
        .filter((d) => d.Peso > 0),
    [progressLogs, selectedExercise]
  )

  // Volumen (filtrado por etiqueta). Respeta weight_mode, unilateral y BW.
  const { volumeData, bwUncomputable } = useMemo(() => {
    const byDate = {}
    let uncomp = false
    logsForTag.forEach((l) => {
      const vol = volumeOf(l, studentWeightKg)
      if (vol === null) {
        uncomp = true
        return
      }
      if (vol > 0) {
        const date = format(parseISO(l.logged_date), 'dd/MM')
        byDate[date] = (byDate[date] || 0) + Math.round(vol)
      }
    })
    return {
      volumeData: Object.entries(byDate).map(([date, Volumen]) => ({ date, Volumen })),
      bwUncomputable: uncomp,
    }
  }, [logsForTag, studentWeightKg])

  // Volumen agrupado por etiqueta (para el agrupador)
  const { tagsWithVolume, volumeGroupedData } = useMemo(() => {
    const byTagAndDate = {}
    exerciseTags.forEach((tag) => {
      byTagAndDate[tag.id] = {}
    })
    progressLogs.forEach((l) => {
      const exId = l.plan_exercise?.exercise?.id
      if (!exId) return
      const myTags = tagAssignments.filter((ta) => ta.exercise_id === exId).map((ta) => ta.tag_id)
      if (!myTags.length) return
      const vol = volumeOf(l, studentWeightKg)
      if (vol === null || vol <= 0) return
      const date = format(parseISO(l.logged_date), 'dd/MM')
      myTags.forEach((tagId) => {
        if (byTagAndDate[tagId] !== undefined)
          byTagAndDate[tagId][date] = (byTagAndDate[tagId][date] || 0) + vol
      })
    })
    const withVol = exerciseTags.filter((tag) =>
      Object.values(byTagAndDate[tag.id] || {}).some((v) => v > 0)
    )
    const allDates = [...new Set(progressLogs.map((l) => format(parseISO(l.logged_date), 'dd/MM')))]
    const grouped = allDates.map((date) => {
      const entry = { date }
      withVol.forEach((tag) => {
        const v = byTagAndDate[tag.id]?.[date]
        if (v) entry[tag.name] = Math.round(v)
      })
      return entry
    })
    return { tagsWithVolume: withVol, volumeGroupedData: grouped }
  }, [progressLogs, exerciseTags, tagAssignments, studentWeightKg])

  // PSE (filtrado por etiqueta)
  const pseData = useMemo(() => {
    const byDate = {}
    logsForTag.forEach((l) => {
      if (l.perceived_difficulty) {
        const date = format(parseISO(l.logged_date), 'dd/MM')
        if (!byDate[date]) byDate[date] = []
        byDate[date].push(l.perceived_difficulty)
      }
    })
    return Object.entries(byDate).map(([date, vals]) => ({
      date,
      'PSE promedio': Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    }))
  }, [logsForTag])

  const borgData = useMemo(
    () =>
      sessions
        .filter((s) => s.borg_value != null)
        .map((s) => ({
          date: format(parseISO(s.logged_date), 'dd/MM'),
          Intensidad: Number(s.borg_value),
          label: BORG_LABELS?.[Math.round(Number(s.borg_value))] || '',
        })),
    [sessions]
  )

  const durationData = useMemo(
    () =>
      sessions
        .filter((s) => s.started_at && s.finished_at)
        .filter((s) => format(new Date(s.started_at), 'yyyy-MM-dd') === s.logged_date)
        .map((s) => ({
          date: format(parseISO(s.logged_date), 'dd/MM'),
          Minutos: Math.round((new Date(s.finished_at) - new Date(s.started_at)) / 60000),
        }))
        .filter((d) => d.Minutos > 0),
    [sessions]
  )

  const medianDuration = useMemo(() => {
    if (!durationData.length) return null
    const sorted = [...durationData].map((d) => d.Minutos).sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }, [durationData])

  const compareData = useMemo(
    () =>
      progressLogs
        .filter((l) => l.plan_exercise?.exercise?.id === selectedExercise)
        .map((l) => ({
          date: format(parseISO(l.logged_date), 'dd/MM'),
          'Series reales': l.actual_sets || 0,
          'Series sugeridas': l.plan_exercise?.suggested_sets || 0,
          'Peso real': maxWeightOfLog(l),
        })),
    [progressLogs, selectedExercise]
  )

  const stats = useMemo(() => {
    const sessionDates = new Set(progressLogs.map((l) => l.logged_date))
    const withPSE = progressLogs.filter((l) => l.perceived_difficulty)
    const avgPSE =
      withPSE.length > 0
        ? Math.round(
            (withPSE.reduce((a, l) => a + l.perceived_difficulty, 0) / withPSE.length) * 10
          ) / 10
        : null
    const avgBorg =
      borgData.length > 0
        ? Math.round((borgData.reduce((a, d) => a + d.Intensidad, 0) / borgData.length) * 10) / 10
        : null
    const maxWeight = progressLogs
      .filter((l) => l.plan_exercise?.exercise?.id === selectedExercise)
      .reduce((mx, l) => Math.max(mx, maxWeightOfLog(l)), 0)
    return {
      totalSessions: sessionDates.size,
      totalCompleted: progressLogs.filter((l) => l.completed).length,
      avgPSE,
      avgBorg,
      maxWeight,
    }
  }, [progressLogs, borgData, selectedExercise])

  const weeks = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 8 }, (_, wi) => {
      const weekStart = startOfWeek(subDays(today, wi * 7), { weekStartsOn: 1 })
      return eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) })
    }).reverse()
  }, [])

  const logDates = useMemo(() => new Set(progressLogs.map((l) => l.logged_date)), [progressLogs])
  const today = new Date()

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Sub-nav: Gráficos / Tabla */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {VIEW_MODES.map((m) => {
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
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => {
              setProgressPeriod(p.days)
              setUseCustomRange(false)
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              !useCustomRange && progressPeriod === p.days
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500'
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

      {useCustomRange && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-2">
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
              Desde
            </label>
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="input text-xs py-1.5"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
              Hasta
            </label>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="input text-xs py-1.5"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : progressLogs.length === 0 ? (
        <div className="card text-center py-8 text-gray-400">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin datos de progreso en este período</p>
        </div>
      ) : (
        <>
          {/* ── Filtro por etiqueta (compartido entre Gráficos y Tabla) ── */}
          {tagsInLogs.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                <Tag className="w-3.5 h-3.5" />
                Filtrar por etiqueta
              </div>
              <div className="overflow-x-auto -mx-5 px-5">
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
                  {tagsInLogs.map((tag) => (
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

          {/* ── Vista: Tabla ── */}
          {viewMode === 'table' ? (
            <StudentProgressTableView
              studentId={studentId}
              logs={progressLogs}
              exerciseTags={exerciseTags}
              tagAssignments={tagAssignments}
              selectedTag={selectedTag}
            />
          ) : (
            <>
              {/* Stats resumen */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { val: stats.totalSessions, label: 'Sesiones' },
                  { val: stats.totalCompleted, label: 'Completados' },
                  { val: stats.avgPSE ?? '—', label: 'PSE prom.' },
                ].map((s) => (
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
                  <span
                    className={`text-2xl font-bold px-3 py-1 rounded-xl ${borgColor(Math.round(stats.avgBorg))}`}
                  >
                    {stats.avgBorg}
                  </span>
                </div>
              )}

              {stats.maxWeight > 0 && (
                <div className="card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Peso máximo registrado</p>
                    <p className="text-xs text-gray-500">
                      {progressExercises.find((e) => e.id === selectedExercise)?.name}
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-primary-600">{stats.maxWeight}kg</span>
                </div>
              )}

              {/* Heatmap asistencia */}
              <div className="card space-y-3">
                <p className="text-sm font-semibold text-gray-900">
                  Asistencia (últimas 8 semanas)
                </p>
                <div className="space-y-1.5">
                  <div className="flex gap-1">
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                      <div key={d} className="flex-1 text-center text-xs text-gray-400">
                        {d}
                      </div>
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
                              day > today
                                ? 'bg-gray-50'
                                : logDates.has(ds)
                                  ? 'bg-primary-500'
                                  : 'bg-gray-100'
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

              {/* Selector de ejercicio (filtrado por etiqueta) */}
              {exercisesForTag.length > 0 && (
                <select
                  className="input text-sm w-full"
                  value={selectedExercise}
                  onChange={(e) => setSelectedExercise(e.target.value)}
                >
                  {exercisesForTag.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Tabs de gráficos */}
              <div className="overflow-x-auto -mx-5 px-5">
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-max min-w-full">
                  {CHARTS.map((c) => (
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

              {/* ── Peso ── */}
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
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          domain={[0, 10]}
                          tick={{ fontSize: 10 }}
                        />
                        <Tooltip content={<TooltipCard />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="Peso"
                          fill="#fde68a"
                          stroke="#ea580c"
                          strokeWidth={2.5}
                          dot={{ fill: '#ea580c', r: 4 }}
                          unit="kg"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="PSE"
                          stroke="#8b5cf6"
                          strokeWidth={1.5}
                          dot={false}
                          strokeDasharray="4 2"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-sm text-gray-400 py-6">
                      Sin datos de peso para este ejercicio
                    </p>
                  )}
                </div>
              )}

              {/* ── Volumen ── */}
              {activeChart === 'volume' && (
                <div className="card space-y-3">
                  {bwUncomputable && !studentWeightKg && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700">
                      <strong>Peso corporal del alumno sin registrar.</strong> Los ejercicios de
                      peso corporal (BW) no entran al cálculo del volumen hasta que se cargue el
                      peso del alumno desde su perfil.
                    </div>
                  )}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">
                        Volumen total por sesión
                      </p>
                      <p className="text-xs text-gray-500">
                        {selectedTag
                          ? `Etiqueta: ${tagsInLogs.find((t) => t.id === selectedTag)?.name}`
                          : 'Reps × peso (peso corporal en BW). Unilateral × 2.'}
                      </p>
                    </div>
                    {tagsWithVolume.length > 1 && !selectedTag && (
                      <button
                        onClick={() => setGroupByTag((g) => !g)}
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

                  {groupByTag && !selectedTag && tagsWithVolume.length > 0 ? (
                    volumeGroupedData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={volumeGroupedData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip content={<TooltipCard />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {tagsWithVolume.map((tag) => (
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

              {/* ── PSE ── */}
              {activeChart === 'pse' && (
                <div className="card space-y-3">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">PSE promedio por sesión</p>
                    <p className="text-xs text-gray-500">
                      {selectedTag
                        ? `Esfuerzo percibido · Etiqueta: ${tagsInLogs.find((t) => t.id === selectedTag)?.name}`
                        : 'Esfuerzo percibido (1–10)'}
                    </p>
                  </div>
                  {pseData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={pseData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                        <Tooltip content={<TooltipCard />} />
                        <Area
                          type="monotone"
                          dataKey="PSE promedio"
                          stroke="#8b5cf6"
                          fill="#ede9fe"
                          strokeWidth={2}
                          dot={{ fill: '#8b5cf6', r: 3 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-sm text-gray-400 py-6">Sin datos de PSE</p>
                  )}
                </div>
              )}

              {/* ── Borg ── */}
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
                    <p className="text-center text-sm text-gray-400 py-6">
                      Sin datos de Borg registrados
                    </p>
                  )}
                </div>
              )}

              {/* ── Duración ── */}
              {activeChart === 'duration' && (
                <div className="card space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">Duración de sesiones</p>
                      <p className="text-xs text-gray-500">En minutos · solo sesiones del día</p>
                    </div>
                    {medianDuration !== null && (
                      <div className="flex flex-col items-end">
                        <span className="text-2xl font-bold text-emerald-600">
                          {medianDuration}
                        </span>
                        <span className="text-xs text-gray-400">min · mediana</span>
                      </div>
                    )}
                  </div>
                  {durationData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={durationData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} unit="min" />
                        <Tooltip content={<TooltipCard />} />
                        <Area
                          type="monotone"
                          dataKey="Minutos"
                          stroke="#10b981"
                          fill="#d1fae5"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-sm text-gray-400 py-6">Sin datos de duración</p>
                  )}
                </div>
              )}

              {/* ── Plan vs Real ── */}
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
                    <p className="text-center text-sm text-gray-400 py-6">
                      Sin datos para este ejercicio
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
