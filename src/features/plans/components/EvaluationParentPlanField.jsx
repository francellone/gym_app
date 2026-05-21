import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Link2, ExternalLink } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// EvaluationParentPlanField
//
// Se muestra dentro de la edición/creación de una evaluación.
// Permite declarar que la evaluación es parte de un plan de training
// (parent_plan_id) o dejarla independiente.
//
// Props:
//   value      - parent_plan_id actual (string | null)
//   onChange   - callback(newParentPlanId | null)
//   excludeId  - id del plan actual (para no permitir auto-referencia)
// ─────────────────────────────────────────────────────────────
export default function EvaluationParentPlanField({ value, onChange, excludeId }) {
  const [trainingPlans, setTrainingPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('plans')
        .select('id, title')
        .or('plan_type.eq.training,plan_type.is.null')
        .order('title')
      if (cancelled) return
      const filtered = (data || []).filter((p) => p.id !== excludeId)
      setTrainingPlans(filtered)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [excludeId])

  return (
    <div>
      <label className="label flex items-center gap-1.5">
        <Link2 size={13} className="text-purple-500" />
        Plan asociado (opcional)
      </label>
      <select
        className="input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={loading}
      >
        <option value="">Independiente (no pertenece a un plan)</option>
        {trainingPlans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-400 mt-1">
        Si la evaluación es parte de un plan específico, asociála acá. Cuando le asignes ese plan a
        un alumno, vamos a sugerirte asignar también esta evaluación.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// EvaluationsLinkedPanel
//
// Se muestra dentro de la edición de un plan de TRAINING.
// Lista las evaluaciones que tienen parent_plan_id = este plan (read-only).
// Para asociar/des-asociar una evaluación, la coach va al editor de la
// evaluación y cambia el campo "Plan asociado". Hacerlo desde acá sería
// editar otra entidad sin que la coach esté en su contexto.
//
// Props:
//   planId  - id del plan actual (debe ser training)
// ─────────────────────────────────────────────────────────────
export function EvaluationsLinkedPanel({ planId }) {
  const [evals, setEvals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!planId) {
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from('plans')
        .select('id, title, eval_type, eval_tags')
        .eq('parent_plan_id', planId)
        .eq('plan_type', 'evaluation')
        .order('title')
      if (cancelled) return
      setEvals(data || [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [planId])

  if (loading) return null

  return (
    <div className="card space-y-2">
      <div className="flex items-center gap-2">
        <Link2 size={14} className="text-purple-500" />
        <h3 className="font-semibold text-gray-900 text-sm">Evaluaciones asociadas</h3>
      </div>
      {evals.length === 0 ? (
        <p className="text-xs text-gray-400">
          Este plan todavía no tiene evaluaciones asociadas. Para asociar una, editá la evaluación y
          elegí este plan en “Plan asociado”.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {evals.map((ev) => (
            <li key={ev.id}>
              <Link
                to={`/coach/evaluations/${ev.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-100 bg-purple-50 hover:bg-purple-100 transition-colors text-sm"
              >
                <span>📊</span>
                <span className="flex-1 truncate text-purple-800 font-medium">{ev.title}</span>
                <ExternalLink size={13} className="text-purple-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
