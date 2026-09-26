import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import MonthlyCalendar from '../components/MonthlyCalendar'
import CoachAdherenceList from '../components/CoachAdherenceList'
import DashboardFilterBar from '../components/DashboardFilterBar'
import StudentPanel from '../components/StudentPanel'
import AttentionList from '../components/AttentionList'
import UpcomingAgenda from '../components/UpcomingAgenda'
import useCoachAlerts from '../hooks/useCoachAlerts'
import useCoachDashboardFilters from '../hooks/useCoachDashboardFilters'
import { groupAlertsByStudent } from '../alerts'

// ============================================================
// CoachDashboard
// ------------------------------------------------------------
// Rediseño 2026-09-26 (revisión de la lógica con Franco):
//   - Encabezado con tres números que ayudan a decidir: personas
//     activas, cuántas entrenaron hoy DE cuántas, y el cumplimiento
//     de la semana pasada. Se sacaron "Planes creados" (total
//     histórico) y los conteos de logs sueltos.
//   - Orden: Necesitan atención → Próximos 7 días → (panel de la
//     persona si hay filtro) → Calendario → Cumplimiento por persona
//     → Últimas sesiones.
//   - "Alertas de gestión" (una tarjeta por tipo) pasó a
//     "Necesitan atención" (una fila por persona).
//   - "Próximas evaluaciones" quedó dentro de "Próximos 7 días".
// ============================================================
export default function CoachDashboard() {
  const { profile } = useAuth()
  // Sesiones recientes enriquecidas (no logs sueltos — Franco 23/05 noche).
  const [recentSessions, setRecentSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const { loading: alertsLoading, alerts, summary } = useCoachAlerts()

  // Filtros globales del dashboard (alumno + plan + período).
  const filters = useCoachDashboardFilters()
  const { studentId, planId, periodRange } = filters

  useEffect(() => {
    fetchRecentSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, planId, periodRange.start, periodRange.end])

  // Últimas 10 SESIONES (1 fila por sesión = student_id + logged_date)
  // con su día A/B/C, PSE promedio, ejercicios y duración. Honra los
  // filtros globales.
  async function fetchRecentSessions() {
    try {
      const { start: windowStart, end: windowEnd } = periodRange
      const planIdForLogs = filters.selectedAssignment?.plan_id || null

      const applyCommon = (q) => {
        let out = q.eq('plans.plan_type', 'training')
        if (studentId) out = out.eq('student_id', studentId)
        if (planIdForLogs) out = out.eq('plan_id', planIdForLogs)
        return out
      }

      const [sessionsRes, sessionLogsRes] = await Promise.all([
        applyCommon(
          supabase.from('workout_sessions').select(
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
        applyCommon(
          supabase.from('workout_logs').select(
            `student_id, logged_date, completed,
             plans!inner(plan_type),
             plan_exercise:plan_exercises!plan_exercise_id(section)`
          )
        )
          .gte('logged_date', windowStart)
          .lte('logged_date', windowEnd),
      ])

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
        let dominantSection = null
        let bestCount = 0
        for (const [sec, count] of meta.sections) {
          if (count > bestCount) {
            dominantSection = sec
            bestCount = count
          }
        }
        const borg = s.borg_per_day || {}
        const borgValues = Object.values(borg)
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v > 0)
        const pseAvg =
          borgValues.length > 0
            ? Math.round((borgValues.reduce((a, b) => a + b, 0) / borgValues.length) * 10) / 10
            : null
        // Duración solo si empezó y terminó el mismo día y no es carga
        // tardía (memoria 2026-05-23).
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

      setRecentSessions(enriched)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const nombre = profile?.name?.split(' ')[0]

  const attentionCount = useMemo(() => groupAlertsByStudent(alerts).rows.length, [alerts])
  const subtitle = alertsLoading
    ? ' '
    : attentionCount === 0
      ? 'Nadie necesita tu atención ahora.'
      : attentionCount === 1
        ? '1 persona necesita tu atención.'
        : `${attentionCount} personas necesitan tu atención.`

  const s = summary || {}
  const fechaHoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="bg-durazno-100 rounded-encabezado px-5 pt-5 pb-5 space-y-1">
        <p className="eyebrow">{fechaHoy}</p>
        <h1 className="text-[28px] font-bold leading-tight text-tinta text-balance">
          {saludo}
          {nombre ? `, ${nombre}` : ''}
        </h1>
        <p className="text-texto2">{subtitle}</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-3 max-w-2xl">
          <HeroStat
            value={alertsLoading ? '—' : s.activeCount}
            label="personas activas"
            to="/coach/students"
          />
          <HeroStat
            value={alertsLoading ? '—' : `${s.trainedToday} de ${s.activeCount}`}
            label="entrenaron hoy"
          />
          <HeroStat
            value={alertsLoading || s.lastWeekPct == null ? '—' : `${s.lastWeekPct} %`}
            label="cumplimiento semana pasada"
          />
        </div>
      </div>

      {/* Filtros globales (persona + plan + período) */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <AttentionList alerts={alerts} loading={alertsLoading} studentId={filters.studentId} />
        <UpcomingAgenda studentId={filters.studentId} />
      </div>

      {/* Panel de la persona — solo con filtro de persona. */}
      {filters.studentId && (
        <StudentPanel
          studentId={filters.studentId}
          assignment={filters.selectedAssignment || filters.activeTrainingAssignment}
          periodRange={filters.periodRange}
          periodKey={filters.periodKey}
          studentName={filters.selectedStudent?.name}
        />
      )}

      <MonthlyCalendar
        studentId={filters.studentId || null}
        studentOptions={filters.studentOptions}
        onSelectStudent={(id) => filters.setStudent(id || '')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <section className="card">
          <p className="eyebrow mb-2">Cumplimiento por persona</p>
          <CoachAdherenceList
            filterStudentId={filters.studentId}
            filterPlanId={filters.planId}
            filterPeriodRange={filters.periodRange}
          />
        </section>

        <section className="card">
          <p className="eyebrow mb-1">Últimas sesiones</p>
          {loading ? (
            <div className="space-y-3 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-2/3 mb-1" />
                  <div className="h-3 bg-gray-50 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : recentSessions.length === 0 ? (
            <p className="text-sm text-texto2 py-2">No hay sesiones en este período.</p>
          ) : (
            <div className="divide-y divide-linea">
              {recentSessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function HeroStat({ value, label, to }) {
  const inner = (
    <>
      <b className="block text-lg sm:text-[22px] font-bold text-primary-700 tabular-nums leading-tight">
        {value}
      </b>
      <span className="block text-[12px] sm:text-[12.5px] leading-tight text-texto2 mt-0.5">
        {label}
      </span>
    </>
  )
  const cls = 'bg-white/75 rounded-recuadro px-2 py-2.5 text-center'
  return to ? (
    <Link to={to} className={`${cls} hover:bg-white`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
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
  const parts = []
  if (dayLabel) parts.push(dayLabel)
  parts.push(
    session.totalCount > 0
      ? `${session.completedCount} de ${session.totalCount} ejercicios`
      : 'Sin ejercicios cargados'
  )
  if (session.pseAvg !== null) parts.push(`PSE ${session.pseAvg}`)
  if (session.durationMin !== null) parts.push(`${session.durationMin} min`)

  return (
    <Link
      to={`/coach/students/${session.student_id}`}
      className="flex items-center gap-3 py-2.5 group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-tinta truncate group-hover:text-primary-700">
            {session.student?.name || 'Persona'}
          </p>
          <span className="text-[13px] text-texto2 tabular-nums flex-shrink-0">
            {format(parseISO(session.logged_date), 'dd/MM')}
          </span>
        </div>
        <p className="text-[13px] text-texto2 mt-0.5">
          {parts.join(' · ')}
          {session.logged_late && <span className="pill-warn ml-2 text-[11px]">Carga tardía</span>}
        </p>
      </div>
      <ChevronRight size={16} className="text-texto3 flex-shrink-0" />
    </Link>
  )
}
