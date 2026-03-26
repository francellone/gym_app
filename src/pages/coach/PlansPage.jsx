import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ClipboardList, Plus, Search, ChevronRight, Copy, Trash2 } from 'lucide-react'

export default function PlansPage() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

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

  async function clonePlan(plan) {
    try {
      // Clone plan
      const { data: newPlan, error } = await supabase
        .from('plans')
        .insert({ ...plan, id: undefined, title: `${plan.title} (copia)`, created_at: undefined })
        .select()
        .single()
      if (error) throw error

      // Clone exercises
      const { data: exercises } = await supabase
        .from('plan_exercises')
        .select('*')
        .eq('plan_id', plan.id)

      if (exercises?.length) {
        await supabase.from('plan_exercises').insert(
          exercises.map(e => ({ ...e, id: undefined, plan_id: newPlan.id, created_at: undefined }))
        )
      }

      fetchPlans()
    } catch (err) {
      console.error(err)
    }
  }

  const filtered = plans.filter(p =>
    p.title?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planes</h1>
          <p className="text-sm text-gray-500">{plans.length} planes</p>
        </div>
        <Link to="/coach/plans/new" className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          <span className="hidden sm:inline">Nuevo plan</span>
        </Link>
      </div>

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

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
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
            return (
              <div key={plan.id} className="card">
                <div className="flex items-start gap-3">
                  <Link to={`/coach/plans/${plan.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{plan.title}</p>
                      {plan.is_template && (
                        <span className="badge bg-purple-100 text-purple-700">Plantilla</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {plan.plan_exercises?.length || 0} ejercicios
                      {plan.sessions_per_week ? ` · ${plan.sessions_per_week} días/sem` : ''}
                      {activeAssignments.length > 0 ? ` · ${activeAssignments.length} alumno${activeAssignments.length > 1 ? 's' : ''}` : ''}
                    </p>
                    {plan.description && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{plan.description}</p>
                    )}
                  </Link>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => clonePlan(plan)}
                      className="btn-ghost p-2 text-gray-500"
                      title="Clonar plan"
                    >
                      <Copy size={16} />
                    </button>
                    <Link to={`/coach/plans/${plan.id}`} className="btn-ghost p-2">
                      <ChevronRight size={16} className="text-gray-400" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
