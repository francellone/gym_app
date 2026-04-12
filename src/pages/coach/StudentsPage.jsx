import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Users, Plus, Search, ChevronRight, AlertCircle } from 'lucide-react'
import { getPaymentStatus, getPlanStatus, PAYMENT_STATUS, PLAN_STATUS } from '../../utils/studentStatus'

export default function StudentsPage() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fetchError, setFetchError] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')

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

      const studentIds = profilesData.map(s => s.id)
      const { data: assignmentsData } = await supabase
        .from('plan_assignments')
        .select('student_id, id, active, plan:plans(title)')
        .in('student_id', studentIds)

      const assignmentsByStudent = {}
      for (const a of assignmentsData || []) {
        if (!assignmentsByStudent[a.student_id]) {
          assignmentsByStudent[a.student_id] = []
        }
        assignmentsByStudent[a.student_id].push(a)
      }

      const enriched = profilesData.map(s => ({
        ...s,
        plan_assignments: assignmentsByStudent[s.id] || [],
      }))

      setStudents(enriched)
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

  // Filtros de estado
  const STATUS_FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'overdue', label: 'Pago vencido' },
    { id: 'due_soon', label: 'Vence pronto' },
    { id: 'no_plan', label: 'Sin plan' },
  ]

  const filtered = students.filter(s => {
    const matchSearch = s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase())

    if (!matchSearch) return false

    if (filterStatus === 'all') return true
    if (filterStatus === 'overdue') return getPaymentStatus(s) === 'overdue'
    if (filterStatus === 'due_soon') return getPaymentStatus(s) === 'due_soon'
    if (filterStatus === 'no_plan') return getPlanStatus(s.plan_assignments) === 'no_plan'
    return true
  })

  // Contadores de alertas
  const overdueCount = students.filter(s => getPaymentStatus(s) === 'overdue').length
  const dueSoonCount = students.filter(s => getPaymentStatus(s) === 'due_soon').length
  const noPlanCount = students.filter(s => getPlanStatus(s.plan_assignments) === 'no_plan').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alumnos</h1>
          <p className="text-sm text-gray-500">{students.length} registrados</p>
        </div>
        <Link to="/coach/students/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span className="hidden sm:inline">Nuevo alumno</span>
        </Link>
      </div>

      {/* Alertas rápidas de gestión */}
      {!loading && (overdueCount > 0 || dueSoonCount > 0 || noPlanCount > 0) && (
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
              🔴 {overdueCount} pago{overdueCount !== 1 ? 's' : ''} vencido{overdueCount !== 1 ? 's' : ''}
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
          onChange={e => setSearch(e.target.value)}
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
          {[1, 2, 3, 4].map(i => (
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
            {search || filterStatus !== 'all'
              ? 'Ningún resultado para tu búsqueda'
              : 'Creá tu primer alumno'}
          </p>
          {!search && filterStatus === 'all' && (
            <Link to="/coach/students/new" className="btn-primary inline-flex items-center gap-2 mt-4">
              <Plus size={16} /> Agregar alumno
            </Link>
          )}
          {filterStatus !== 'all' && (
            <button
              onClick={() => setFilterStatus('all')}
              className="btn-secondary text-sm mt-3"
            >
              Ver todos
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(student => {
            const activePlan = student.plan_assignments?.find(a => a.active)
            const initials = student.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
            const payStatus = getPaymentStatus(student)
            const payConfig = PAYMENT_STATUS[payStatus]
            const planStatus = getPlanStatus(student.plan_assignments)
            const planConfig = PLAN_STATUS[planStatus]

            return (
              <Link
                key={student.id}
                to={`/coach/students/${student.id}`}
                className="card hover:shadow-md transition-all flex items-center gap-3 active:scale-[0.98]"
              >
                {/* Avatar con indicador de pago */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">{initials}</span>
                  </div>
                  {(payStatus === 'overdue' || payStatus === 'due_soon') && (
                    <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${payConfig.dotClass}`} />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{student.name}</p>
                    {student.level && (
                      <span className={`badge ${levelColor[student.level]}`}>
                        {levelLabel[student.level]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`badge text-xs flex items-center gap-1 ${planConfig.badgeClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${planConfig.dotClass}`} />
                      {activePlan ? activePlan.plan?.title : planConfig.label}
                    </span>
                    {payStatus !== 'no_data' && payStatus !== 'up_to_date' && (
                      <span className={`badge text-xs ${payConfig.badgeClass}`}>
                        {payConfig.label}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
