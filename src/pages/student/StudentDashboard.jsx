import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, subDays, eachDayOfInterval, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dumbbell, TrendingUp, Calendar, ChevronRight, Flame, BarChart2 } from 'lucide-react'
import { evalTypeIcon, evalTypeLabel } from '../../utils/evalHelpers'

export default function StudentDashboard() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [weekLogs, setWeekLogs] = useState([])
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pendingIntake, setPendingIntake] = useState(false)

  useEffect(() => {
    if (profile?.id) fetchData()
  }, [profile])

  async function fetchData() {
    try {
      const weekAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd')
      const today = format(new Date(), 'yyyy-MM-dd')

      const [assignmentsRes, logsRes, intakeRes] = await Promise.all([
        supabase
          .from('plan_assignments')
          .select('*, plan:plans!plan_id(*)')
          .eq('student_id', profile.id)
          .eq('active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('workout_logs')
          .select('logged_date, completed')
          .eq('student_id', profile.id)
          .gte('logged_date', weekAgo)
          .lte('logged_date', today),
        supabase
          .from('intake_form_assignments')
          .select('id')
          .eq('student_id', profile.id)
          .in('status', ['pending', 'in_progress'])
          .limit(1)
      ])

      setPendingIntake((intakeRes.data?.length ?? 0) > 0)

      setAssignments(assignmentsRes.data || [])

      const logs = logsRes.data || []
      setWeekLogs(logs)

      // Streak
      let streakCount = 0
      let checkDate = new Date()
      while (true) {
        const dateStr = format(checkDate, 'yyyy-MM-dd')
        const hasLog = logs.some(l => l.logged_date === dateStr && l.completed)
        if (!hasLog && !isToday(checkDate)) break
        if (hasLog) streakCount++
        checkDate = subDays(checkDate, 1)
        if (streakCount > 60) break
      }
      setStreak(streakCount)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const last7Days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() })
  const trainingDays = new Set(weekLogs.filter(l => l.completed).map(l => l.logged_date))

  const trainingPlans = assignments.filter(a => !a.plan?.plan_type || a.plan?.plan_type === 'training')
  const evalPlans = assignments.filter(a => a.plan?.plan_type === 'evaluation')
  const activePlan = trainingPlans[0]

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="max-w-lg mx-auto">
      {/* Banner formulario pendiente */}
      {pendingIntake && (
        <Link
          to="/student/intake"
          className="block mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Tenés un formulario pendiente</p>
              <p className="text-xs text-amber-600">Tu coach te envió el formulario de ingreso. Completalo para empezar.</p>
            </div>
            <ChevronRight size={18} className="text-amber-400 flex-shrink-0" />
          </div>
        </Link>
      )}

      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-700 px-5 pt-12 pb-8">
        <p className="text-primary-200 text-sm">{saludo}</p>
        <h1 className="text-2xl font-bold text-white mt-0.5">
          {profile?.name?.split(' ')[0]} 💪
        </h1>
        <p className="text-primary-200 text-sm mt-1">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>

        {streak > 0 && (
          <div className="flex items-center gap-2 mt-4 bg-white/10 rounded-xl px-3 py-2 w-fit">
            <Flame size={18} className="text-orange-300" />
            <span className="text-white font-semibold">{streak} día{streak > 1 ? 's' : ''} seguido{streak > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      <div className="px-4 -mt-4 pb-6 space-y-4">
        {/* Weekly heatmap */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Esta semana</h3>
          <div className="flex gap-2 justify-between">
            {last7Days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const trained = trainingDays.has(dateStr)
              const today = isToday(day)
              return (
                <div key={dateStr} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-400">
                    {format(day, 'EEEEE', { locale: es })}
                  </span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${
                    trained
                      ? 'bg-primary-500 text-white'
                      : today
                      ? 'bg-primary-100 text-primary-600 border-2 border-primary-400'
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    {format(day, 'd')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Go to today's workout */}
        <Link to="/student/workout" className="block card bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 transition-all active:scale-[0.98]">
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
            {evalPlans.map(a => (
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
          <Link to="/student/progress" className="card hover:shadow-md transition-all active:scale-[0.98] flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp size={18} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">Progreso</p>
              <p className="text-xs text-gray-500">Ver gráficos</p>
            </div>
          </Link>
          <Link to="/student/history" className="card hover:shadow-md transition-all active:scale-[0.98] flex items-center gap-3">
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
