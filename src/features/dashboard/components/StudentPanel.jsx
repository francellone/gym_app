import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  ChevronRight,
  FileBarChart,
  TrendingUp,
  Activity,
  Target,
  Zap,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { computeDayTallies } from '@/features/students/dayTalliesLogic'
import DayTalliesBadge from '@/features/students/components/DayTalliesBadge'
import {
  computeDonutData,
  computeAveragePSE,
  computeClosedWeeksAdherence,
  computeAdherencePct,
  buildMotivationalMessage,
  computeExerciseProgress,
} from '../studentPanelLogic'
import { findPeriodLabel } from '../dashboardPeriods'
import WellbeingSummaryBlock from '@/features/wellbeing/components/WellbeingSummaryBlock'
import { computeWellbeingSummary, formatYMD } from '@/features/wellbeing/wellbeingSummaryLogic'
import { ALERT_THRESHOLDS } from '../alerts'

// ============================================================
// StudentPanel
// ------------------------------------------------------------
// Fase C.2 del CoachDashboard expandido (doc 19).
//
// Bloque grande que se renderiza SOLO cuando hay un alumno
// seleccionado en los filtros del dashboard. Muestra, para el
// período seleccionado:
//
//   - Header: nombre del alumno + plan + período
//   - 4 KPIs: esperados, completados, % adherencia, PSE promedio
//   - Donut: días entrenados por section (Día A/B/C/D)
//   - Tildes detalladas (DayTalliesBadge)
//   - Banner motivacional según adherencia
//
// Self-contained: hace su propio fetch de plan_exercises +
// workout_logs en la ventana. El consumidor solo pasa filtros y
// el componente decide cuándo renderizar.
//
// Props:
//   studentId         uuid del alumno (si null, no renderiza nada)
//   assignment        plan_assignment elegido (con plan + schedule_mode).
//                     Si hay filterPlanId set, usar ese. Si no, el
//                     activeTrainingAssignment del alumno.
//   periodRange       { start, end } YMD
//   periodKey         string (para mostrar label legible)
//   studentName       opcional, fallback a "alumno"
// ============================================================

export default function StudentPanel({
  studentId,
  assignment,
  periodRange,
  periodKey,
  studentName,
}) {
  const [planExercises, setPlanExercises] = useState([])
  const [planBlocks, setPlanBlocks] = useState([])
  const [logs, setLogs] = useState([])
  const [blockLogs, setBlockLogs] = useState([])
  // Adherencia (semanas cerradas TOTALES): fechas entrenadas de TODOS
  // los planes de training del alumno + sessions_per_week objetivo.
  const [allTrainingDates, setAllTrainingDates] = useState([])
  const [sessionsPerWeek, setSessionsPerWeek] = useState(null)
  const [loading, setLoading] = useState(false)
  // Wellbeing (2026-08-27): fetch propio, independiente del plan — un alumno
  // sin plan activo igual puede tener wellbeing cargado.
  const [wellbeingLogs, setWellbeingLogs] = useState([])
  const [wellbeingLoading, setWellbeingLoading] = useState(false)

  const planId = assignment?.plan_id || null
  const periodStart = periodRange?.start || null
  const periodEnd = periodRange?.end || null

  useEffect(() => {
    if (!studentId || !planId || !periodStart || !periodEnd) {
      setPlanExercises([])
      setPlanBlocks([])
      setLogs([])
      setBlockLogs([])
      setAllTrainingDates([])
      setSessionsPerWeek(null)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        // v29 (plan 29): además de plan_exercises + workout_logs, traemos
        // plan_blocks (para saber el block_type de cada PE) y
        // workout_block_logs (para que circuit/aerobic cuenten en el tally).
        // Adherencia por semanas cerradas TOTALES (Franco 16/06): además
        // traemos los logs de training de TODOS los planes del alumno en
        // el período (allLogsRes, sin filtrar por plan_id) + el
        // sessions_per_week del plan seleccionado como objetivo semanal.
        const [exercisesRes, blocksRes, logsRes, blockLogsRes, allLogsRes, planRes] =
          await Promise.all([
            supabase.from('plan_exercises').select('id, section, block_id').eq('plan_id', planId),
            supabase.from('plan_blocks').select('id, section, block_type').eq('plan_id', planId),
            supabase
              .from('workout_logs')
              .select(
                `logged_date, plan_exercise_id, completed, perceived_difficulty, actual_weight,
                 plan_exercise:plan_exercises!plan_exercise_id(
                   exercise:exercises!exercise_id(id, name)
                 )`
              )
              .eq('student_id', studentId)
              .eq('plan_id', planId)
              .gte('logged_date', periodStart)
              .lte('logged_date', periodEnd),
            supabase
              .from('workout_block_logs')
              .select('logged_date, plan_block_id, completed')
              .eq('student_id', studentId)
              .eq('plan_id', planId)
              .gte('logged_date', periodStart)
              .lte('logged_date', periodEnd),
            supabase
              .from('workout_logs')
              .select('logged_date, plans!inner(plan_type)')
              .eq('student_id', studentId)
              .eq('plans.plan_type', 'training')
              .gte('logged_date', periodStart)
              .lte('logged_date', periodEnd),
            supabase.from('plans').select('sessions_per_week').eq('id', planId).maybeSingle(),
          ])
        if (cancelled) return
        setPlanExercises(exercisesRes.data || [])
        setPlanBlocks(blocksRes.data || [])
        setLogs(logsRes.data || [])
        setBlockLogs(blockLogsRes.data || [])
        const dates = Array.from(
          new Set((allLogsRes.data || []).map((r) => String(r.logged_date).slice(0, 10)))
        )
        setAllTrainingDates(dates)
        setSessionsPerWeek(Number(planRes.data?.sessions_per_week) || null)
      } catch (err) {
        console.error('[StudentPanel] fetch', err)
        if (!cancelled) {
          setPlanExercises([])
          setPlanBlocks([])
          setLogs([])
          setBlockLogs([])
          setAllTrainingDates([])
          setSessionsPerWeek(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [studentId, planId, periodStart, periodEnd])

  // ── Wellbeing del período ────────────────────────────────
  // Traemos desde el inicio del período O desde WELLBEING_WINDOW_DAYS antes
  // del cierre (lo que sea más viejo): los promedios usan el período, pero el
  // semáforo necesita siempre la ventana completa de 14 días.
  useEffect(() => {
    if (!studentId || !periodStart || !periodEnd) {
      setWellbeingLogs([])
      return
    }
    let cancelled = false
    async function loadWellbeing() {
      setWellbeingLoading(true)
      try {
        const endDate = new Date(`${periodEnd}T00:00:00`)
        const windowStart = new Date(endDate)
        windowStart.setDate(windowStart.getDate() - ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS)
        const fetchFrom =
          periodStart < formatYMD(windowStart) ? periodStart : formatYMD(windowStart)
        const { data, error } = await supabase
          .from('wellbeing_logs')
          .select(
            'user_id, date, sleep_quality, nutrition_quality, hydration_quality, energy_level, stress_level, muscle_fatigue, notes, source'
          )
          .eq('user_id', studentId)
          .gte('date', fetchFrom)
          .lte('date', periodEnd)
          .order('date', { ascending: true })
        if (cancelled) return
        if (error) throw error
        setWellbeingLogs(data || [])
      } catch (err) {
        console.error('[StudentPanel] wellbeing', err)
        if (!cancelled) setWellbeingLogs([])
      } finally {
        if (!cancelled) setWellbeingLoading(false)
      }
    }
    loadWellbeing()
    return () => {
      cancelled = true
    }
  }, [studentId, periodStart, periodEnd])

  // ── Cálculos derivados ───────────────────────────────────
  const donutData = useMemo(() => computeDonutData({ logs, planExercises }), [logs, planExercises])

  const pseAvg = useMemo(() => computeAveragePSE(logs), [logs])
  const tallies = useMemo(
    () => computeDayTallies({ logs, planExercises, blockLogs, planBlocks }),
    [logs, planExercises, blockLogs, planBlocks]
  )

  // Adherencia por SEMANAS CERRADAS totales (Franco 16/06): cuenta los
  // entrenamientos de todos los planes en el período, sobre semanas
  // lun-dom ya terminadas. Excluye la semana en curso.
  const adherence = useMemo(
    () =>
      computeClosedWeeksAdherence({
        trainingDates: allTrainingDates,
        target: sessionsPerWeek,
        periodStart,
        periodEnd,
        // En "Histórico completo" el inicio (2000-01-01) es ficticio: la
        // adherencia arranca en el primer entrenamiento real del alumno.
        clampStartToFirstTraining: periodKey === 'all',
      }),
    [allTrainingDates, sessionsPerWeek, periodStart, periodEnd, periodKey]
  )
  const completedDays = adherence.completedDays
  const expectedDays = adherence.expectedDays

  const adherencePct = computeAdherencePct({ completedDays, expectedDays })
  const motivation =
    adherence.weeks === 0
      ? { tone: 'empty', text: 'Todavía no hay semanas cerradas completas en este período.' }
      : buildMotivationalMessage({ completedDays, expectedDays })

  const exerciseProgress = useMemo(
    () => computeExerciseProgress({ logs, periodRange }),
    [logs, periodRange]
  )

  const wellbeingSummary = useMemo(
    () => computeWellbeingSummary({ logs: wellbeingLogs, from: periodStart, to: periodEnd }),
    [wellbeingLogs, periodStart, periodEnd]
  )

  // ── Early returns ────────────────────────────────────────
  if (!studentId) return null
  if (!assignment) {
    return (
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-gray-500">
            {studentName || 'El alumno'} no tiene plan de entrenamiento activo en este período.
          </p>
          <Link
            to={`/coach/students/${studentId}/informe`}
            className="text-xs text-primary-600 font-medium inline-flex items-center gap-1 hover:underline flex-shrink-0"
          >
            <FileBarChart size={14} /> Informe
          </Link>
        </div>
        {/* El wellbeing no depende del plan: se muestra igual. */}
        <WellbeingSummaryBlock
          summary={wellbeingSummary}
          loading={wellbeingLoading}
          studentId={studentId}
          periodLabel={findPeriodLabel(periodKey)}
        />
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      {/* Header del panel */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 truncate">{studentName || 'Alumno'}</h3>
          <p className="text-xs text-gray-500 truncate">
            {assignment.plan?.title || 'Plan activo'} · {findPeriodLabel(periodKey)}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link
            to={`/coach/students/${studentId}/informe`}
            className="text-xs text-primary-600 font-medium inline-flex items-center gap-1 hover:underline"
          >
            <FileBarChart size={14} /> Informe
          </Link>
          <Link
            to={`/coach/students/${studentId}`}
            className="text-xs text-primary-600 font-medium inline-flex items-center gap-1 hover:underline"
          >
            Ver alumno <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 italic">Cargando datos del alumno…</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiTile
              icon={<Target size={16} />}
              label="Esperados"
              value={expectedDays || '—'}
              tone="gray"
            />
            <KpiTile
              icon={<Activity size={16} />}
              label="Completados"
              value={completedDays}
              tone="green"
            />
            <KpiTile
              icon={<TrendingUp size={16} />}
              label="Adherencia"
              value={adherencePct !== null ? `${adherencePct}%` : '—'}
              tone={adherenceTone(adherencePct)}
            />
            <KpiTile
              icon={<Zap size={16} />}
              label="PSE prom."
              value={pseAvg !== null ? pseAvg : '—'}
              tone="purple"
            />
          </div>

          {/* Donut + Tildes side-by-side en sm+, stacked en mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Sesiones por día
              </h4>
              {donutData.length > 0 ? (
                <div className="flex items-center gap-3">
                  <div className="w-32 h-32 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          innerRadius={32}
                          outerRadius={52}
                          paddingAngle={2}
                          stroke="#fff"
                        >
                          {donutData.map((entry) => (
                            <Cell key={entry.key} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name, props) => [
                            `${value} día${value === 1 ? '' : 's'}`,
                            props?.payload?.label || '',
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="text-xs space-y-1">
                    {donutData.map((entry) => (
                      <li key={entry.key} className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-gray-700">{entry.label}</span>
                        <span className="text-gray-400">×{entry.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Sin sesiones en este período</p>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Tildes por día
              </h4>
              <DayTalliesBadge tallies={tallies} showLegend />
            </div>
          </div>

          {/* Banner motivacional */}
          <div
            className={`mt-2 rounded-xl px-3 py-2 text-sm ${motivationToneClass(motivation.tone)}`}
          >
            {motivation.text}
          </div>

          {/* Wellbeing del período (2026-08-27) */}
          <WellbeingSummaryBlock
            summary={wellbeingSummary}
            loading={wellbeingLoading}
            studentId={studentId}
            periodLabel={findPeriodLabel(periodKey)}
          />

          {/* Progreso por ejercicio (Fase C — refinamiento 2026-05-23 noche)
              Solo si hay logs con actual_weight en el período. */}
          {exerciseProgress.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Progreso por ejercicio
              </h4>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="py-1.5 px-2 font-medium">Ejercicio</th>
                      <th className="py-1.5 px-2 font-medium text-right">Antes</th>
                      <th className="py-1.5 px-2 font-medium text-right">Ahora</th>
                      <th className="py-1.5 px-2 font-medium text-right">Δ</th>
                      <th className="py-1.5 px-2 font-medium text-right">Logs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exerciseProgress.map((ex) => (
                      <tr key={ex.exerciseId} className="border-b border-gray-50">
                        <td className="py-1.5 px-2 text-gray-800 truncate max-w-[180px]">
                          {ex.exerciseName}
                        </td>
                        <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">
                          {ex.firstMax !== null ? `${ex.firstMax} kg` : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">
                          {ex.secondMax !== null ? `${ex.secondMax} kg` : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <ProgressBadge status={ex.status} delta={ex.delta} />
                        </td>
                        <td className="py-1.5 px-2 text-right text-gray-400 tabular-nums">
                          {ex.logsCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Compara max(peso) primera mitad vs segunda mitad del período seleccionado.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================
// ProgressBadge — chip con icono + delta por ejercicio
// ============================================================
function ProgressBadge({ status, delta }) {
  if (status === 'insufficient') {
    return <span className="text-gray-400">—</span>
  }
  if (status === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 text-gray-500">
        <Minus size={12} /> 0
      </span>
    )
  }
  if (status === 'up') {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 font-semibold tabular-nums">
        <ArrowUp size={12} /> +{delta} kg
      </span>
    )
  }
  // down
  return (
    <span className="inline-flex items-center gap-1 text-red-600 font-semibold tabular-nums">
      <ArrowDown size={12} /> {delta} kg
    </span>
  )
}

// ============================================================
// KpiTile — pill chico con icono + label + valor
// ============================================================
function KpiTile({ icon, label, value, tone = 'gray' }) {
  const toneClasses = {
    gray: 'bg-gray-50 text-gray-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
  }
  return (
    <div className={`rounded-xl px-3 py-2 ${toneClasses[tone] || toneClasses.gray}`}>
      <div className="flex items-center justify-between mb-1 opacity-80">{icon}</div>
      <p className="text-lg font-bold leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wide mt-1 opacity-80">{label}</p>
    </div>
  )
}

function adherenceTone(pct) {
  if (pct === null || pct === undefined) return 'gray'
  if (pct >= 90) return 'green'
  if (pct >= 60) return 'green'
  if (pct >= 30) return 'amber'
  return 'red'
}

function motivationToneClass(tone) {
  switch (tone) {
    case 'great':
      return 'bg-green-50 text-green-800 border border-green-200'
    case 'good':
      return 'bg-blue-50 text-blue-800 border border-blue-200'
    case 'meh':
      return 'bg-amber-50 text-amber-800 border border-amber-200'
    case 'bad':
      return 'bg-red-50 text-red-800 border border-red-200'
    case 'empty':
    default:
      return 'bg-gray-50 text-gray-600 border border-gray-200'
  }
}
