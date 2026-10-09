import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { format, parseISO, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { exerciseDisplay } from '@/features/exercises/exercise-display'
import { dateLocale } from '@/i18n/dateLocale'
import { TrendingUp, Tag } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import { borgColor, BORG_LABELS, maxWeightOfLog } from '@/features/plans/helpers'
import { WELLBEING_METRICS, wellbeingColor } from '@/features/wellbeing/components/WellbeingModal'
import { filterTrainingLogs } from '@/features/plans/typeFilters'
import { computeProgression, repsMaxOfLog } from '../progression'
import {
  buildRepsWeightSeries,
  buildExerciseVolumeSeries,
  describeExerciseSeries,
  progressionPoints,
} from '../exerciseSeries'
import ChartHeader from '../components/ChartHeader'
import RepsWeightChart from '../components/RepsWeightChart'

const PERIODS = [
  { label: '1m', days: 30 },
  { label: '3m', days: 90 },
  { label: '6m', days: 180 },
  { labelKey: 'progress.periodAll', days: 365 },
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
          {entry.name}: {entry.value}
          {entry.unit || ''}
        </p>
      ))}
    </div>
  )
}

// Heatmap de asistencia (últimas 8 semanas)
function AttendanceHeatmap({ logs }) {
  const { t } = useTranslation()
  const today = new Date()
  const weeks = Array.from({ length: 8 }, (_, wi) => {
    const weekStart = startOfWeek(subDays(today, wi * 7), { weekStartsOn: 1 })
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: weekStart, end: weekEnd })
  }).reverse()

  const logDates = new Set(logs.filter((l) => l.completed).map((l) => l.logged_date))
  const dayLabels = t('dates.dayInitials').split(',')

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {dayLabels.map((d, di) => (
          <div key={di} className="flex-1 text-center text-xs text-gray-400">
            {d}
          </div>
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
                  isFuture ? 'bg-gray-50' : hasLog ? 'bg-primary-500' : 'bg-gray-100'
                }`}
              />
            )
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs text-gray-400 justify-end">
        <div className="w-3 h-3 rounded bg-gray-100" />
        {t('progress.noTraining')}
        <div className="w-3 h-3 rounded bg-primary-500" />
        {t('progress.withTraining')}
      </div>
    </div>
  )
}

// Colores fijos por métrica wellbeing
const WELLBEING_LINE_COLORS = {
  sleep_quality: 'rgb(var(--c-ciruela-600))',
  nutrition_quality: 'rgb(var(--c-green-300))',
  hydration_quality: '#3b82f6',
  energy_level: 'rgb(var(--c-amber-500))',
  stress_level: 'rgb(var(--c-red-500))',
  muscle_fatigue: '#ec4899',
}

// Helpers ahora viven en planHelpers (readLogWeights / readLogReps /
// maxWeightOfLog / avgWeightOfLog / calculateLogVolume) y priorizan jsonb
// sobre las columnas legacy.

export default function ProgressPage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()

  // Nombres de series de los gráficos: son también las keys de los objetos
  // de datos que consume recharts (legend/tooltip los muestran tal cual).
  const sVolume = t('progress.seriesVolume')
  const sPseAvg = t('progress.seriesPseAvg')
  const sIntensity = t('progress.seriesIntensity')
  const sMinutes = t('progress.seriesMinutes')
  const sActualSets = t('progress.seriesActualSets')
  const sSuggestedSets = t('progress.seriesSuggestedSets')
  const sActualWeight = t('progress.seriesActualWeight')
  const [logs, setLogs] = useState([])
  const [sessions, setSessions] = useState([])
  const [wellbeingLogs, setWellbeingLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)
  const [selectedExercise, setSelectedExercise] = useState('')
  // doc 50: lista COMPLETA de ejercicios entrenados (independiente del período).
  // El selector usa esta lista — antes usaba `exercises` (solo los de la ventana
  // activa), lo que hacía parecer que progreso solo mostraba el plan actual.
  const [allExercises, setAllExercises] = useState([])
  const [activeChart, setActiveChart] = useState('weight')

  // ── ETIQUETAS ────────────────────────────────────────────
  const [exerciseTags, setExerciseTags] = useState([])
  const [tagAssignments, setTagAssignments] = useState([])
  const [selectedTag, setSelectedTag] = useState('') // '' = todas

  useEffect(() => {
    if (profile?.id) fetchData()
  }, [profile, period])

  // doc 50: lista completa de ejercicios entrenados, independiente del período.
  // Alimenta el selector para que NO dependa de la ventana temporal (antes solo
  // mostraba los del último mes → parecía "solo el plan actual"). Corre una vez
  // por alumno.
  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('workout_logs')
        .select(
          'plan:plans!plan_id(plan_type), plan_exercise:plan_exercises!plan_exercise_id(exercise:exercises!exercise_id(id, name, i18n))'
        )
        .eq('student_id', profile.id)
      if (cancelled) return
      const map = {}
      filterTrainingLogs(data || []).forEach((l) => {
        const ex = l.plan_exercise?.exercise
        if (ex) map[ex.id] = exerciseDisplay(ex, i18n.language).name
      })
      const list = Object.entries(map)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      setAllExercises(list)
    })()
    return () => {
      cancelled = true
    }
  }, [profile?.id, i18n.language])

  // Cuando cambia el filtro de etiqueta, resetear el ejercicio seleccionado
  // si ya no pertenece a la nueva selección
  useEffect(() => {
    if (!allExercises.length) return
    const filtered = selectedTag
      ? allExercises.filter((ex) =>
          tagAssignments.some((ta) => ta.exercise_id === ex.id && ta.tag_id === selectedTag)
        )
      : allExercises
    if (filtered.length > 0 && !filtered.some((e) => e.id === selectedExercise)) {
      setSelectedExercise(filtered[0].id)
    }
  }, [selectedTag]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)
    const since = format(subDays(new Date(), period), 'yyyy-MM-dd')

    const [logsRes, sessionsRes, wellbeingRes, tagsRes, tagAssignRes] = await Promise.all([
      // Joineamos plan_type para excluir logs de evaluaciones de los
      // gráficos. Las evaluaciones no son sesiones de entrenamiento
      // y mezclar sus pesos/RPE/volumen distorsiona la progresión.
      supabase
        .from('workout_logs')
        .select(
          `
          *,
          plan:plans!plan_id(plan_type),
          plan_exercise:plan_exercises!plan_exercise_id(
            block_label, section, suggested_sets, suggested_weight,
            weight_mode, unilateral, exercise_mode,
            exercise:exercises!exercise_id(id, name, i18n, default_weight_mode, default_unilateral)
          )
        `
        )
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
      supabase.from('exercise_tags').select('*').order('name'),
      supabase.from('exercise_tag_assignments').select('*'),
    ])

    // Excluir logs de evaluaciones — solo entrenos cuentan para la
    // evolución de pesos/volumen/RPE/etc.
    const logData = filterTrainingLogs(logsRes.data || [])
    setLogs(logData)
    setSessions(sessionsRes.data || [])
    setWellbeingLogs(wellbeingRes.data || [])
    setExerciseTags(tagsRes.data || [])
    setTagAssignments(tagAssignRes.data || [])

    const exMap = {}
    logData.forEach((l) => {
      const ex = l.plan_exercise?.exercise
      if (ex) exMap[ex.id] = exerciseDisplay(ex, i18n.language).name
    })
    const exList = Object.entries(exMap)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    // doc 50: default = ejercicio con MÁS puntos de peso en la ventana, no el
    // primero alfabético. Evita arrancar en uno con un solo registro ("una
    // sola carga"). Fallback al primero si no hay logs con peso.
    if (!selectedExercise && logData.length > 0) {
      const weightCounts = {}
      logData.forEach((l) => {
        const id = l.plan_exercise?.exercise?.id
        if (id && maxWeightOfLog(l) > 0) weightCounts[id] = (weightCounts[id] || 0) + 1
      })
      const best = Object.entries(weightCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      setSelectedExercise(best || exList[0]?.id || '')
    }
    setLoading(false)
  }

  // ── DATOS DERIVADOS POR ETIQUETA ─────────────────────────

  // Ejercicios filtrados por etiqueta (para el selector)
  const exercisesForTag = selectedTag
    ? allExercises.filter((ex) =>
        tagAssignments.some((ta) => ta.exercise_id === ex.id && ta.tag_id === selectedTag)
      )
    : allExercises

  // Logs filtrados por etiqueta (para volumen y PSE)
  const logsForTag = selectedTag
    ? logs.filter((l) => {
        const exId = l.plan_exercise?.exercise?.id
        return (
          exId && tagAssignments.some((ta) => ta.exercise_id === exId && ta.tag_id === selectedTag)
        )
      })
    : logs

  // ── DATOS PARA GRÁFICOS ──────────────────────────────────

  // 1. Peso y reps del ejercicio elegido (2026-10-09): un punto por día con
  // la mejor serie, el promedio por serie y los kilos máximos. Antes el
  // gráfico cambiaba solo de peso a reps y las sesiones sin kilos no se
  // veían. NO se reconstruye carga total con el peso corporal del perfil
  // (decisión 2026-08-28). Ver features/progress/exerciseSeries.js.
  const selectedLogs = logs.filter((l) => l.plan_exercise?.exercise?.id === selectedExercise)
  const repsWeightData = buildRepsWeightSeries(selectedLogs).map((p) => ({
    ...p,
    date: format(parseISO(p.iso), 'dd/MM'),
  }))
  const seriesInfo = describeExerciseSeries(selectedLogs, repsWeightData)
  const chartMetric = seriesInfo.hasKg ? 'weight' : 'reps'

  // Progresión calculada: promedio de la 1ª semana vs la última
  // (ver features/progress/progression.js — misma definición en toda la app).
  // Kilos si el ejercicio tiene kilos; si no, la mejor serie.
  const progression = computeProgression(progressionPoints(repsWeightData, seriesInfo.hasKg))

  // 2. Volumen del ejercicio elegido, solo con kilos reales cargados. Antes
  // sumaba toda la sesión y usaba el peso del perfil en peso corporal.
  const volumeData = buildExerciseVolumeSeries(selectedLogs).map((p) => ({
    date: format(parseISO(p.iso), 'dd/MM'),
    [sVolume]: p.volume,
  }))

  // 3. PSE promedio por sesión (filtrado por etiqueta)
  const pseByDate = {}
  logsForTag.forEach((l) => {
    if (l.perceived_difficulty) {
      const date = format(parseISO(l.logged_date), 'dd/MM')
      if (!pseByDate[date]) pseByDate[date] = []
      pseByDate[date].push(l.perceived_difficulty)
    }
  })
  const pseData = Object.entries(pseByDate).map(([date, values]) => ({
    date,
    [sPseAvg]: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
  }))

  // 4. Intensidad general (borg_value)
  const borgData = sessions
    .filter((s) => s.borg_value !== null && s.borg_value !== undefined)
    .map((s) => ({
      date: format(parseISO(s.logged_date), 'dd/MM'),
      [sIntensity]: Number(s.borg_value),
      label: t(`progress.borgLabels.${Math.round(Number(s.borg_value))}`, {
        defaultValue: BORG_LABELS[Math.round(Number(s.borg_value))] || '',
      }),
    }))

  // 5. Duración de sesiones
  const durationData = sessions
    .filter((s) => s.started_at && s.finished_at)
    .filter((s) => format(new Date(s.started_at), 'yyyy-MM-dd') === s.logged_date)
    .map((s) => {
      const mins = Math.round((new Date(s.finished_at) - new Date(s.started_at)) / 60000)
      return { date: format(parseISO(s.logged_date), 'dd/MM'), [sMinutes]: mins }
    })
    .filter((d) => d[sMinutes] > 0)

  const medianDuration = (() => {
    if (!durationData.length) return null
    const sorted = [...durationData].map((d) => d[sMinutes]).sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  })()

  // 6. Comparación sugerido vs real por ejercicio
  const compareData = logs
    .filter((l) => l.plan_exercise?.exercise?.id === selectedExercise)
    .map((l) => ({
      date: format(parseISO(l.logged_date), 'dd/MM'),
      [sActualSets]: l.actual_sets || 0,
      [sSuggestedSets]: l.plan_exercise?.suggested_sets || 0,
      [sActualWeight]: maxWeightOfLog(l),
    }))

  // 7. Stats resumen
  const sessionDates = new Set(logs.map((l) => l.logged_date))
  const totalSessions = sessionDates.size
  const totalCompleted = logs.filter((l) => l.completed).length
  const avgPSE =
    logs.filter((l) => l.perceived_difficulty).length > 0
      ? Math.round(
          (logs
            .filter((l) => l.perceived_difficulty)
            .reduce((a, l) => a + l.perceived_difficulty, 0) /
            logs.filter((l) => l.perceived_difficulty).length) *
            10
        ) / 10
      : null

  const avgBorg =
    borgData.length > 0
      ? Math.round((borgData.reduce((a, d) => a + d[sIntensity], 0) / borgData.length) * 10) / 10
      : null

  const maxWeight = logs
    .filter((l) => l.plan_exercise?.exercise?.id === selectedExercise)
    .reduce((max, l) => Math.max(max, maxWeightOfLog(l)), 0)
  const maxReps = logs
    .filter((l) => l.plan_exercise?.exercise?.id === selectedExercise)
    .reduce((max, l) => Math.max(max, repsMaxOfLog(l)), 0)

  const CHARTS = [
    { id: 'weight', label: t('progress.chartWeight') },
    { id: 'volume', label: t('progress.chartVolume') },
    { id: 'pse', label: t('progress.chartPse') },
    { id: 'borg', label: t('progress.chartIntensity') },
    { id: 'duration', label: t('progress.chartDuration') },
    { id: 'compare', label: t('progress.chartCompare') },
  ]

  // Etiquetas que tienen ejercicios presentes en los logs del período
  const tagsInLogs = exerciseTags.filter((tag) =>
    logs.some((l) => {
      const exId = l.plan_exercise?.exercise?.id
      return exId && tagAssignments.some((ta) => ta.exercise_id === exId && ta.tag_id === tag.id)
    })
  )

  return (
    <div className="max-w-lg mx-auto">
      {/* Encabezado durazno (identidad visual) */}
      <div className="hero px-5 pt-3 pb-6">
        <h1 className="text-[28px] leading-tight font-bold text-tinta">{t('progress.title')}</h1>
        <div className="flex gap-2 mt-3 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              className={`chip ${period === p.days ? 'chip-on' : ''}`}
            >
              {p.labelKey ? t(p.labelKey) : p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-1 pb-4 space-y-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">{t('progress.noDataTitle')}</p>
            <p className="text-gray-400 text-sm mt-1">{t('progress.noDataBody')}</p>
          </div>
        ) : (
          <>
            {/* Stats resumen: recuadros de datos */}
            <div className="grid grid-cols-3 gap-2">
              <div className="stat">
                <span className="stat-value">{totalSessions}</span>
                <span className="stat-label">{t('progress.sessions')}</span>
              </div>
              <div className="stat">
                <span className="stat-value">{totalCompleted}</span>
                <span className="stat-label">{t('progress.exercises')}</span>
              </div>
              <div className="stat">
                <span className="stat-value">{avgPSE ?? '—'}</span>
                <span className="stat-label">{t('progress.avgPseShort')}</span>
              </div>
            </div>

            {avgBorg !== null && (
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {t('progress.avgBorgTitle')}
                    </p>
                    <p className="text-xs text-gray-500">{t('progress.borgScaleSubtitle')}</p>
                  </div>
                  <span
                    className={`text-2xl font-bold px-3 py-1 rounded-xl ${borgColor(Math.round(avgBorg))}`}
                  >
                    {avgBorg}
                  </span>
                </div>
              </Card>
            )}

            {chartMetric === 'weight' && maxWeight > 0 && (
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {t('progress.maxWeightTitle')}
                    </p>
                    {allExercises.find((e) => e.id === selectedExercise) && (
                      <p className="text-xs text-gray-500">
                        {allExercises.find((e) => e.id === selectedExercise)?.name}
                      </p>
                    )}
                  </div>
                  <span className="text-2xl font-bold text-primary-600">{maxWeight}kg</span>
                </div>
              </Card>
            )}

            {chartMetric === 'reps' && maxReps > 0 && (
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {t('progress.maxRepsTitle')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {allExercises.find((e) => e.id === selectedExercise)?.name} ·{' '}
                      {t('progress.maxRepsSubtitle')}
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-primary-600">{maxReps}</span>
                </div>
              </Card>
            )}

            {/* ── Filtro por etiqueta ───────────────────────────── */}
            {tagsInLogs.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                  <Tag className="w-3.5 h-3.5" />
                  {t('progress.filterByTag')}
                </div>
                <div className="overflow-x-auto -mx-4 px-4">
                  <div className="flex gap-2 w-max pb-0.5">
                    <button
                      onClick={() => setSelectedTag('')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        selectedTag === ''
                          ? 'bg-durazno-50 text-primary-700 border-durazno-200'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {t('progress.allTags')}
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
            <div className="overflow-x-auto -mx-4 px-4">
              <div className="flex gap-2 w-max min-w-full pb-0.5">
                {CHARTS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveChart(c.id)}
                    className={`chip whitespace-nowrap ${activeChart === c.id ? 'chip-on' : ''}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Gráfico: Peso y reps (2026-10-09) ─────────────── */}
            {activeChart === 'weight' && (
              <Card>
                <ChartHeader
                  as="h3"
                  titleClassName="font-semibold text-gray-900"
                  title={t('progress.repsWeightTitle')}
                  subtitle={[
                    seriesInfo.hasKg
                      ? t('progress.repsWeightSubtitleKg')
                      : t('progress.repsWeightSubtitleBw'),
                    seriesInfo.unit !== 'reps'
                      ? t('progress.unitNote', {
                          unit: t(`workout.repsUnitShort.${seriesInfo.unit}`, {
                            defaultValue: seriesInfo.unit,
                          }),
                        })
                      : null,
                    seriesInfo.unilateral ? t('progress.perSideNote') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  info={t('progress.info.repsWeight')}
                  right={
                    progression && (
                      <div className="flex flex-col items-end flex-shrink-0">
                        <span
                          className={`text-lg font-bold ${
                            progression.pct > 0
                              ? 'text-green-600'
                              : progression.pct < 0
                                ? 'text-red-500'
                                : 'text-gray-500'
                          }`}
                        >
                          {progression.pct > 0 ? '+' : ''}
                          {progression.pct}%
                        </span>
                        <span className="text-[10px] text-gray-400 text-right leading-tight">
                          {seriesInfo.hasKg
                            ? t('progress.progressionOfKg')
                            : t('progress.progressionOfBest')}{' '}
                          ·{' '}
                          {t(
                            progression.basis === 'weeks'
                              ? 'progress.progressionBasisWeeks'
                              : 'progress.progressionBasisPoints',
                            { from: progression.firstAvg, to: progression.lastAvg }
                          )}
                        </span>
                      </div>
                    )
                  }
                />
                {repsWeightData.length > 0 ? (
                  <RepsWeightChart
                    data={repsWeightData}
                    hasKg={seriesInfo.hasKg}
                    unit={seriesInfo.unit}
                    unilateral={seriesInfo.unilateral}
                  />
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">
                    {seriesInfo.timeOnly
                      ? t('progress.timeNoData')
                      : t('progress.noWeightOrRepsData')}
                  </p>
                )}
                {/* doc 50: aviso para ampliar el período cuando hay 0-1 puntos */}
                {repsWeightData.length <= 1 && !seriesInfo.timeOnly && period < 365 && (
                  <p className="text-xs text-amber-600 mt-2 text-center">
                    {t('progress.widenPeriodHint')}
                  </p>
                )}
              </Card>
            )}

            {/* ── Gráfico: Sugerido vs Real ─────────────────────── */}
            {activeChart === 'compare' && (
              <Card>
                <ChartHeader
                  as="h3"
                  titleClassName="font-semibold text-gray-900"
                  title={t('progress.chartCompare')}
                  subtitle={t('progress.compareSubtitle')}
                  info={t('progress.info.compare')}
                />
                {compareData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={compareData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-gray-200))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey={sSuggestedSets}
                        fill="rgb(var(--c-primary-100))"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey={sActualSets}
                        fill="rgb(var(--c-primary-600))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">
                    {t('progress.noDataForExercise')}
                  </p>
                )}
              </Card>
            )}

            {/* ── Gráfico: Volumen del ejercicio (2026-10-09) ───── */}
            {activeChart === 'volume' && (
              <Card>
                <ChartHeader
                  as="h3"
                  titleClassName="font-semibold text-gray-900"
                  title={t('progress.volumeTitle')}
                  subtitle={t('progress.volumeSubtitle')}
                  info={t('progress.info.volume')}
                />
                {volumeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-gray-200))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey={sVolume}
                        fill="rgb(var(--c-primary-600))"
                        radius={[4, 4, 0, 0]}
                        unit=" kg"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">
                    {repsWeightData.length > 0 && !seriesInfo.hasKg
                      ? t('progress.volumeNoKg')
                      : t('progress.noVolumeDataPeriod')}
                  </p>
                )}
              </Card>
            )}

            {/* ── Gráfico: PSE ─────────────────────────────────── */}
            {activeChart === 'pse' && (
              <Card>
                <ChartHeader
                  as="h3"
                  titleClassName="font-semibold text-gray-900"
                  title={t('workout.perceivedEffortPSE')}
                  subtitle={
                    selectedTag
                      ? t('progress.pseTagSubtitle', {
                          name: tagsInLogs.find((tg) => tg.id === selectedTag)?.name,
                        })
                      : t('progress.pseSubtitle')
                  }
                  info={t('progress.info.pse')}
                />
                {pseData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={pseData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-gray-200))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey={sPseAvg}
                        stroke="rgb(var(--c-gray-500))"
                        strokeWidth={2}
                        dot={{ fill: 'rgb(var(--c-gray-500))', r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">
                    {t('progress.noPseDataPeriod')}
                  </p>
                )}
              </Card>
            )}

            {/* ── Gráfico: Intensidad Borg ──────────────────────── */}
            {activeChart === 'borg' && borgData.length > 0 && (
              <Card>
                <ChartHeader
                  as="h3"
                  titleClassName="font-semibold text-gray-900"
                  title={t('progress.borgTitle')}
                  subtitle={t('progress.borgSubtitle')}
                  info={t('progress.info.borg')}
                />
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={borgData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-gray-200))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey={sIntensity} radius={[4, 4, 0, 0]}>
                      {borgData.map((entry, i) => (
                        <rect
                          key={i}
                          fill={
                            entry[sIntensity] >= 8
                              ? 'rgb(var(--c-red-200))'
                              : entry[sIntensity] >= 6
                                ? 'rgb(var(--c-primary-300))'
                                : entry[sIntensity] >= 4
                                  ? 'rgb(var(--c-amber-200))'
                                  : 'rgb(var(--c-green-200))'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* ── Gráfico: Duración ────────────────────────────── */}
            {activeChart === 'duration' && (
              <Card>
                <ChartHeader
                  as="h3"
                  titleClassName="font-semibold text-gray-900"
                  title={t('progress.durationTitle')}
                  subtitle={t('progress.durationSubtitle')}
                  info={t('progress.info.duration')}
                  right={
                    medianDuration !== null && (
                      <div className="flex flex-col items-end">
                        <span className="text-2xl font-bold text-primary-600">
                          {medianDuration}
                        </span>
                        <span className="text-xs text-gray-400">{t('progress.medianMin')}</span>
                      </div>
                    )
                  }
                />
                {durationData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={durationData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-gray-200))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="min" />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey={sMinutes}
                        fill="rgb(var(--c-primary-300))"
                        radius={[4, 4, 0, 0]}
                        unit="min"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">
                    {t('progress.noDurationData')}
                  </p>
                )}
              </Card>
            )}

            {/* Heatmap de asistencia */}
            <Card>
              <div>
                <h3 className="font-semibold text-gray-900">{t('progress.attendanceTitle')}</h3>
                <p className="text-xs text-gray-500">{t('progress.attendanceSubtitle')}</p>
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
              <h2 className="text-base font-bold text-gray-900">{t('progress.wellbeingTitle')}</h2>
              <span className="text-xs text-gray-400 ml-1">
                {t('progress.logsCount', { count: wellbeingLogs.length })}
              </span>
            </div>

            {/* Promedios en grilla 2×3 */}
            <div className="grid grid-cols-2 gap-2">
              {WELLBEING_METRICS.map(({ key, labelKey, emoji, positive }) => {
                const vals = wellbeingLogs.map((l) => l[key]).filter((v) => v != null)
                const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
                const colorClass = avg
                  ? wellbeingColor(Math.round(avg), positive)
                  : 'bg-gray-100 text-gray-400'
                return (
                  <div key={key} className="card p-3 flex items-center gap-3">
                    <span className="text-xl">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 leading-tight break-words">
                        {t(labelKey)}
                      </p>
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
                <h3 className="font-semibold text-gray-900">
                  {t('progress.wellbeingEvolutionTitle')}
                </h3>
                <p className="text-xs text-gray-500">{t('progress.scale1to10')}</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={wellbeingLogs.map((l) => ({
                    date: format(parseISO(l.date), t('dates.dayMonthShort'), {
                      locale: dateLocale(),
                    }),
                    ...WELLBEING_METRICS.reduce((acc, { key }) => ({ ...acc, [key]: l[key] }), {}),
                  }))}
                  margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-gray-200))" />
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
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: e.color }}
                              />
                              <span className="text-gray-600">{e.name}:</span>
                              <span className="font-bold">{e.value}</span>
                            </div>
                          ))}
                        </div>
                      )
                    }}
                  />
                  {WELLBEING_METRICS.map(({ key, labelKey }) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={t(labelKey)}
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
