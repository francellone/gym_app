import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { TrendingUp, BarChart3, Table as TableIcon, Users } from 'lucide-react'
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
  getLoggingWeightMode,
  getEffectiveUnilateral,
} from '../helpers'
import StudentProgressTableView from '@/features/students/components/StudentProgressTableView'
import AvatarImage from '@/features/avatars/AvatarImage'

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────
// Las etiquetas se resuelven con t() en el render: coach.plans.progress.chart.<id>
const CHARTS = [
  { id: 'weight' },
  { id: 'volume' },
  { id: 'pse' },
  { id: 'borg' },
  { id: 'duration' },
  { id: 'compare' },
]

const PERIODS = [
  { label: '1m', days: 30 },
  { label: '3m', days: 90 },
  { label: '6m', days: 180 },
  { label: null, days: 365 }, // "Todo": coach.plans.progress.periodAll
]

const VIEW_MODES = [
  { id: 'charts', icon: BarChart3 },
  { id: 'table', icon: TableIcon },
]

// ─────────────────────────────────────────────────────────────
// Tooltip estable
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// PlanProgressTab
// Props:
//   planId      – ID del plan actual
//   assignments – array de { id, student_id, student: { id, name } }
// ─────────────────────────────────────────────────────────────
export default function PlanProgressTab({ planId, assignments }) {
  const { t } = useTranslation()
  // ── Alumno seleccionado ──────────────────────────────────
  const [selectedStudentId, setSelectedStudentId] = useState(
    () => assignments[0]?.student_id ?? null
  )

  // Si cambian las asignaciones y el alumno seleccionado ya no existe, reset
  useEffect(() => {
    if (!assignments.find((a) => a.student_id === selectedStudentId) && assignments.length > 0) {
      setSelectedStudentId(assignments[0].student_id)
    }
  }, [assignments])

  // ── Datos ────────────────────────────────────────────────
  const [progressLogs, setProgressLogs] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [progressExercises, setProgressExercises] = useState([])
  const [selectedExercise, setSelectedExercise] = useState('')
  // Peso corporal del alumno seleccionado (para BW volume)
  const [studentWeightKg, setStudentWeightKg] = useState(null)

  // ── Período / rango ──────────────────────────────────────
  const [progressPeriod, setProgressPeriod] = useState(90)
  const [useCustomRange, setUseCustomRange] = useState(false)
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  // ── Vista ────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('charts')
  const [activeChart, setActiveChart] = useState('weight')

  // ── Fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (selectedStudentId) fetchProgressData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId, planId, progressPeriod, useCustomRange, customFrom, customTo])

  async function fetchProgressData() {
    if (!selectedStudentId) return
    setLoading(true)

    const since = useCustomRange
      ? customFrom
      : format(subDays(new Date(), progressPeriod), 'yyyy-MM-dd')
    const until = useCustomRange ? customTo : null

    // workout_logs filtrado por student_id + plan_id
    let logsQuery = supabase
      .from('workout_logs')
      .select(
        `
        *, plan_exercise:plan_exercises!plan_exercise_id(
          block_label, section, suggested_sets, suggested_weight,
          weight_mode, unilateral,
          exercise:exercises!exercise_id(id, name, default_weight_mode, default_unilateral)
        )
      `
      )
      .eq('student_id', selectedStudentId)
      .eq('plan_id', planId)
      .gte('logged_date', since)
    if (until) logsQuery = logsQuery.lte('logged_date', until)
    logsQuery = logsQuery.order('logged_date')

    // Intensidad de sesión (filtrado por alumno; la vista agrupa por sesión entera)
    let sessionsQuery = supabase
      .from('v_workout_session_intensity')
      .select('*')
      .eq('student_id', selectedStudentId)
      .gte('logged_date', since)
    if (until) sessionsQuery = sessionsQuery.lte('logged_date', until)
    sessionsQuery = sessionsQuery.order('logged_date')

    const [logsRes, sessionsRes, studentRes] = await Promise.all([
      logsQuery,
      sessionsQuery,
      supabase.from('profiles').select('weight_kg').eq('id', selectedStudentId).maybeSingle(),
    ])

    const logData = logsRes.data || []
    setProgressLogs(logData)
    setSessions(sessionsRes.data || [])
    setStudentWeightKg(studentRes.data?.weight_kg ?? null)

    // Lista de ejercicios presentes en los logs
    const exMap = {}
    logData.forEach((l) => {
      const ex = l.plan_exercise?.exercise
      if (ex) exMap[ex.id] = ex.name
    })
    const exList = Object.entries(exMap).map(([id, name]) => ({ id, name }))
    setProgressExercises(exList)
    if (exList.length > 0) {
      setSelectedExercise((prev) => (exList.find((e) => e.id === prev) ? prev : exList[0].id))
    }

    setLoading(false)
  }

  // ── Datos de gráficos ─────────────────────────────────────
  const weightData = useMemo(
    () =>
      progressLogs
        .filter((l) => l.plan_exercise?.exercise?.id === selectedExercise)
        .map((l) => ({
          date: format(parseISO(l.logged_date), t('coach.plans.progress.chartDate')),
          Peso: maxWeightOfLog(l),
          PSE: l.perceived_difficulty,
        }))
        .filter((d) => d.Peso > 0),
    [progressLogs, selectedExercise, t]
  )

  // Volumen respetando weight_mode + unilateral + BW
  const { volumeData, bwUncomputable } = useMemo(() => {
    const byDate = {}
    let uncomp = false
    progressLogs.forEach((l) => {
      const weightMode = getLoggingWeightMode(
        getEffectiveWeightMode({
          log: l,
          planExercise: l.plan_exercise,
          exercise: l.plan_exercise?.exercise,
        })
      )
      const unilateral = getEffectiveUnilateral({
        log: l,
        planExercise: l.plan_exercise,
        exercise: l.plan_exercise?.exercise,
      })
      const vol = calculateLogVolume(l, studentWeightKg, { weightMode, unilateral })
      if (vol === null) {
        uncomp = true
        return
      }
      if (vol > 0) {
        const date = format(parseISO(l.logged_date), t('coach.plans.progress.chartDate'))
        byDate[date] = (byDate[date] || 0) + Math.round(vol)
      }
    })
    return {
      volumeData: Object.entries(byDate).map(([date, Volumen]) => ({ date, Volumen })),
      bwUncomputable: uncomp,
    }
  }, [progressLogs, studentWeightKg, t])

  const pseData = useMemo(() => {
    const byDate = {}
    progressLogs.forEach((l) => {
      if (l.perceived_difficulty) {
        const date = format(parseISO(l.logged_date), t('coach.plans.progress.chartDate'))
        if (!byDate[date]) byDate[date] = []
        byDate[date].push(l.perceived_difficulty)
      }
    })
    return Object.entries(byDate).map(([date, vals]) => ({
      date,
      'PSE promedio': Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    }))
  }, [progressLogs, t])

  const borgData = useMemo(
    () =>
      sessions
        .filter((s) => s.borg_value != null)
        .map((s) => ({
          date: format(parseISO(s.logged_date), t('coach.plans.progress.chartDate')),
          Intensidad: Number(s.borg_value),
          label: BORG_LABELS?.[Math.round(Number(s.borg_value))] || '',
        })),
    [sessions, t]
  )

  const durationData = useMemo(
    () =>
      sessions
        .filter((s) => s.started_at && s.finished_at)
        .filter((s) => format(new Date(s.started_at), 'yyyy-MM-dd') === s.logged_date)
        .map((s) => ({
          date: format(parseISO(s.logged_date), t('coach.plans.progress.chartDate')),
          Minutos: Math.round((new Date(s.finished_at) - new Date(s.started_at)) / 60000),
        }))
        .filter((d) => d.Minutos > 0),
    [sessions, t]
  )

  const medianDuration = useMemo(() => {
    if (durationData.length === 0) return null
    const sorted = [...durationData].map((d) => d.Minutos).sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }, [durationData])

  const compareData = useMemo(
    () =>
      progressLogs
        .filter((l) => l.plan_exercise?.exercise?.id === selectedExercise)
        .map((l) => ({
          date: format(parseISO(l.logged_date), t('coach.plans.progress.chartDate')),
          'Series reales': l.actual_sets || 0,
          'Series sugeridas': l.plan_exercise?.suggested_sets || 0,
          'Peso real': maxWeightOfLog(l),
        })),
    [progressLogs, selectedExercise, t]
  )

  const stats = useMemo(() => {
    const sessionDates = new Set(progressLogs.map((l) => l.logged_date))
    const totalSessions = sessionDates.size
    const totalCompleted = progressLogs.filter((l) => l.completed).length
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
    return { totalSessions, totalCompleted, avgPSE, avgBorg, maxWeight }
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

  // ── Sin asignaciones ─────────────────────────────────────
  if (assignments.length === 0) {
    return (
      <div className="card text-center py-12 text-gray-400">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">{t('coach.plans.progress.noAssignments')}</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Selector de alumno (si hay más de uno) ─────────── */}
      {assignments.length > 1 && (
        <div className="card">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
            {t('coach.plans.progress.person')}
          </p>
          <div className="flex flex-wrap gap-2">
            {assignments.map((a) => {
              const isActive = a.student_id === selectedStudentId
              return (
                <button
                  key={a.student_id}
                  onClick={() => setSelectedStudentId(a.student_id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                    isActive
                      ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-primary-300 hover:text-primary-700'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 overflow-hidden ${
                      isActive ? 'bg-white/20 text-white' : 'bg-primary-100 text-primary-700'
                    }`}
                  >
                    <AvatarImage path={a.student?.avatar_url} alt={a.student?.name}>
                      {a.student?.name?.[0]?.toUpperCase()}
                    </AvatarImage>
                  </span>
                  {a.student?.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Si hay un solo alumno, solo mostrar su nombre como header sutil */}
      {assignments.length === 1 && (
        <div className="flex items-center gap-2 px-1">
          <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-[11px] font-bold text-primary-700 overflow-hidden">
            <AvatarImage
              path={assignments[0].student?.avatar_url}
              alt={assignments[0].student?.name}
            >
              {assignments[0].student?.name?.[0]?.toUpperCase()}
            </AvatarImage>
          </div>
          <span className="text-sm font-medium text-gray-700">{assignments[0].student?.name}</span>
        </div>
      )}

      {/* ── Sub-nav: Gráficos / Tabla ─────────────────────── */}
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
              {t(`coach.plans.progress.view.${m.id}`)}
            </button>
          )
        })}
      </div>

      {/* ── Selector de período ───────────────────────────── */}
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
            {p.label ?? t('coach.plans.progress.periodAll')}
          </button>
        ))}
        <button
          onClick={() => setUseCustomRange(true)}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
            useCustomRange ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          {t('coach.plans.progress.periodCustom')}
        </button>
      </div>

      {/* Inputs de rango personalizado */}
      {useCustomRange && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-2">
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
              {t('coach.plans.progress.from')}
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
              {t('coach.plans.progress.to')}
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

      {/* ── Contenido ─────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : viewMode === 'table' ? (
        <StudentProgressTableView studentId={selectedStudentId} logs={progressLogs} />
      ) : progressLogs.length === 0 ? (
        <div className="card text-center py-8 text-gray-400">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('coach.plans.progress.noLogs')}</p>
        </div>
      ) : (
        <>
          {/* Stats resumen */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { val: stats.totalSessions, label: t('coach.plans.progress.statSessions') },
              { val: stats.totalCompleted, label: t('coach.plans.progress.statCompleted') },
              { val: stats.avgPSE ?? '—', label: t('coach.plans.progress.statAvgPse') },
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
                <p className="text-sm font-semibold text-gray-900">
                  {t('coach.plans.progress.avgIntensity')}
                </p>
                <p className="text-xs text-gray-500">{t('coach.plans.progress.borgScale')}</p>
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
                <p className="text-sm font-semibold text-gray-900">
                  {t('coach.plans.progress.maxWeightLogged')}
                </p>
                <p className="text-xs text-gray-500">
                  {progressExercises.find((e) => e.id === selectedExercise)?.name}
                </p>
              </div>
              <span className="text-2xl font-bold text-primary-600">{stats.maxWeight}kg</span>
            </div>
          )}

          {/* Heatmap de asistencia */}
          <div className="card space-y-3">
            <p className="text-sm font-semibold text-gray-900">
              {t('coach.plans.progress.attendance')}
            </p>
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {t('dates.dayInitials')
                  .split(',')
                  .map((d, i) => (
                    <div key={i} className="flex-1 text-center text-xs text-gray-400">
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
                <div className="w-3 h-3 rounded bg-gray-100" /> {t('coach.plans.progress.noLog')}
                <div className="w-3 h-3 rounded bg-primary-500" />{' '}
                {t('coach.plans.progress.withLog')}
              </div>
            </div>
          </div>

          {/* Selector de ejercicio */}
          {progressExercises.length > 0 && (
            <select
              className="input text-sm w-full"
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
            >
              {progressExercises.map((ex) => (
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
                  {t(`coach.plans.progress.chart.${c.id}`)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Gráfico: Peso ── */}
          {activeChart === 'weight' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">
                  {t('coach.plans.progress.weightTitle')}
                </p>
                <p className="text-xs text-gray-500">{t('coach.plans.progress.weightSubtitle')}</p>
              </div>
              {weightData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={weightData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" />
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
                      name={t('coach.plans.progress.series.weight')}
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
                      name={t('coach.plans.progress.series.pse')}
                      stroke="#76675d"
                      strokeWidth={1.5}
                      dot={false}
                      strokeDasharray="4 2"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">
                  {t('coach.plans.progress.noWeightData')}
                </p>
              )}
            </div>
          )}

          {/* ── Gráfico: Volumen ── */}
          {activeChart === 'volume' && (
            <div className="card space-y-3">
              {bwUncomputable && !studentWeightKg && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700">
                  <strong>{t('coach.plans.progress.bwMissingTitle')}</strong>{' '}
                  {t('coach.plans.progress.bwMissingBody')}
                </div>
              )}
              <div>
                <p className="font-semibold text-sm text-gray-900">
                  {t('coach.plans.progress.volumeTitle')}
                </p>
                <p className="text-xs text-gray-500">{t('coach.plans.progress.volumeSubtitle')}</p>
              </div>
              {volumeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipCard />} />
                    <Bar
                      dataKey="Volumen"
                      name={t('coach.plans.progress.series.volume')}
                      fill="#834f72"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">
                  {t('coach.plans.progress.noVolumeData')}
                </p>
              )}
            </div>
          )}

          {/* ── Gráfico: PSE ── */}
          {activeChart === 'pse' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">
                  {t('coach.plans.progress.pseTitle')}
                </p>
                <p className="text-xs text-gray-500">{t('coach.plans.progress.pseSubtitle')}</p>
              </div>
              {pseData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={pseData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipCard />} />
                    <Area
                      type="monotone"
                      dataKey="PSE promedio"
                      name={t('coach.plans.progress.series.avgPse')}
                      stroke="#76675d"
                      fill="#f5f0eb"
                      strokeWidth={2}
                      dot={{ fill: '#76675d', r: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">
                  {t('coach.plans.progress.noPseData')}
                </p>
              )}
            </div>
          )}

          {/* ── Gráfico: Borg ── */}
          {activeChart === 'borg' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">
                  {t('coach.plans.progress.borgTitle')}
                </p>
                <p className="text-xs text-gray-500">{t('coach.plans.progress.borgSubtitle')}</p>
              </div>
              {borgData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={borgData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipCard />} />
                    <Bar
                      dataKey="Intensidad"
                      name={t('coach.plans.progress.series.intensity')}
                      fill="#fdba74"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">
                  {t('coach.plans.progress.noBorgData')}
                </p>
              )}
            </div>
          )}

          {/* ── Gráfico: Duración ── */}
          {activeChart === 'duration' && (
            <div className="card space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {t('coach.plans.progress.durationTitle')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t('coach.plans.progress.durationSubtitle')}
                  </p>
                </div>
                {medianDuration !== null && (
                  <div className="flex flex-col items-end">
                    <span className="text-2xl font-bold text-emerald-600">{medianDuration}</span>
                    <span className="text-xs text-gray-400">
                      {t('coach.plans.progress.medianMinutes')}
                    </span>
                  </div>
                )}
              </div>
              {durationData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={durationData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit="min" />
                    <Tooltip content={<TooltipCard />} />
                    <Area
                      type="monotone"
                      dataKey="Minutos"
                      name={t('coach.plans.progress.series.minutes')}
                      stroke="#4a6b80"
                      fill="#e3ecf1"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">
                  {t('coach.plans.progress.noDurationData')}
                </p>
              )}
            </div>
          )}

          {/* ── Gráfico: Plan vs Real ── */}
          {activeChart === 'compare' && (
            <div className="card space-y-3">
              <div>
                <p className="font-semibold text-sm text-gray-900">
                  {t('coach.plans.progress.chart.compare')}
                </p>
                <p className="text-xs text-gray-500">{t('coach.plans.progress.compareSubtitle')}</p>
              </div>
              {compareData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={compareData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<TooltipCard />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="Series sugeridas"
                      name={t('coach.plans.progress.series.suggestedSets')}
                      fill="#e3d8cf"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Series reales"
                      name={t('coach.plans.progress.series.actualSets')}
                      fill="#ea580c"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">
                  {t('coach.plans.progress.noExerciseData')}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
