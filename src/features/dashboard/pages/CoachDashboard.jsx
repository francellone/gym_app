import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { Users, ClipboardList, TrendingUp, Activity, ChevronRight, Calendar, AlertTriangle } from 'lucide-react'
import { readLogWeights } from '@/features/plans/helpers'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import MonthlyCalendar from '../components/MonthlyCalendar'
import useCoachAlerts from '../hooks/useCoachAlerts'
import { ALERT_KIND, ALERT_RENDER_ORDER, ALERT_THRESHOLDS } from '../alerts'

export default function CoachDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ students: 0, plans: 0, logsToday: 0, logsWeek: 0 })
  const [recentLogs, setRecentLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const { loading: alertsLoading, alerts } = useCoachAlerts()

  useEffect(() => {
    fetchStatsAndRecent()
  }, [])

  // Fetch ligero solo para los KPIs y la actividad reciente.
  // Las alertas viven en useCoachAlerts ahora.
  async function fetchStatsAndRecent() {
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

      // Los KPIs de "Logs hoy" / "Logs semana" y la lista de "logs
      // recientes" deben contar SOLO entrenos, no evaluaciones.
      // Usamos `plans!inner` para inner-joinear y filtrar por
      // plan_type='training' del lado de la DB. Sin esto, las
      // evaluaciones inflaban los counts (~7 filas legacy ya borradas
      // por migration_v23, pero blindamos a futuro).
      const [studentsRes, plansRes, logsTodayRes, logsWeekRes, recentRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'student').eq('active', true),
        supabase.from('plans').select('id', { count: 'exact' }),
        supabase.from('workout_logs')
          .select('id, plans!inner(plan_type)', { count: 'exact' })
          .eq('plans.plan_type', 'training')
          .eq('logged_date', today),
        supabase.from('workout_logs')
          .select('id, plans!inner(plan_type)', { count: 'exact' })
          .eq('plans.plan_type', 'training')
          .gte('logged_date', weekAgo),
        supabase.from('workout_logs')
          .select(`
            id, logged_date, actual_weight, actual_weights, actual_weights_jsonb,
            weight_mode, perceived_difficulty, completed,
            student:profiles!student_id(name),
            plans!inner(plan_type),
            plan_exercise:plan_exercises!plan_exercise_id(
              exercise:exercises!exercise_id(name)
            )
          `)
          .eq('plans.plan_type', 'training')
          .order('created_at', { ascending: false })
          .limit(10),
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

  // Lista de alertas a renderizar, ya filtradas por las que tienen items.
  const alertsToShow = ALERT_RENDER_ORDER
    .map(kind => ({ kind, items: alerts?.[kind] || [] }))
    .filter(g => g.items.length > 0)
  const hasAlerts = alertsToShow.length > 0

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

      {/* Alertas de gestión (Fase 4 — extendidas, render driven by data) */}
      {!alertsLoading && hasAlerts && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title flex items-center gap-2">
              <AlertTriangle size={15} className="text-yellow-500" />
              Alertas de gestión
            </h2>
            <Link to="/coach/students" className="text-xs text-primary-600 font-medium">
              Ver alumnos →
            </Link>
          </div>

          <div className="space-y-2">
            {alertsToShow.map(({ kind, items }) => (
              <AlertCard key={kind} kind={kind} items={items} />
            ))}
          </div>
        </div>
      )}

      {/* Calendario mensual (Fase 3) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title flex items-center gap-2">
            <Calendar size={15} className="text-primary-500" />
            Calendario
          </h2>
        </div>
        <MonthlyCalendar />
      </div>

      {/* Actividad reciente */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Actividad reciente</h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
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
                    {(() => {
                      const ws = readLogWeights(log).filter(w => w != null && w !== '')
                      const wDisplay = ws.length > 0 ? `${ws[0]}kg` : null
                      const modeDisplay = log.weight_mode === 'bodyweight'
                        ? 'BW'
                        : log.weight_mode === 'barbell_only' ? 'solo barra' : null
                      return (
                        <p className="text-xs text-gray-500 truncate">
                          {log.plan_exercise?.exercise?.name}
                          {wDisplay ? ` · ${wDisplay}` : (modeDisplay ? ` · ${modeDisplay}` : '')}
                          {log.perceived_difficulty ? ` · PSE ${log.perceived_difficulty}` : ''}
                        </p>
                      )
                    })()}
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

// ─────────────────────────────────────────────────────────────
// AlertCard
// ─────────────────────────────────────────────────────────────
// Card genérica para cada tipo de alerta. La copia/grammar se decide
// vía buildAlertTitle / buildAlertSubtitle, así no acoplamos la
// lógica pura (en coachAlerts.js) con el español de la UI.
function AlertCard({ kind, items }) {
  const cfg = ALERT_KIND[kind]
  if (!cfg) return null
  const count = items.length
  return (
    <div className={`card border-l-4 ${cfg.borderClass} py-3`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {cfg.icon} {buildAlertTitle(kind, count)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {buildAlertSubtitle(kind, items)}
          </p>
        </div>
        <Link
          to="/coach/students"
          className={`text-xs font-medium hover:underline flex-shrink-0 ${cfg.accentClass}`}
        >
          Ver
        </Link>
      </div>
    </div>
  )
}

function buildAlertTitle(kind, count) {
  const plural = count !== 1
  switch (kind) {
    case 'overdue':
      return `${count} pago${plural ? 's' : ''} vencido${plural ? 's' : ''}`
    case 'planExpiringSoon':
      return `${count} plan${plural ? 'es' : ''} vence${plural ? 'n' : ''} en ${ALERT_THRESHOLDS.PLAN_EXPIRING_SOON_DAYS} días`
    case 'dueSoon':
      return `${count} pago${plural ? 's' : ''} vence${plural ? 'n' : ''} en ${ALERT_THRESHOLDS.PAYMENT_DUE_SOON_DAYS} días`
    case 'inactiveStudents':
      return `${count} alumno${plural ? 's' : ''} sin entrenar hace ${ALERT_THRESHOLDS.INACTIVE_DAYS}+ días`
    case 'highRpeStudents':
      return `${count} alumno${plural ? 's' : ''} con esfuerzo alto sostenido`
    case 'noActivePlan':
      return `${count} alumno${plural ? 's' : ''} sin plan activo`
    default:
      return `${count} alertas`
  }
}

function buildAlertSubtitle(kind, items) {
  // Para alertas con metadata interesante por item (días vencidos,
  // RPE pico, etc.) mostramos un detalle del primero. Para el resto,
  // nombres separados por coma + "y N más" si hay muchos.
  const top = items.slice(0, 3)
  const rest = items.length - top.length

  if (kind === 'inactiveStudents') {
    const detail = top.map(s => {
      const d = s.daysSinceLastLog
      const days = d === Infinity ? '∞' : d
      return `${s.name} (${days}d)`
    }).join(', ')
    return rest > 0 ? `${detail} y ${rest} más` : detail
  }

  if (kind === 'highRpeStudents') {
    const detail = top.map(s =>
      `${s.name} (${s.highRpeCount}× · pico ${s.peakRpe})`
    ).join(', ')
    return rest > 0 ? `${detail} y ${rest} más` : detail
  }

  if (kind === 'planExpiringSoon') {
    const detail = top.map(s =>
      `${s.name} (${s.daysUntilEnd === 0 ? 'hoy' : `en ${s.daysUntilEnd}d`})`
    ).join(', ')
    return rest > 0 ? `${detail} y ${rest} más` : detail
  }

  // Por defecto: solo nombres
  const names = top.map(s => s.name).join(', ')
  return rest > 0 ? `${names} y ${rest} más` : names
}
