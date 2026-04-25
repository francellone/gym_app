import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ClipboardList, Plus, Search, ChevronRight, Copy, BarChart2, Trash2 } from 'lucide-react'
import DuplicatePlanModal from '../../components/plan/DuplicatePlanModal'
import DeletePlanModal from '../../components/DeletePlanModal'
import { evalTypeColor, evalTypeIcon } from '../../utils/evalHelpers'

export default function PlansPage() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [duplicatingPlan, setDuplicatingPlan] = useState(null)
  const [filterType, setFilterType] = useState('all') // 'all' | 'training' | 'evaluation'
  const [deletingPlan, setDeletingPlan] = useState(null) // { plan, activeStudents, resultCount }

  useEffect(() => { fetchPlans() }, [])

  async function fetchPlans() {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select(`
          *,
          plan_exercises(id),
          plan_assignments(id, active, student:profiles!student_id(name))
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      setPlans(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleOpenDelete(plan) {
    const activeStudents = plan.plan_assignments?.filter(a => a.active).length || 0
    let resultCount = 0
    if (plan.plan_type === 'evaluation') {
      const { count } = await supabase
        .from('evaluation_results')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', plan.id)
      resultCount = count || 0
    }
    setDeletingPlan({ plan, activeStudents, resultCount })
  }

  async function handleDeletePlan(planId) {
    const { error } = await supabase.from('plans').delete().eq('id', planId)
    if (error) throw error
    setDeletingPlan(null)
    setPlans(prev => prev.filter(p => p.id !== planId))
  }

  function handleDuplicateDone(newPlan) {
    setDuplicatingPlan(null)
    if (newPlan.plan_type === 'evaluation') {
      navigate(`/coach/evaluations/${newPlan.id}`)
    } else {
      navigate(`/coach/plans/${newPlan.id}/edit`)
    }
  }

  const filtered = plans.filter(p => {
    const matchSearch = p.title?.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || (p.plan_type || 'training') === filterType
    return matchSearch && matchType
  })

  const trainingCount = plans.filter(p => !p.plan_type || p.plan_type === 'training').length
  const evalCount = plans.filter(p => p.plan_type === 'evaluation').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planes</h1>
          <p className="text-sm text-gray-500">{plans.length} planes en total</p>
        </div>
        <Link to="/coach/plans/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span className="hidden sm:inline">Nuevo plan</span>
        </Link>
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {[
          { key: 'all', label: 'Todos', count: plans.length },
          { key: 'training', label: 'Entrenamiento', count: trainingCount },
          { key: 'evaluation', label: 'Evaluación', count: evalCount },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterType(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              filterType === tab.key
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.key === 'evaluation' && <BarChart2 size={13} />}
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.key === 'all' ? 'Todos' : tab.key === 'training' ? 'Entr.' : 'Eval.'}</span>
            <span className={`text-xs ${filterType === tab.key ? 'text-gray-500' : 'text-gray-400'}`}>
              ({tab.count})
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Buscar plan..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No hay planes</p>
          <Link to="/coach/plans/new" className="btn-primary inline-flex items-center gap-2 mt-4">
            <Plus size={16} />
            Crear plan
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(plan => {
            const activeAssignments = plan.plan_assignments?.filter(a => a.active) || []
            const isEval = plan.plan_type === 'evaluation'

            return (
              <div key={plan.id} className="card">
                <div className="flex items-start gap-3">
                  <Link
                    to={isEval ? `/coach/evaluations/${plan.id}` : `/coach/plans/${plan.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{plan.title}</p>
                      {plan.is_template && (
                        <span className="badge bg-purple-100 text-purple-700">Plantilla</span>
                      )}
                      {isEval && plan.eval_type && (
                        <span className={`badge ${evalTypeColor(plan.eval_type)}`}>
                          {evalTypeIcon(plan.eval_type)} Evaluación
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isEval ? 'Protocolo de evaluación' : `${plan.plan_exercises?.length || 0} ejercicios`}
                      {plan.sessions_per_week && !isEval ? ` · ${plan.sessions_per_week} días/sem` : ''}
                      {activeAssignments.length > 0
                        ? ` · ${activeAssignments.length} alumno${activeAssignments.length > 1 ? 's' : ''}`
                        : ''}
                    </p>
                    {plan.description && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{plan.description}</p>
                    )}
                  </Link>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setDuplicatingPlan(plan)}
                      className="btn-ghost p-2 text-gray-500"
                      title="Duplicar plan"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      onClick={() => handleOpenDelete(plan)}
                      className="btn-ghost p-2 text-gray-400 hover:text-red-500"
                      title="Eliminar plan"
                    >
                      <Trash2 size={16} />
                    </button>
                    <Link
                      to={isEval ? `/coach/evaluations/${plan.id}` : `/coach/plans/${plan.id}`}
                      className="btn-ghost p-2"
                    >
                      <ChevronRight size={16} className="text-gray-400" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Duplicate modal */}
      {duplicatingPlan && (
        <DuplicatePlanModal
          plan={duplicatingPlan}
          onClose={() => setDuplicatingPlan(null)}
          onDone={handleDuplicateDone}
        />
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
    </div>
  )
}
