import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  Users,
  ClipboardList,
  TrendingUp,
  Activity,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Clock,
  Zap,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import MonthlyCalendar from '../components/MonthlyCalendar'
import CoachAdherenceList from '../components/CoachAdherenceList'
import DashboardFilterBar from '../components/DashboardFilterBar'
import StudentPanel from '../components/StudentPanel'
import UpcomingEvaluations from '../components/UpcomingEvaluations'
import useCoachAlerts from '../hooks/useCoachAlerts'
import useCoachDashboardFilters from '../hooks/useCoachDashboardFilters'
import { ALERT_KIND, ALERT_RENDER_ORDER, ALERT_THRESHOLDS } from '../alerts'

export default function CoachDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ students: 0, plans: 0, logsToday: 0, logsWeek: 0 })
  // Sesiones recientes enriquecidas (no logs sueltos — Franco 23/05 noche).
  const [recentSessions, setRecentSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const { loading: alertsLoading, alerts } = useCoachAlerts()

  // Filtros globales del dashboard (alumno + plan + período).
  // Doc 19 — Opción C. Defaults aplicados desde el hook.
  const filters = useCoachDashboardFilters()
  const { studentId, planId, periodRange } = filters

  useEffect(() => {
    fetchStatsAndRecent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, planId, periodRange.start, periodRange.end])

  // Fetch de KPIs + últimas sesiones. Honra los filtros globales.
  // "Actividad reciente" se rediseñó (23/05 noche): en lugar de listar
  // 10 logs sueltos por ejercicio, mostramos las últimas 10 SESIONES
  // (1 fila por sesión = student_id + logged_date) con su día A/B/C,
  // PSE promedio, count de ejercicios y duración.
  async function fetchStatsAndRecent() {
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { start: windowStart, end: windowEnd } = periodRange

      const planIdForLogs = filters.selectedAssignment?.plan_id || null

      const applyCommonLogs = (q) => {
        let out = q.eq('plans.plan_type', 'training')
        if (studentId) out = out.eq('student_id', studentId)
        if (planIdForLogs) out = out.eq('plan_id', planIdForLogs)
        return out
      }
      const applyCommonSessions = (q) => {
        let out = q.eq('plans.plan_type', 'training')
        if (studentId) out = out.eq('student_id', studentId)
        if (planIdForLogs) out = out.eq('plan_id', planIdForLogs)
        return out
      }

      const [
        studentsRes,
        plansRes,
        logsTodayRes,
        logsWeekRes,
        sessionsRes,
        sessionLogsRes,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact' })
          .eq('role', 'student')
          .eq('active', true),
        supabase.from('plans').select('id', { count: 'exact' }),
        applyCommonLogs(
          supabase
            .from('workout_logs')
            .select('id, plans!inner(plan_type)', { count: 'exact' })
        ).eq('logged_date', today),
        applyCommonLogs(
          supabase
            .from('workout_logs')
            .select('id, plans!inner(plan_type)', { count: 'exact' })
        )
          .gte('logged_date', windowStart)
          .lte('logged_date', windowEnd),
        // Últimas N sesiones del coach (con datos del alumno + plan).
        applyCommonSessions(
          supabase
            .from('workout_sessions')
            .select(
              `id, student_id, plan_id, logged_date, started_at, finished_at, borg_per_day, logged_late,
               student:profiles!student_id(name),
               plans!inner(plan_type, title)`
            )
        )
          .gte('logged_date', windowStart)
          .lte('logged_date', windowEnd)
          .order('logged_date', { ascending: false })
          .order('finished_at', { ascending: false, nullsFirst: false })
          .limit(10),
        // Logs en la misma ventana para enriquecer las sesiones con
        // section dominante + count de ejercicios completados.
        applyCommonLogs(
          supabase
            .from('workout_logs')
            .select(
              `student_id, logged_date, completed,
               plans!inner(plan_type),
               plan_exercise:plan_exercises!plan_exercise_id(section)`
            )
        )
          .gte('logged_date', windowStart)
          .lte('logged_date', windowEnd),
      ])

      // Agrupar logs por (student_id, YMD) para enriquecer cada sesión.
      const byKey = new Map()
      for (const l of sessionLogsRes.data || []) {
        const k = `${l.student_id}__${String(l.logged_date).slice(0, 10)}`
        const prev = byKey.get(k) || { total: 0, completed: 0, sections: new Map() }
        prev.total += 1
        if (l.completed) prev.completed += 1
        const section = l.plan_exercise?.section
        if (section && section.startsWith('day_')) {
          prev.sections.set(section, (prev.sections.get(section) || 0) + 1)
        }
        byKey.set(k, prev)
      }

      const enriched = (sessionsRes.data || []).map((s) => {
        const k = `${s.student_id}__${String(s.logged_date).slice(0, 10)}`
        const meta = byKey.get(k) || { total: 0, completed: 0, sections: new Map() }
        // Section dominante = la más frecuente en los logs del día.
        let dominantSection = null
        let bestCount = 0
        for (const [sec, count] of meta.sections) {
          if (count > bestCount) {
            dominantSection = sec
            bestCount = count
          }
        }
        // PSE promedio: avg de borg_per_day si no está vacío.
        const borg = s.borg_per_day || {}
        const borgValues = Object.values(borg)
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v > 0)
        const pseAvg =
          borgValues.length > 0
            ? Math.round((borgValues.reduce((a, b) => a + b, 0) / borgValues.length) * 10) / 10
            : null
        // Duración: si hay started_at + finished_at + mismo día, mostramos
        // minutos. Si no, null (no inflar con el ruido de carga tardía —
        // documentado en memoria 2026-05-23).
        let durationMin = null
        if (s.started_at && s.finished_at && !s.logged_late) {
          const startD = new Date(s.started_at)
          const endD = new Date(s.finished_at)
          if (startD.toDateString() === endD.toDateString()) {
            const min = Math.round((endD.getTime() - startD.getTime()) / 60000)
            if (min > 0 && min < 600) durationMin = min
          }
        }
        return {
          ...s,
          dominantSection,
          completedCount: meta.completed,
          totalCount: meta.total,
          pseAvg,
          durationMin,
        }
      })

      setStats({
        students: studentsRes.count || 0,
        plans: plansRes.count || 0,
        logsToday: logsTodayRes.count || 0,
        logsWeek: logsWeekRes.count || 0,
      })
      setRecentSessions(enriched)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  // Lista de alertas a renderizar, ya filtradas por las que tienen items.
  const alertsToShow = ALERT_RENDER_ORDER.map((kind) => ({
    kind,
    items: alerts?.[kind] || [],
  })).filter((g) => g.items.length > 0)
  const hasAlerts = alertsToShow.length > 0

  // Labels dinámicos según si hay filtro de alumno activo. Cuando hay
  // alumno seleccionado, los KPIs se vuelven alumno-céntricos.
  const isFiltered = !!studentId
  const logsTodayLabel = isFiltered ? 'Logs hoy (alumno)' : 'Logs hoy'
  const logsWindowLabel = isFiltered
    ? 'Logs en período (alumno)'
    : 'Logs esta semana'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {saludo}, {profile?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Filtros globales (alumno + plan + período) — Doc 19 Fase C.1 */}
      <DashboardFilterBar
        studentId={filters.studentId}
        planId={filters.planId}
        periodKey={filters.periodKey}
        setStudent={filters.setStudent}
        setPlan={filters.setPlan}
        setPeriod={filters.setPeriod}
        clearAll={filters.clearAll}
        studentOptions={filters.studentOptions}
        planOptionsForStudent={filters.planOptionsForStudent}
        periodOptions={filters.periodOptions}
        loadingOptions={filters.loadingOptions}
      />

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
          <p className="text-sm text-gray-500">{logsTodayLabel}</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{loading ? '—' : stats.logsWeek}</p>
          <p className="text-sm text-gray-500">{logsWindowLabel}</p>
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

      {/* Panel del alumno — solo visible cuando hay alumno seleccionado.
          Muestra KPIs + donut + tildes + mensaje motivacional. Fase C.2 */}
      {filters.studentId && (
        <StudentPanel
          studentId={filters.studentId}
          assignment={filters.selectedAssignment || filters.activeTrainingAssignment}
          periodRange={filters.periodRange}
          periodKey={filters.periodKey}
          studentName={filters.selectedStudent?.name}
        />
      )}

      {/* Adherencia por alumno (Q2) — tildes ✓✓◐ filtradas por
          alumno/plan/período. Click en una fila → detalle del alumno. */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title flex items-center gap-2">
            <Users size={15} className="text-primary-500" />
            Adherencia por alumno
          </h2>
        </div>
        <CoachAdherenceList
          filterStudentId={filters.studentId}
          filterPlanId={filters.planId}
          filterPeriodRange={filters.periodRange}
        />
      </div>

      {/* Próximas evaluaciones (Fase C.3 doc 19).
          Filtradas por alumno cuando hay filtro global. */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title flex items-center gap-2">
            <ClipboardList size={15} className="text-purple-500" />
            Próximas evaluaciones
          </h2>
        </div>
        <UpcomingEvaluations filterStudentId={filters.studentId} />
      </div>

      {/* Calendario mensual (Fase 3) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title flex items-center gap-2">
            <Calendar size={15} className="text-primary-500" />
            Calendario
          </h2>
        </div>
        <MonthlyCalendar
          controlledSelectedIds={filters.studentId ? [filters.studentId] : null}
        />
      </div>

      {/* Últimas sesiones (rediseño 2026-05-23 noche).
          Antes: 10 logs sueltos por ejercicio (mucho ruido).
          Ahora: 1 fila por sesión con día A/B/C, # ejercicios, PSE, duración. */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Últimas sesiones</h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
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
        ) : recentSessions.length === 0 ? (
          <div className="card text-center py-8">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No hay sesiones en este período</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SessionRow — 1 fila por sesión en "Últimas sesiones"
// ─────────────────────────────────────────────────────────────
const SECTION_LABEL = {
  day_a: 'Día A',
  day_b: 'Día B',
  day_c: 'Día C',
  day_d: 'Día D',
}

function SessionRow({ session }) {
  const dayLabel = session.dominantSection ? SECTION_LABEL[session.dominantSection] : null
  const completedPart =
    session.totalCount > 0
      ? `${session.completedCount}/${session.totalCount} ejercicios`
      : 'Sin ejercicios cargados'
  return (
    <Link
      to={`/coach/students/${session.student_id}`}
      className="card flex items-center gap-3 hover:shadow-md transition-shadow"
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          session.completedCount > 0 ? 'bg-green-100' : 'bg-gray-100'
        }`}
      >
        <Activity
          size={18}
          className={session.completedCount > 0 ? 'text-green-600' : 'text-gray-400'}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {session.student?.name || 'Alumno'}
          </p>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {format(parseISO(session.logged_date), 'dd/MM')}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-gray-500">
          {dayLabel && (
            <span className="font-medium text-primary-600">{dayLabel}</span>
          )}
          <span>·</span>
          <span>{completedPart}</span>
          {session.pseAvg !== null && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                <Zap size={11} /> PSE {session.pseAvg}
              </span>
            </>
          )}
          {session.durationMin !== null && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                <Clock size={11} /> {session.durationMin} min
              </span>
            </>
          )}
          {session.logged_late && (
            <span className="badge bg-amber-100 text-amber-700 text-[10px]">
              Carga tardía
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
    </Link>
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
          <p className="text-xs text-gray-500 mt-0.5 truncate">{buildAlertSubtitle(kind, items)}</p>
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
    case 'fatigueStudents':
      return `${count} alumno${plural ? 's' : ''} con señales de fatiga`
    case 'lowMotivationStudents':
      return `${count} alumno${plural ? 's' : ''} con baja motivación`
    case 'painStudents':
      return `${count} alumno${plural ? 's' : ''} con dolor repetido`
    case 'stagnationStudents':
      return `${count} alumno${plural ? 's' : ''} con estancamiento`
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
    const detail = top
      .map((s) => {
        const d = s.daysSinceLastLog
        const days = d === Infinity ? '∞' : d
        return `${s.name} (${days}d)`
      })
      .join(', ')
    return rest > 0 ? `${detail} y ${rest} más` : detail
  }

  if (kind === 'highRpeStudents') {
    const detail = top.map((s) => `${s.name} (${s.highRpeCount}× · pico ${s.peakRpe})`).join(', ')
    return rest > 0 ? `${detail} y ${rest} más` : detail
  }

  if (kind === 'planExpiringSoon') {
    const detail = top
      .map((s) => `${s.name} (${s.daysUntilEnd === 0 ? 'hoy' : `en ${s.daysUntilEnd}d`})`)
      .join(', ')
    return rest > 0 ? `${detail} y ${rest} más` : detail
  }

  if (kind === 'fatigueStudents') {
    const detail = top
      .map((s) => `${s.name} (${(s.triggers || []).join(' · ') || 'sin detalle'})`)
      .join(', ')
    return rest > 0 ? `${detail} y ${rest} más` : detail
  }

  if (kind === 'lowMotivationStudents') {
    const detail = top
      .map((s) => `${s.name} (${(s.triggers || []).join(' · ') || 'sin detalle'})`)
      .join(', ')
    return rest > 0 ? `${detail} y ${rest} más` : detail
  }

  if (kind === 'painStudents') {
    const detail = top
      .map((s) => {
        const parts = []
        if (s.triggers && s.triggers.length > 0) parts.push(s.triggers.join(' · '))
        if (s.lastNoteSnippet) parts.push(`"${s.lastNoteSnippet}"`)
        const meta = parts.length > 0 ? ` (${parts.join(' — ')})` : ''
        return `${s.name}${meta}`
      })
      .join(', ')
    return rest > 0 ? `${detail} y ${rest} más` : detail
  }

  if (kind === 'stagnationStudents') {
    const detail = top
      .map((s) => {
        const exNames = (s.stagnantExercises || [])
          .slice(0, 3)
          .map((ex) => ex.exerciseName)
          .join(', ')
        const extras = (s.stagnantExercises || []).length - 3
        const exDetail = extras > 0 ? `${exNames} +${extras}` : exNames
        return `${s.name} (${exDetail || 'sin detalle'})`
      })
      .join(' · ')
    return rest > 0 ? `${detail} · ${rest} más` : detail
  }

  // Por defecto: solo nombres
  const names = top.map((s) => s.name).join(', ')
  return rest > 0 ? `${names} y ${rest} más` : names
}
