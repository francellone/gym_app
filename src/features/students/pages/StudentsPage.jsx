import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Users, Plus, Search, ChevronRight, AlertCircle, UserX, UserCheck } from 'lucide-react'
import { getPaymentStatus, getPlanStatus, PAYMENT_STATUS, PLAN_STATUS } from '../status'
import { isProfileActive, filterByActiveStatus } from '../helpers'
import { useAuth } from '@/features/auth/AuthContext'
import {
  pickPrimaryTrainingAssignment,
  getAssignmentStatus,
  statusConfig,
} from '@/features/plans/assignmentHelpers'
import WellbeingStatusBadge from '@/features/wellbeing/components/WellbeingStatusBadge'
import { summarizeByStudent, formatYMD } from '@/features/wellbeing/wellbeingSummaryLogic'
import { ALERT_THRESHOLDS } from '@/features/dashboard/alerts'

export default function StudentsPage() {
  const { profile } = useAuth()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fetchError, setFetchError] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  // v40: filtro de estado del perfil. Default 'active' para que la lista
  // no crezca con gente que ya no entrena. 'inactive' | 'all' bajo demanda.
  const [activeFilter, setActiveFilter] = useState('active')
  const [togglingId, setTogglingId] = useState(null)
  // Wellbeing por alumno (2026-08-27): Map<studentId, summary> de los últimos
  // WELLBEING_WINDOW_DAYS días. Un solo query bulk para toda la lista.
  const [wellbeingByStudent, setWellbeingByStudent] = useState(new Map())

  useEffect(() => {
    fetchStudents()
  }, [])

  async function fetchStudents() {
    setFetchError(null)
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('name')

      if (profilesError) throw profilesError
      if (!profilesData || profilesData.length === 0) {
        setStudents([])
        return
      }

      const studentIds = profilesData.map((s) => s.id)
      // Traemos status, plan_type y created_at para poder elegir
      // determinísticamente la asignación más reciente y filtrar
      // evaluaciones del badge "plan vigente". Ver pickPrimaryTrainingAssignment.
      const { data: assignmentsData } = await supabase
        .from('plan_assignments')
        .select(
          'student_id, id, active, status, plan_type, created_at, plan:plans(title, plan_type)'
        )
        .in('student_id', studentIds)
        .order('created_at', { ascending: false })

      const assignmentsByStudent = {}
      for (const a of assignmentsData || []) {
        if (!assignmentsByStudent[a.student_id]) {
          assignmentsByStudent[a.student_id] = []
        }
        assignmentsByStudent[a.student_id].push(a)
      }

      const enriched = profilesData.map((s) => ({
        ...s,
        plan_assignments: assignmentsByStudent[s.id] || [],
      }))

      setStudents(enriched)

      // Wellbeing de los últimos 14 días (misma ventana que las alertas de
      // fatiga/estrés del dashboard) para pintar el semáforo de cada fila.
      const today = new Date()
      const since = new Date(today)
      since.setDate(since.getDate() - ALERT_THRESHOLDS.WELLBEING_WINDOW_DAYS)
      const { data: wellbeingData, error: wellbeingError } = await supabase
        .from('wellbeing_logs')
        .select(
          'user_id, date, sleep_quality, nutrition_quality, hydration_quality, energy_level, stress_level, muscle_fatigue, source'
        )
        .in('user_id', studentIds)
        .gte('date', formatYMD(since))
        .lte('date', formatYMD(today))
      // El wellbeing es accesorio: si falla, la lista se muestra igual.
      if (wellbeingError) {
        console.error('[StudentsPage] wellbeing', wellbeingError)
      } else {
        setWellbeingByStudent(summarizeByStudent(wellbeingData || [], { today }))
      }
    } catch (err) {
      console.error('[StudentsPage]', err)
      setFetchError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const levelColor = {
    beginner: 'bg-green-100 text-green-700',
    intermediate: 'bg-yellow-100 text-yellow-700',
    advanced: 'bg-red-100 text-red-700',
  }
  const levelLabel = {
    beginner: 'Principiante',
    intermediate: 'Intermedio',
    advanced: 'Avanzado',
  }

  const byActive = filterByActiveStatus(students, activeFilter)
  const activeCount = students.filter(isProfileActive).length
  const inactiveCount = students.length - activeCount

  const filtered = byActive.filter((s) => {
    const matchSearch =
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase())

    if (!matchSearch) return false

    if (filterStatus === 'all') return true
    if (filterStatus === 'overdue') return getPaymentStatus(s) === 'overdue'
    if (filterStatus === 'due_soon') return getPaymentStatus(s) === 'due_soon'
    if (filterStatus === 'no_plan') return getPlanStatus(s.plan_assignments) === 'no_plan'
    if (filterStatus === 'wellbeing') return wellbeingByStudent.get(s.id)?.status === 'bad'
    return true
  })

  // Contadores de alertas — solo sobre perfiles activos, para que un
  // inactivo no infle las alertas de pago/plan/wellbeing (v40).
  const activeStudents = students.filter(isProfileActive)
  const overdueCount = activeStudents.filter((s) => getPaymentStatus(s) === 'overdue').length
  const dueSoonCount = activeStudents.filter((s) => getPaymentStatus(s) === 'due_soon').length
  const noPlanCount = activeStudents.filter(
    (s) => getPlanStatus(s.plan_assignments) === 'no_plan'
  ).length
  const wellbeingAlertCount = activeStudents.filter(
    (s) => wellbeingByStudent.get(s.id)?.status === 'bad'
  ).length

  // v40: activar/desactivar sin entrar a la ficha. Mismo par
  // update+historial que StudentInfoTab para que quede auditado.
  async function handleToggleActive(student) {
    const makeInactive = isProfileActive(student)
    if (makeInactive) {
      const ok = window.confirm(
        `¿Marcar a ${student.name} como inactivo?\n\nDeja de aparecer en la lista, el calendario, las alertas y los selectores del coach. Su cuenta y su historial no se tocan, y podés reactivarlo cuando quieras.`
      )
      if (!ok) return
    }
    setTogglingId(student.id)
    try {
      const newActive = !makeInactive
      const { error } = await supabase
        .from('profiles')
        .update({ active: newActive })
        .eq('id', student.id)
      if (error) throw error
      await supabase.from('student_edit_history').insert({
        student_id: student.id,
        changed_by: profile?.id,
        field_name: 'active',
        old_value: makeInactive ? 'Activo' : 'Inactivo',
        new_value: newActive ? 'Activo' : 'Inactivo',
      })
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, active: newActive } : s))
      )
    } catch (err) {
      console.error('[StudentsPage] toggle active', err)
      window.alert(err.message || 'No se pudo cambiar el estado')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alumnos</h1>
          <p className="text-sm text-gray-500">
            {activeCount} activo{activeCount !== 1 ? 's' : ''}
            {inactiveCount > 0 ? ` · ${inactiveCount} inactivo${inactiveCount !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <Link to="/coach/students/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span className="hidden sm:inline">Nuevo alumno</span>
        </Link>
      </div>

      {/* v40: filtro de estado del perfil (default: solo activos) */}
      <div className="flex items-center gap-2">
        {[
          { key: 'active', label: `Activos (${activeCount})` },
          { key: 'inactive', label: `Inactivos (${inactiveCount})` },
          { key: 'all', label: 'Todos' },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => setActiveFilter(opt.key)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
              activeFilter === opt.key
                ? 'bg-primary-100 text-primary-700 border-primary-300'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Alertas rápidas de gestión */}
      {!loading &&
        (overdueCount > 0 || dueSoonCount > 0 || noPlanCount > 0 || wellbeingAlertCount > 0) && (
          <div className="flex flex-wrap gap-2">
            {overdueCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                  filterStatus === 'overdue'
                    ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                }`}
              >
                🔴 {overdueCount} pago{overdueCount !== 1 ? 's' : ''} vencido
                {overdueCount !== 1 ? 's' : ''}
              </button>
            )}
            {dueSoonCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === 'due_soon' ? 'all' : 'due_soon')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                  filterStatus === 'due_soon'
                    ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                    : 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-100'
                }`}
              >
                🟡 {dueSoonCount} vence{dueSoonCount !== 1 ? 'n' : ''} pronto
              </button>
            )}
            {noPlanCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === 'no_plan' ? 'all' : 'no_plan')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                  filterStatus === 'no_plan'
                    ? 'bg-gray-200 text-gray-700 border-gray-400'
                    : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                }`}
              >
                ⚪ {noPlanCount} sin plan
              </button>
            )}
            {wellbeingAlertCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === 'wellbeing' ? 'all' : 'wellbeing')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                  filterStatus === 'wellbeing'
                    ? 'bg-orange-100 text-orange-700 border-orange-300'
                    : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
                }`}
                title="Fatiga, energía baja o estrés alto sostenidos en los últimos 14 días"
              >
                🟠 {wellbeingAlertCount} con wellbeing en alerta
              </button>
            )}
          </div>
        )}

      {/* Búsqueda */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Buscar alumno..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Error */}
      {fetchError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No hay alumnos</p>
          <p className="text-gray-400 text-sm mt-1">
            {search || filterStatus !== 'all' || activeFilter !== 'active'
              ? 'Ningún resultado para tu búsqueda o filtros'
              : 'Creá tu primer alumno'}
          </p>
          {!search && filterStatus === 'all' && activeFilter === 'active' && (
            <Link
              to="/coach/students/new"
              className="btn-primary inline-flex items-center gap-2 mt-4"
            >
              <Plus size={16} /> Agregar alumno
            </Link>
          )}
          {(filterStatus !== 'all' || activeFilter !== 'all') && (
            <button
              onClick={() => {
                setFilterStatus('all')
                setActiveFilter('all')
              }}
              className="btn-secondary text-sm mt-3"
            >
              Ver todos
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((student) => {
            // Plan "primario" para mostrar en el badge: el training activo
            // más reciente; si no hay activo, el pausado; si no hay nada, null.
            // pickPrimaryTrainingAssignment ignora evaluaciones a propósito
            // — la pestaña Evaluaciones es donde se ven esas.
            const primaryAssignment = pickPrimaryTrainingAssignment(student.plan_assignments)
            const primaryStatus = getAssignmentStatus(primaryAssignment)
            const primaryStatusCfg = primaryStatus ? statusConfig(primaryStatus) : null
            const initials = student.name
              ?.split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()
            const payStatus = getPaymentStatus(student)
            const payConfig = PAYMENT_STATUS[payStatus]
            const planStatus = getPlanStatus(student.plan_assignments)
            const planConfig = PLAN_STATUS[planStatus]
            const studentActive = isProfileActive(student)

            return (
              <Link
                key={student.id}
                to={`/coach/students/${student.id}`}
                className={`card hover:shadow-md transition-all flex items-center gap-3 active:scale-[0.98] ${
                  studentActive ? '' : 'opacity-60'
                }`}
              >
                {/* Avatar con indicador de pago */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">{initials}</span>
                  </div>
                  {(payStatus === 'overdue' || payStatus === 'due_soon') && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${payConfig.dotClass}`}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{student.name}</p>
                    {!studentActive && (
                      <span className="badge bg-gray-200 text-gray-600 text-xs">Inactivo</span>
                    )}
                    {student.level && (
                      <span className={`badge ${levelColor[student.level]}`}>
                        {levelLabel[student.level]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {primaryAssignment ? (
                      <span
                        className={`badge text-xs flex items-center gap-1 ${primaryStatusCfg.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${primaryStatusCfg.dotClass}`} />
                        {primaryAssignment.plan?.title}
                        {primaryStatus !== 'active' && (
                          <span className="ml-1 text-[10px] opacity-75">
                            · {primaryStatusCfg.shortLabel}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span
                        className={`badge text-xs flex items-center gap-1 ${planConfig.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${planConfig.dotClass}`} />
                        {planConfig.label}
                      </span>
                    )}
                    {payStatus !== 'no_data' && payStatus !== 'up_to_date' && (
                      <span className={`badge text-xs ${payConfig.badgeClass}`}>
                        {payConfig.label}
                      </span>
                    )}
                    <WellbeingStatusBadge summary={wellbeingByStudent.get(student.id)} />
                  </div>
                </div>

                {/* v40: activar/desactivar sin entrar a la ficha */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleToggleActive(student)
                  }}
                  disabled={togglingId === student.id}
                  title={studentActive ? 'Marcar como inactivo' : 'Reactivar'}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex-shrink-0 disabled:opacity-40"
                >
                  {studentActive ? <UserX size={16} /> : <UserCheck size={16} />}
                </button>
                <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
