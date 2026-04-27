import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { ClipboardList, Plus, AlertTriangle, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'

// ─────────────────────────────────────────────────────────────
// StudentPlansTab
// Props:
//   assignments - lista de plan_assignments del alumno
//   allPlans    - todos los planes disponibles (para el select)
//   studentId   - UUID del alumno
//   onRefresh   - callback para recargar datos en el padre
// ─────────────────────────────────────────────────────────────
export default function StudentPlansTab({ assignments, allPlans, studentId, onRefresh }) {
  const [assigningPlan, setAssigningPlan] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('')

  // Modal de vigencia del plan
  const [showPlanValidityModal, setShowPlanValidityModal] = useState(false)
  const [pendingTrainingAssignment, setPendingTrainingAssignment] = useState(null)
  const [pendingEvalPlanId, setPendingEvalPlanId] = useState(null)

  async function assignPlan() {
    if (!selectedPlan) return

    const selectedPlanData = allPlans.find(p => p.id === selectedPlan)

    // Si es una evaluación y hay un plan de entrenamiento activo, preguntar
    if (selectedPlanData?.plan_type === 'evaluation') {
      const activeTrainingAssignment = assignments.find(
        a => a.active && (!a.plan?.plan_type || a.plan?.plan_type === 'training')
      )
      if (activeTrainingAssignment) {
        setPendingTrainingAssignment(activeTrainingAssignment)
        setPendingEvalPlanId(selectedPlan)
        setShowPlanValidityModal(true)
        return
      }
    }

    await doAssignPlan(null, selectedPlan, true)
  }

  async function doAssignPlan(trainingAssignment, evalPlanId, keepTraining) {
    try {
      // Si el coach dijo que el plan ya no está vigente, desactivarlo
      if (!keepTraining && trainingAssignment) {
        await supabase
          .from('plan_assignments')
          .update({ active: false })
          .eq('id', trainingAssignment.id)
      }

      const { error } = await supabase.from('plan_assignments').insert({
        plan_id: evalPlanId,
        student_id: studentId,
        start_date: format(new Date(), 'yyyy-MM-dd'),
        active: true,
      })
      if (error) throw error

      setAssigningPlan(false)
      setSelectedPlan('')
      setShowPlanValidityModal(false)
      setPendingTrainingAssignment(null)
      setPendingEvalPlanId(null)
      onRefresh()
    } catch (err) {
      console.error(err)
    }
  }

  async function toggleAssignment(assignmentId, currentActive) {
    await supabase
      .from('plan_assignments')
      .update({ active: !currentActive })
      .eq('id', assignmentId)
    onRefresh()
  }

  return (
    <div className="space-y-3">
      {/* Modal: ¿el plan de entrenamiento sigue vigente? */}
      {showPlanValidityModal && pendingTrainingAssignment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle size={18} className="text-amber-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">¿El plan sigue vigente?</p>
                <p className="text-sm text-gray-500 mt-1">
                  El alumno tiene el plan <span className="font-medium text-gray-700">"{pendingTrainingAssignment.plan?.title}"</span> activo.
                  ¿Continúa vigente junto con la evaluación?
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => doAssignPlan(pendingTrainingAssignment, pendingEvalPlanId, false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                No, pausarlo
              </button>
              <button
                onClick={() => doAssignPlan(pendingTrainingAssignment, pendingEvalPlanId, true)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
              >
                Sí, mantenerlo
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Planes asignados</h3>
        <button
          onClick={() => setAssigningPlan(true)}
          className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
        >
          <Plus size={14} /> Asignar plan
        </button>
      </div>

      {assigningPlan && (
        <div className="card border-2 border-primary-200 space-y-3">
          <h4 className="font-medium text-gray-900">Asignar nuevo plan</h4>
          <select
            value={selectedPlan}
            onChange={e => setSelectedPlan(e.target.value)}
            className="input"
          >
            <option value="">Seleccioná un plan...</option>
            {allPlans.map(p => (
              <option key={p.id} value={p.id}>
                {p.plan_type === 'evaluation' ? '📊 ' : ''}{p.title}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={() => setAssigningPlan(false)} className="btn-secondary flex-1 text-sm">
              Cancelar
            </button>
            <button onClick={assignPlan} disabled={!selectedPlan} className="btn-primary flex-1 text-sm">
              Asignar
            </button>
          </div>
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="card text-center py-8 text-gray-400">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin planes asignados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map(a => {
            const isEval = a.plan?.plan_type === 'evaluation'
            const planRoute = isEval
              ? `/coach/evaluations/${a.plan_id}`
              : `/coach/plans/${a.plan_id}`

            return (
              <div key={a.id} className="card flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${a.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                <Link
                  to={planRoute}
                  className="flex-1 min-w-0 group flex items-center gap-1 hover:opacity-70 transition-opacity"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {isEval ? '📊 ' : ''}{a.plan?.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {a.active ? 'Activo' : 'Inactivo'}
                      {a.start_date ? ` · Desde ${format(parseISO(a.start_date), 'dd/MM/yy')}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
                <button
                  onClick={() => toggleAssignment(a.id, a.active)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    a.active
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  {a.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
