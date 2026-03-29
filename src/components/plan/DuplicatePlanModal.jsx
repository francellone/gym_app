import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { EVAL_TYPES, evalTypeIcon } from '../../utils/evalHelpers'
import { X, Copy, Dumbbell, BarChart2, ArrowRight, Loader } from 'lucide-react'

// Two-step modal:
// Step 1: Choose name + type (training / evaluation)
// Step 2 (if evaluation): choose eval_type category

export default function DuplicatePlanModal({ plan, onClose, onDone }) {
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState(`${plan.title} (copia)`)
  const [planType, setPlanType] = useState('training')
  const [evalType, setEvalType] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleDuplicate() {
    if (planType === 'evaluation' && !evalType) {
      setError('Seleccioná un tipo de evaluación')
      return
    }
    setError(null)
    setLoading(true)
    try {
      // 1. Clone plan row
      const newPlanData = {
        title: title.trim() || `${plan.title} (copia)`,
        description: plan.description,
        sessions_per_week: plan.sessions_per_week,
        is_template: false,
        plan_type: planType,
        eval_type: planType === 'evaluation' ? evalType : null,
      }

      const { data: newPlan, error: planError } = await supabase
        .from('plans')
        .insert(newPlanData)
        .select()
        .single()
      if (planError) throw planError

      // 2. Clone exercises (keep structure, works for both training + eval reference protocol)
      const { data: exercises } = await supabase
        .from('plan_exercises')
        .select('*')
        .eq('plan_id', plan.id)

      if (exercises?.length) {
        await supabase.from('plan_exercises').insert(
          exercises.map(e => ({
            ...e,
            id: undefined,
            plan_id: newPlan.id,
            created_at: undefined,
            updated_at: undefined,
          }))
        )
      }

      onDone(newPlan)
    } catch (err) {
      setError(err.message || 'Error al duplicar el plan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Copy size={18} className="text-primary-600" />
            <h2 className="font-bold text-gray-900">Duplicar plan</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step >= 1 ? 'text-primary-600' : 'text-gray-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}`}>1</span>
            Nombre y tipo
          </div>
          <div className="flex-1 h-px bg-gray-200" />
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step >= 2 ? 'text-primary-600' : 'text-gray-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2</span>
            Categoría
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Step 1 */}
          {step === 1 && (
            <>
              {/* Title */}
              <div>
                <label className="label">Nombre del nuevo plan</label>
                <input
                  className="input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Nombre del plan..."
                  autoFocus
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="label">Tipo de plan</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPlanType('training')}
                    className={`rounded-2xl border-2 p-4 flex flex-col items-center gap-2 text-left transition-all ${
                      planType === 'training'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Dumbbell size={24} className={planType === 'training' ? 'text-primary-600' : 'text-gray-400'} />
                    <div>
                      <p className={`text-sm font-semibold ${planType === 'training' ? 'text-primary-700' : 'text-gray-700'}`}>
                        Entrenamiento
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Rutina de ejercicios regular</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlanType('evaluation')}
                    className={`rounded-2xl border-2 p-4 flex flex-col items-center gap-2 text-left transition-all ${
                      planType === 'evaluation'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <BarChart2 size={24} className={planType === 'evaluation' ? 'text-purple-600' : 'text-gray-400'} />
                    <div>
                      <p className={`text-sm font-semibold ${planType === 'evaluation' ? 'text-purple-700' : 'text-gray-700'}`}>
                        Evaluación
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Protocolo de evaluación</p>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <label className="label">Tipo de evaluación</label>
              <div className="space-y-2">
                {EVAL_TYPES.map(et => (
                  <button
                    key={et.key}
                    type="button"
                    onClick={() => setEvalType(et.key)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      evalType === et.key
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-xl">{et.icon}</span>
                    <div>
                      <p className={`text-sm font-semibold ${evalType === et.key ? 'text-purple-700' : 'text-gray-700'}`}>
                        {et.label}
                      </p>
                      <p className="text-xs text-gray-400">{et.description}</p>
                    </div>
                    {evalType === et.key && (
                      <div className="ml-auto w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            {step === 2 && (
              <button
                type="button"
                onClick={() => { setStep(1); setError(null) }}
                className="btn-secondary flex-1"
              >
                Atrás
              </button>
            )}
            {step === 1 && planType === 'evaluation' ? (
              <button
                type="button"
                onClick={() => { if (!title.trim()) { setError('Ingresá un nombre'); return }; setError(null); setStep(2) }}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                Siguiente
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={loading}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader size={16} className="animate-spin" />
                ) : (
                  <><Copy size={16} /> Duplicar</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
