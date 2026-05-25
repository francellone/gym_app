import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { format, subDays, eachDayOfInterval, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dumbbell, TrendingUp, Calendar, ChevronRight, Flame, BarChart2 } from 'lucide-react'
import { evalTypeIcon, evalTypeLabel } from '@/features/evaluations/helpers'
import {
  filterTrainingLogs,
  computeStreak,
  computeWeekTrainingDays,
} from '@/features/students/dashboardLogic'
import { computeDayTallies } from '@/features/students/dayTalliesLogic'
import DayTalliesBadge from '@/features/students/components/DayTalliesBadge'

export default function StudentDashboard() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [weekLogs, setWeekLogs] = useState([])
  const [streak, setStreak] = useState(0)
  const [, setLoading] = useState(true)
  const [pendingIntake, setPendingIntake] = useState(false)
  const [pendingFollowUps, setPendingFollowUps] = useState([])
  // Q2 — tallies por día (Día A ✓✓◐) para el plan activo.
  // Se carga aparte porque necesita la ventana completa del plan,
  // no la semana del heatmap.
  const [dayTallies, setDayTallies] = useState({})

  useEffect(() => {
    if (profile?.id) fetchData()
  }, [profile])

  async function fetchData() {
    try {
      const weekAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd')
      const today = format(new Date(), 'yyyy-MM-dd')

      // Liberar formularios programados que ya vencieron (idempotente, no bloquea)
      try {
        await supabase.rpc('release_due_forms')
      } catch {}

      const [assignmentsRes, logsRes, formsRes] = await Promise.all([
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
        supabase
          .from('intake_form_assignments')
          .select('id, form_kind, form_snapshot')
          .eq('student_id', profile.id)
          .in('status', ['pending', 'in_progress']),
      ])

      const allForms = formsRes.data || []
      setPendingIntake(allForms.some((f) => f.form_kind === 'intake'))
      setPendingFollowUps(allForms.filter((f) => f.form_kind === 'follow_up'))

      setAssignments(assignmentsRes.data || [])

      // Filtramos a logs de planes training (cualquier status: active,
      // replaced, paused...). Las evaluaciones quedan afuera. Detalle
      // de la regla en src/utils/studentDashboardLogic.js.
      const trainingLogs = filterTrainingLogs(logsRes.data || [])
      setWeekLogs(trainingLogs)
      setStreak(computeStreak(trainingLogs, new Date()))
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
            .select('id, section_id, block_type')
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
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="max-w-lg mx-auto">
      {/* Banner formulario de alta pendiente (prioritario) */}
      {pendingIntake && (
        <Link
          to="/student/intake"
          className="block mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Tenés un formulario pendiente</p>
              <p className="text-xs text-amber-600">
                Tu coach te envió el formulario de ingreso. Completalo para empezar.
              </p>
            </div>
            <ChevronRight size={18} className="text-amber-400 flex-shrink-0" />
          </div>
        </Link>
      )}

      {/* Banner formularios de seguimiento pendientes */}
      {!pendingIntake && pendingFollowUps.length > 0 && (
        <Link
          to={
            pendingFollowUps.length === 1
              ? `/student/form/${pendingFollowUps[0].id}`
              : '/student/forms'
          }
          className="block mx-4 mt-4 bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 hover:bg-purple-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📝</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-purple-800">
                {pendingFollowUps.length === 1
                  ? 'Tu coach te envió un formulario'
                  : `Tenés ${pendingFollowUps.length} formularios pendientes`}
              </p>
              <p className="text-xs text-purple-600">
                {pendingFollowUps.length === 1
                  ? 'Tomate un minuto para responderlo.'
                  : 'Respondelos cuando tengas un momento.'}
              </p>
            </div>
            <ChevronRight size={18} className="text-purple-400 flex-shrink-0" />
          </div>
        </Link>
      )}

      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-700 px-5 pt-12 pb-8">
        <p className="text-primary-200 text-sm">{saludo}</p>
        <h1 className="text-2xl font-bold text-white mt-0.5">{profile?.name?.split(' ')[0]} 💪</h1>
        <p className="text-primary-200 text-sm mt-1">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>

        {streak > 0 && (
          <div className="flex items-center gap-2 mt-4 bg-white/10 rounded-xl px-3 py-2 w-fit">
            <Flame size={18} className="text-orange-300" />
            <span className="text-white font-semibold">
              {streak} día{streak > 1 ? 's' : ''} seguido{streak > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="px-4 -mt-4 pb-6 space-y-4">
        {/* Weekly heatmap */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Esta semana</h3>
          <div className="flex gap-2 justify-between">
            {last7Days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const trained = trainingDays.has(dateStr)
              const today = isToday(day)
              return (
                <div key={dateStr} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-400">
                    {format(day, 'EEEEE', { locale: es })}
                  </span>
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${
                      trained
                        ? 'bg-primary-500 text-white'
                        : today
                          ? 'bg-primary-100 text-primary-600 border-2 border-primary-400'
                          : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Q2 — Tildes por día del plan activo */}
          {activePlan && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Cuántas veces hiciste cada día
              </h4>
              <DayTalliesBadge tallies={dayTallies} showLegend />
            </div>
          )}
        </div>

        {/* Go to today's workout */}
        <Link
          to="/student/workout"
          className="block card bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Dumbbell className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">Entrenamiento de hoy</p>
              <p className="text-primary-200 text-sm">
                {activePlan?.plan?.title || 'Ver tu rutina'}
              </p>
            </div>
            <ChevronRight className="text-white/70" size={20} />
          </div>
        </Link>

        {/* Evaluation plans */}
        {evalPlans.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart2 size={14} className="text-purple-500" />
              Mis evaluaciones
            </h3>
            {evalPlans.map((a) => (
              <Link
                key={a.id}
                to={`/student/eval/${a.plan_id}`}
                className="block card hover:shadow-md transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                    {evalTypeIcon(a.plan?.eval_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">{a.plan?.title}</p>
                    <p className="text-xs text-gray-500">{evalTypeLabel(a.plan?.eval_type)}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/student/progress"
            className="card hover:shadow-md transition-all active:scale-[0.98] flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp size={18} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">Progreso</p>
              <p className="text-xs text-gray-500">Ver gráficos</p>
            </div>
          </Link>
          <Link
            to="/student/history"
            className="card hover:shadow-md transition-all active:scale-[0.98] flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Calendar size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">Historial</p>
              <p className="text-xs text-gray-500">Todos los logs</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
