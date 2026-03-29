import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Plus, Save, AlertCircle, Dumbbell, BarChart2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import PlanExerciseRow from '../../components/plan/PlanExerciseRow'
import {
  SECTIONS, emptyPlanExercise, uiExToDBEx
} from '../../utils/planHelpers'
import { EVAL_TYPES } from '../../utils/evalHelpers'

export default function CreatePlanPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [exercises, setExercises] = useState([])
  const [exerciseTags, setExerciseTags] = useState([])
  const [tagAssignments, setTagAssignments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [plan, setPlan] = useState({
    title: '',
    description: '',
    goal: '',
    sessions_per_week: 3,
    duration_weeks: '',
    is_template: false,
    plan_type: 'training',
    eval_type: '',
  })

  const [planExercises, setPlanExercises] = useState({
    activation: [],
    day_a: [],
    day_b: [],
  })

  const [activeSection, setActiveSection] = useState('activation')

  useEffect(() => {
    Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('exercise_tags').select('*').order('name'),
      supabase.from('exercise_tag_assignments').select('*'),
    ]).then(([exRes, tagsRes, assignRes]) => {
      setExercises(exRes.data || [])
      setExerciseTags(tagsRes.data || [])
      setTagAssignments(assignRes.data || [])
    })
  }, [])

  function addExercise(section) {
    const newEx = emptyPlanExercise(section)
    newEx.order_index = planExercises[section].length
    setPlanExercises(prev => ({
      ...prev,
      [section]: [...prev[section], newEx],
    }))
  }

  function updateExercise(section, index, field, value) {
    setPlanExercises(prev => ({
      ...prev,
      [section]: prev[section].map((ex, i) =>
        i === index ? { ...ex, [field]: value } : ex
      ),
    }))
  }

  function removeExercise(section, index) {
    setPlanExercises(prev => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== index),
    }))
  }

  async function handleSave() {
    if (!plan.title.trim()) {
      setError('El nombre del plan es obligatorio')
      return
    }
    if (plan.plan_type === 'evaluation' && !plan.eval_type) {
      setError('Seleccioná el tipo de evaluación')
      return
    }
    setError(null)
    setLoading(true)

    try {
      const { data: newPlan, error: planError } = await supabase
        .from('plans')
        .insert({
          title: plan.title,
          description: plan.description,
          goal: plan.goal,
          sessions_per_week: parseInt(plan.sessions_per_week) || 3,
          duration_weeks: plan.duration_weeks ? parseInt(plan.duration_weeks) : null,
          is_template: plan.is_template,
          plan_type: plan.plan_type,
          eval_type: plan.plan_type === 'evaluation' ? plan.eval_type : null,
          created_by: profile.id,
        })
        .select()
        .single()
      if (planError) throw planError

      const allExercises = []
      for (const section of ['activation', 'day_a', 'day_b']) {
        planExercises[section]
          .filter(ex => ex.exercise_id)
          .forEach((ex, i) => {
            allExercises.push(uiExToDBEx(ex, newPlan.id, section, i))
          })
      }

      if (allExercises.length > 0) {
        const { error: exError } = await supabase.from('plan_exercises').insert(allExercises)
        if (exError) throw exError
      }

      navigate(`/coach/plans/${newPlan.id}`)
    } catch (err) {
      setError(err.message || 'Error al guardar el plan')
    } finally {
      setLoading(false)
    }
  }

  const currentExercises = planExercises[activeSection]
  const isEval = plan.plan_type === 'evaluation'

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo plan</h1>
      </div>

      {/* Plan info */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">Información del plan</h2>

        {/* Tipo de plan */}
        <div>
          <label className="label">Tipo de plan</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPlan(p => ({ ...p, plan_type: 'training', eval_type: '' }))}
              className={`rounded-2xl border-2 p-3 flex items-center gap-2 text-left transition-all ${
                plan.plan_type === 'training'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Dumbbell size={18} className={plan.plan_type === 'training' ? 'text-primary-600' : 'text-gray-400'} />
              <div>
                <p className={`text-sm font-semibold ${plan.plan_type === 'training' ? 'text-primary-700' : 'text-gray-700'}`}>
                  Entrenamiento
                </p>
                <p className="text-xs text-gray-400">Rutina regular</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPlan(p => ({ ...p, plan_type: 'evaluation' }))}
              className={`rounded-2xl border-2 p-3 flex items-center gap-2 text-left transition-all ${
                plan.plan_type === 'evaluation'
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <BarChart2 size={18} className={plan.plan_type === 'evaluation' ? 'text-purple-600' : 'text-gray-400'} />
              <div>
                <p className={`text-sm font-semibold ${plan.plan_type === 'evaluation' ? 'text-purple-700' : 'text-gray-700'}`}>
                  Evaluación
                </p>
                <p className="text-xs text-gray-400">Protocolo de test</p>
              </div>
            </button>
          </div>
        </div>

        {/* Tipo de evaluación */}
        {isEval && (
          <div>
            <label className="label">Categoría de evaluación</label>
            <div className="space-y-1.5">
              {EVAL_TYPES.map(et => (
                <button
                  key={et.key}
                  type="button"
                  onClick={() => setPlan(p => ({ ...p, eval_type: et.key }))}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    plan.eval_type === et.key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{et.icon}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${plan.eval_type === et.key ? 'text-purple-700' : 'text-gray-700'}`}>
                      {et.label}
                    </p>
                    <p className="text-xs text-gray-400">{et.description}</p>
                  </div>
                  {plan.eval_type === et.key && (
                    <div className="w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Nombre del plan *</label>
            <input
              className="input"
              placeholder="Plan 1 - Iniciación"
              value={plan.title}
              onChange={e => setPlan(p => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Descripción del plan..."
              value={plan.description}
              onChange={e => setPlan(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          {!isEval && (
            <>
              <div>
                <label className="label">Objetivo</label>
                <input
                  className="input"
                  placeholder="Fuerza, hipertrofia..."
                  value={plan.goal}
                  onChange={e => setPlan(p => ({ ...p, goal: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Días por semana</label>
                <input
                  type="number" min="1" max="7" className="input"
                  value={plan.sessions_per_week}
                  onChange={e => setPlan(p => ({ ...p, sessions_per_week: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Duración (semanas)</label>
                <input
                  type="number" className="input" placeholder="Opcional"
                  value={plan.duration_weeks}
                  onChange={e => setPlan(p => ({ ...p, duration_weeks: e.target.value }))}
                />
              </div>
            </>
          )}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox" id="is_template"
              className="w-4 h-4 rounded text-primary-600"
              checked={plan.is_template}
              onChange={e => setPlan(p => ({ ...p, is_template: e.target.checked }))}
            />
            <label htmlFor="is_template" className="text-sm text-gray-700 cursor-pointer">
              Guardar como plantilla reutilizable
            </label>
          </div>
        </div>
      </div>

      {/* Ejercicios */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-900">
          {isEval ? 'Ejercicios / Protocolo' : 'Ejercicios'}
        </h2>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                activeSection === s.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {s.label}
              {planExercises[s.id].length > 0 && (
                <span className="ml-1 bg-primary-100 text-primary-700 rounded-full px-1.5 text-xs">
                  {planExercises[s.id].length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {currentExercises.map((ex, i) => (
            <PlanExerciseRow
              key={i}
              ex={ex}
              index={i}
              exercises={exercises}
              exerciseTags={exerciseTags}
              tagAssignments={tagAssignments}
              onUpdate={(idx, field, value) => updateExercise(activeSection, idx, field, value)}
              onRemove={(idx) => removeExercise(activeSection, idx)}
            />
          ))}
        </div>

        <button
          onClick={() => addExercise(activeSection)}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} />
          Agregar ejercicio
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-3 pb-8">
        <button onClick={() => navigate(-1)} className="btn-secondary flex-1">Cancelar</button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <><Save size={16} /> Guardar plan</>
          )}
        </button>
      </div>
    </div>
  )
}
