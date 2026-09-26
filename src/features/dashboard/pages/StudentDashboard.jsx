import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { format, subDays, eachDayOfInterval, isToday } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '@/i18n/dateLocale'
import {
  Check,
  TrendingUp,
  Calendar,
  ChevronRight,
  ChevronDown,
  Flame,
  Snowflake,
  BarChart2,
  Info,
} from 'lucide-react'
import { evalTypeIcon, evalTypeLabel } from '@/features/evaluations/helpers'
import { filterTrainingLogs, computeWeekTrainingDays } from '@/features/students/dashboardLogic'
import { useCelebrations } from '@/features/milestones/celebrationContextValue'
import { computeDayTallies } from '@/features/students/dayTalliesLogic'
import DayTalliesBadge from '@/features/students/components/DayTalliesBadge'

export default function StudentDashboard() {
  const { profile } = useAuth()
  const { t } = useTranslation()
  const [assignments, setAssignments] = useState([])
  const [weekLogs, setWeekLogs] = useState([])
  // Etapa 5 celebraciones (decisión Franco 2026-09-25): la racha del Inicio
  // pasa a ser SEMANAL (semanas completas seguidas, con comodín). Reemplaza
  // la de "días seguidos", que se cortaba con cada día de descanso. La
  // calcula el CelebrationProvider al abrir la app.
  const { streak: streakState } = useCelebrations()
  const streak = streakState?.streak || 0
  const [, setLoading] = useState(true)
  // Q2 — tallies por día (Día A ✓✓◐) para el plan activo.
  // Se carga aparte porque necesita la ventana completa del plan,
  // no la semana del heatmap.
  const [dayTallies, setDayTallies] = useState({})
  // Descripción del plan activo (texto libre del coach) — colapsable.
  const [showPlanDesc, setShowPlanDesc] = useState(false)

  useEffect(() => {
    if (profile?.id) fetchData()
  }, [profile])

  async function fetchData() {
    try {
      const weekAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd')
      const today = format(new Date(), 'yyyy-MM-dd')

      // Los formularios pendientes ya no se piden acá: el cartel vive en
      // StudentLayout (PendingFormsBanner) para que se vea en todas las
      // pantallas del alumno, no solo en el Inicio.
      const [assignmentsRes, logsRes] = await Promise.all([
        supabase
          .from('plan_assignments')
          .select('*, plan:plans!plan_id(*)')
          .eq('student_id', profile.id)
          .eq('active', true)
          .order('created_at', { ascending: false }),
        // Joineamos plan_type para poder excluir logs de evaluaciones.
        // Sin este filtro, el streak y la heatmap "Esta semana" cuentan
        // sesiones de evaluaciones (legacy o futuras) como entrenos
        // reales — bug detectado el 2026-05-10.
        supabase
          .from('workout_logs')
          .select('logged_date, completed, plan:plans!plan_id(plan_type)')
          .eq('student_id', profile.id)
          .gte('logged_date', weekAgo)
          .lte('logged_date', today),
      ])

      setAssignments(assignmentsRes.data || [])

      // Filtramos a logs de planes training (cualquier status: active,
      // replaced, paused...). Las evaluaciones quedan afuera. Detalle
      // de la regla en src/utils/studentDashboardLogic.js.
      const trainingLogs = filterTrainingLogs(logsRes.data || [])
      setWeekLogs(trainingLogs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const last7Days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() })
  // weekLogs ya viene filtrado a training (evaluaciones fuera).
  const trainingDays = computeWeekTrainingDays(weekLogs)

  const trainingPlans = assignments.filter(
    (a) => !a.plan?.plan_type || a.plan?.plan_type === 'training'
  )
  const evalPlans = assignments.filter((a) => a.plan?.plan_type === 'evaluation')
  const activePlan = trainingPlans[0]

  // Q2 — fetch tallies del plan activo (todos los logs desde start_date).
  // Separado del fetch principal porque depende de activePlan ya
  // determinado y porque la ventana es más larga que la del heatmap.
  useEffect(() => {
    if (!profile?.id || !activePlan?.plan_id) {
      setDayTallies({})
      return
    }
    let cancelled = false
    async function loadTallies() {
      try {
        // v29 (plan 29): traemos también plan_blocks + workout_block_logs
        // para que los bloques aerobic/circuit cuenten como ítems del día.
        const [exercisesRes, blocksRes, logsRes, blockLogsRes] = await Promise.all([
          supabase
            .from('plan_exercises')
            .select('id, section, block_id')
            .eq('plan_id', activePlan.plan_id),
          supabase
            .from('plan_blocks')
            .select('id, section, block_type')
            .eq('plan_id', activePlan.plan_id),
          supabase
            .from('workout_logs')
            .select('logged_date, plan_exercise_id, completed')
            .eq('student_id', profile.id)
            .eq('plan_id', activePlan.plan_id)
            .gte('logged_date', activePlan.start_date || '2000-01-01'),
          supabase
            .from('workout_block_logs')
            .select('logged_date, plan_block_id, completed')
            .eq('student_id', profile.id)
            .eq('plan_id', activePlan.plan_id)
            .gte('logged_date', activePlan.start_date || '2000-01-01'),
        ])
        if (cancelled) return
        const tallies = computeDayTallies({
          logs: logsRes.data || [],
          planExercises: exercisesRes.data || [],
          blockLogs: blockLogsRes.data || [],
          planBlocks: blocksRes.data || [],
        })
        setDayTallies(tallies)
      } catch (err) {
        console.error('[StudentDashboard] computeDayTallies fetch', err)
        if (!cancelled) setDayTallies({})
      }
    }
    loadTallies()
    return () => {
      cancelled = true
    }
  }, [profile?.id, activePlan?.plan_id, activePlan?.start_date])

  const hora = new Date().getHours()
  const saludo =
    hora < 12
      ? t('dashboard.greetingMorning')
      : hora < 19
        ? t('dashboard.greetingAfternoon')
        : t('dashboard.greetingEvening')

  return (
    <div className="max-w-lg mx-auto">
      {/* Encabezado durazno (identidad visual, docs/identidad-visual.md) */}
      <div className="hero px-5 pt-3 pb-8">
        <p className="eyebrow">
          {format(new Date(), t('dates.fullDate'), { locale: dateLocale() })}
        </p>
        <h1 className="text-[28px] leading-tight font-bold text-tinta mt-1 [text-wrap:balance]">
          {saludo}, {profile?.name?.split(' ')[0]}
        </h1>

        {streak > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-white/80 rounded-full px-3 py-1 text-sm font-bold text-primary-700">
              <Flame size={16} aria-hidden="true" />
              {t('dashboard.weekStreak', { count: streak })}
            </span>
            {streakState?.freezes > 0 && (
              <span
                className="inline-flex items-center gap-1.5 bg-white/60 rounded-full px-3 py-1 text-sm font-medium text-texto2"
                title={t('dashboard.freezeSaved')}
              >
                <Snowflake size={14} aria-hidden="true" />
                {t('dashboard.freezeSaved')}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-4 -mt-4 pb-6 space-y-3.5">
        {/* Esta semana: tilde verde = entrenó, anillo naranja = hoy */}
        <div className="card">
          <h3 className="text-sm font-bold text-tinta mb-3">{t('dashboard.thisWeek')}</h3>
          <div className="flex gap-1.5 justify-between">
            {last7Days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const trained = trainingDays.has(dateStr)
              const today = isToday(day)
              return (
                <div key={dateStr} className="flex-1 flex flex-col items-center gap-1.5">
                  <span
                    className={`text-[11px] font-medium ${today ? 'text-primary-700' : 'text-texto3'}`}
                  >
                    {format(day, 'EEEEE', { locale: dateLocale() })}
                  </span>
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium tabular-nums transition-colors ${
                      trained
                        ? 'bg-[#16a34a] text-white'
                        : today
                          ? 'bg-durazno-50 text-primary-700 border-2 border-primary-600'
                          : 'border-2 border-gray-200 text-texto3'
                    }`}
                  >
                    {trained ? (
                      <Check size={16} strokeWidth={3} aria-hidden="true" />
                    ) : (
                      format(day, 'd')
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Q2 — Tildes por día del plan activo */}
          {activePlan && (
            <div className="mt-4 pt-4 border-t border-linea">
              <h4 className="eyebrow mb-2">{t('dashboard.dayTalliesTitle')}</h4>
              <DayTalliesBadge tallies={dayTallies} showLegend />
            </div>
          )}
        </div>

        {/* Entrenamiento de hoy */}
        <div className="card p-5">
          <p className="eyebrow">{t('dashboard.todayWorkout')}</p>
          <p className="text-[21px] font-bold text-tinta leading-snug mt-1 break-words">
            {activePlan?.plan?.title || t('workout.noPlanTitle')}
          </p>
          <Link
            to="/student/workout"
            className="btn-primary w-full mt-4 flex items-center justify-center gap-2 text-base"
          >
            {t('dashboard.seeYourRoutine')}
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>

        {/* Descripción del plan activo — colapsable. Solo si el coach cargó texto. */}
        {activePlan?.plan?.description?.trim() && (
          <div className="card">
            <button
              type="button"
              onClick={() => setShowPlanDesc((v) => !v)}
              aria-expanded={showPlanDesc}
              className="flex items-center gap-1.5 w-full text-left text-sm font-medium text-tinta"
            >
              <Info size={15} className="flex-shrink-0 text-primary-600" />
              <span className="flex-1">{t('dashboard.planDescriptionToggle')}</span>
              <ChevronDown
                size={16}
                className={`flex-shrink-0 text-texto3 transition-transform ${showPlanDesc ? 'rotate-180' : ''}`}
              />
            </button>
            {showPlanDesc && (
              <p className="text-sm text-texto2 mt-2 leading-relaxed whitespace-pre-line">
                {activePlan.plan.description}
              </p>
            )}
          </div>
        )}

        {/* Evaluaciones */}
        {evalPlans.length > 0 && (
          <div className="space-y-2">
            <h3 className="eyebrow flex items-center gap-2 px-1">
              <BarChart2 size={14} aria-hidden="true" />
              {t('dashboard.myEvaluations')}
            </h3>
            {evalPlans.map((a) => (
              <Link
                key={a.id}
                to={`/student/eval/${a.plan_id}`}
                className="block card hover:bg-durazno-50/60 transition-colors active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-durazno-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                    {evalTypeIcon(a.plan?.eval_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-tinta break-words">{a.plan?.title}</p>
                    <p className="text-xs text-texto2">
                      {t(`evalType.${a.plan?.eval_type}`, {
                        defaultValue: evalTypeLabel(a.plan?.eval_type),
                      })}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-texto3" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Accesos rápidos */}
        <div className="card p-0 overflow-hidden">
          <Link
            to="/student/progress"
            className="flex items-center gap-3 px-4 py-3.5 border-b border-linea hover:bg-durazno-50/60 transition-colors"
          >
            <div className="w-10 h-10 bg-durazno-50 rounded-xl flex items-center justify-center text-primary-700">
              <TrendingUp size={18} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm text-tinta">{t('nav.progress')}</p>
              <p className="text-xs text-texto2">{t('dashboard.seeCharts')}</p>
            </div>
            <ChevronRight size={16} className="text-texto3" />
          </Link>
          <Link
            to="/student/history"
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-durazno-50/60 transition-colors"
          >
            <div className="w-10 h-10 bg-durazno-50 rounded-xl flex items-center justify-center text-primary-700">
              <Calendar size={18} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm text-tinta">{t('nav.history')}</p>
              <p className="text-xs text-texto2">{t('dashboard.allLogs')}</p>
            </div>
            <ChevronRight size={16} className="text-texto3" />
          </Link>
        </div>
      </div>
    </div>
  )
}
