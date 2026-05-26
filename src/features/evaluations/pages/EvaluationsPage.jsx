import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { EVAL_TYPES, evalTypeColor, evalTypeIcon } from '../helpers'
import {
  BarChart2,
  Plus,
  Users,
  ChevronRight,
  Search,
  Trash2,
  UserPlus,
  Check,
  X,
} from 'lucide-react'
import DeletePlanModal from '@/features/plans/components/DeletePlanModal'
import { assignTemplateToStudent } from '@/features/plans/assignmentHelpers'

export default function EvaluationsPage() {
  const [evalPlans, setEvalPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [deletingPlan, setDeletingPlan] = useState(null) // { plan, activeStudents, resultCount }

  // Bug 1 doc 32 (2026-05-26): asignar evaluación a un alumno desde
  // la lista. Antes había que ir al perfil del alumno → tab Evaluaciones.
  // El flow nuevo reutiliza el helper assignTemplateToStudent (mismo que
  // usa StudentEvaluationsTab) y solo cambia el "origen" de la acción.
  const [assigningPlan, setAssigningPlan] = useState(null) // template a asignar

  useEffect(() => {
    fetchEvalPlans()
  }, [])

  async function fetchEvalPlans() {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select(
          `
          *,
          plan_assignments(id, active, student:profiles!student_id(id, name)),
          evaluation_results(id, student_id, eval_date)
        `
        )
        .eq('plan_type', 'evaluation')
        .order('created_at', { ascending: false })
      if (error) throw error
      setEvalPlans(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenDelete(plan) {
    const activeStudents = plan.plan_assignments?.filter((a) => a.active).length || 0
    const resultCount = plan.evaluation_results?.length || 0
    setDeletingPlan({ plan, activeStudents, resultCount })
  }

  async function handleDeletePlan(planId) {
    const { error } = await supabase.from('plans').delete().eq('id', planId)
    if (error) throw error
    setDeletingPlan(null)
    setEvalPlans((prev) => prev.filter((p) => p.id !== planId))
  }

  const filtered = evalPlans.filter((p) => {
    const matchSearch = p.title?.toLowerCase().includes(search.toLowerCase())
    const matchType = !filterType || p.eval_type === filterType
    return matchSearch && matchType
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evaluaciones</h1>
          <p className="text-sm text-gray-500">{evalPlans.length} planes de evaluación</p>
        </div>
        <Link to="/coach/plans/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span className="hidden sm:inline">Nueva evaluación</span>
        </Link>
      </div>

      {/* Eval type summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {EVAL_TYPES.slice(0, 4).map((et) => {
          const count = evalPlans.filter((p) => p.eval_type === et.key).length
          return (
            <button
              key={et.key}
              onClick={() => setFilterType(filterType === et.key ? '' : et.key)}
              className={`card text-left transition-all ${filterType === et.key ? 'ring-2 ring-primary-500' : ''}`}
            >
              <span className="text-xl">{et.icon}</span>
              <p className="text-xs font-medium text-gray-700 mt-1 leading-tight">{et.label}</p>
              <p className="text-lg font-bold text-gray-900">{count}</p>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Buscar evaluación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {EVAL_TYPES.map((et) => (
            <option key={et.key} value={et.key}>
              {et.icon} {et.label}
            </option>
          ))}
        </select>
      </div>

      {/* Plans list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <BarChart2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {evalPlans.length === 0
              ? 'No hay planes de evaluación todavía'
              : 'Sin resultados para esos filtros'}
          </p>
          <p className="text-sm text-gray-400 mt-1 mb-4">
            Podés crear uno desde "Planes" usando el botón de duplicar
          </p>
          <Link to="/coach/plans" className="btn-secondary inline-flex items-center gap-2">
            Ir a Planes
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((plan) => {
            const activeAssignments = plan.plan_assignments?.filter((a) => a.active) || []
            const lastResult = plan.evaluation_results?.sort(
              (a, b) => new Date(b.eval_date) - new Date(a.eval_date)
            )[0]

            return (
              <div
                key={plan.id}
                className="card flex items-start gap-3 hover:shadow-md transition-shadow"
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">
                  {evalTypeIcon(plan.eval_type)}
                </div>

                {/* Info – clickeable para navegar */}
                <Link to={`/coach/evaluations/${plan.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{plan.title}</p>
                    {plan.eval_type && (
                      <span className={`badge ${evalTypeColor(plan.eval_type)}`}>
                        {EVAL_TYPES.find((e) => e.key === plan.eval_type)?.label || plan.eval_type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {activeAssignments.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={11} />
                        {activeAssignments.length} alumno{activeAssignments.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {lastResult && (
                      <span>
                        Último: {new Date(lastResult.eval_date).toLocaleDateString('es-AR')}
                      </span>
                    )}
                    {plan.description && (
                      <span className="truncate hidden sm:inline">{plan.description}</span>
                    )}
                  </div>
                </Link>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {plan.is_template !== false && (
                    <button
                      onClick={() => setAssigningPlan(plan)}
                      className="btn-ghost p-2 text-gray-400 hover:text-purple-600"
                      title="Asignar a alumno"
                      aria-label="Asignar evaluación a alumno"
                    >
                      <UserPlus size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenDelete(plan)}
                    className="btn-ghost p-2 text-gray-400 hover:text-red-500"
                    title="Eliminar evaluación"
                  >
                    <Trash2 size={16} />
                  </button>
                  <Link to={`/coach/evaluations/${plan.id}`} className="btn-ghost p-2">
                    <ChevronRight size={16} className="text-gray-400" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {/* Delete modal */}
      {deletingPlan && (
        <DeletePlanModal
          plan={deletingPlan.plan}
          activeStudents={deletingPlan.activeStudents}
          resultCount={deletingPlan.resultCount}
          onClose={() => setDeletingPlan(null)}
          onConfirm={handleDeletePlan}
        />
      )}

      {/* Assign-to-student modal — Bug 1 doc 32 */}
      {assigningPlan && (
        <AssignEvalToStudentModal
          plan={assigningPlan}
          onClose={() => setAssigningPlan(null)}
          onDone={() => {
            setAssigningPlan(null)
            fetchEvalPlans()
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AssignEvalToStudentModal — Bug 1 doc 32 (2026-05-26)
// Carga lista de alumnos al abrir (lazy), permite elegir uno
// y llama a la RPC assign_template_to_student vía el helper.
// ─────────────────────────────────────────────────────────────
function AssignEvalToStudentModal({ plan, onClose, onDone }) {
  const [students, setStudents] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function fetchStudents() {
      try {
        const { data, error: e } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('role', 'student')
          .order('name')
        if (e) throw e
        if (!cancelled) setStudents(data || [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Error cargando alumnos')
      } finally {
        if (!cancelled) setLoadingStudents(false)
      }
    }
    fetchStudents()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAssign() {
    if (!selectedStudentId) return
    setAssignLoading(true)
    setError(null)
    try {
      await assignTemplateToStudent(supabase, {
        templateId: plan.id,
        studentId: selectedStudentId,
        startDate: new Date().toISOString().slice(0, 10),
      })
      onDone()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Error al asignar la evaluación')
    } finally {
      setAssignLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">Asignar evaluación</h3>
            <p className="text-sm text-gray-600 mt-0.5 truncate">{plan.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            type="button"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="label text-xs">Alumno</label>
          {loadingStudents ? (
            <div className="h-10 bg-gray-50 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : students.length === 0 ? (
            <p className="text-sm text-gray-500">No hay alumnos cargados todavía.</p>
          ) : (
            <select
              className="input text-sm"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              <option value="">— Seleccionar alumno —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.email}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2">
            {error}
          </p>
        )}

        <p className="text-xs text-gray-500">
          Para vincularla a un plan del alumno (opcional), usá la pestaña Evaluaciones dentro del
          perfil.
        </p>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={assignLoading}
            className="btn-secondary flex-1 text-sm"
            type="button"
          >
            Cancelar
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedStudentId || assignLoading || loadingStudents}
            className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
            type="button"
          >
            {assignLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Check size={14} /> Asignar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
