import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Users, ClipboardList, TrendingUp, Activity, ChevronRight, Calendar } from 'lucide-react'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'

export default function CoachDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ students: 0, plans: 0, logsToday: 0, logsWeek: 0 })
  const [recentLogs, setRecentLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

      const [studentsRes, plansRes, logsTodayRes, logsWeekRes, recentRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'student').eq('active', true),
        supabase.from('plans').select('id', { count: 'exact' }),
        supabase.from('workout_logs').select('id', { count: 'exact' }).eq('logged_date', today),
        supabase.from('workout_logs').select('id', { count: 'exact' }).gte('logged_date', weekAgo),
        supabase.from('workout_logs')
          .select(`
            id, logged_date, actual_weight, perceived_difficulty, completed,
            student:profiles!student_id(name),
            plan_exercise:plan_exercises!plan_exercise_id(
              exercise:exercises!exercise_id(name)
            )
          `)
          .order('created_at', { ascending: false })
          .limit(10)
      ])

      setStats({
        students: studentsRes.count || 0,
        plans: plansRes.count || 0,
        logsToday: logsTodayRes.count || 0,
        logsWeek: logsWeekRes.count || 0,
      })
      setRecentLogs(recentRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{saludo}, {profile?.name?.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">{format(new Date(), "EEEE d 'de' MMMM", { locale: es })}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/coach/students" className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <ChevronRight size={16} className="text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{loading ? '—' : stats.students}</p>
          <p className="text-sm text-gray-500">Alumnos activos</p>
        </Link>

        <Link to="/coach/plans" className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-purple-600" />
            </div>
            <ChevronRight size={16} className="text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{loading ? '—' : stats.plans}</p>
          <p className="text-sm text-gray-500">Planes creados</p>
        </Link>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{loading ? '—' : stats.logsToday}</p>
          <p className="text-sm text-gray-500">Logs hoy</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{loading ? '—' : stats.logsWeek}</p>
          <p className="text-sm text-gray-500">Logs esta semana</p>
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Actividad reciente</h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="card animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-xl" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-2/3 mb-1" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : recentLogs.length === 0 ? (
          <div className="card text-center py-8">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No hay actividad reciente</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentLogs.map(log => (
              <div key={log.id} className="card">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    log.completed ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <Activity size={18} className={log.completed ? 'text-green-600' : 'text-gray-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {log.student?.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {log.plan_exercise?.exercise?.name}
                      {log.actual_weight ? ` · ${log.actual_weight}kg` : ''}
                      {log.perceived_difficulty ? ` · PSE ${log.perceived_difficulty}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {format(new Date(log.logged_date), 'dd/MM')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
