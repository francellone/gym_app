import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { ClipboardList, Plus } from 'lucide-react'
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

  async function assignPlan() {
    if (!selectedPlan) return
    try {
      const { error } = await supabase.from('plan_assignments').insert({
        plan_id: selectedPlan,
        student_id: studentId,
        start_date: format(new Date(), 'yyyy-MM-dd'),
        active: true,
      })
      if (error) throw error
      setAssigningPlan(false)
      setSelectedPlan('')
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
          {assignments.map(a => (
            <div key={a.id} className="card flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${a.active ? 'bg-green-400' : 'bg-gray-300'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">
                  {a.plan?.plan_type === 'evaluation' ? '📊 ' : ''}{a.plan?.title}
                </p>
                <p className="text-xs text-gray-500">
                  {a.active ? 'Activo' : 'Inactivo'}
                  {a.start_date ? ` · Desde ${format(parseISO(a.start_date), 'dd/MM/yy')}` : ''}
                </p>
              </div>
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
          ))}
        </div>
      )}
    </div>
  )
}
